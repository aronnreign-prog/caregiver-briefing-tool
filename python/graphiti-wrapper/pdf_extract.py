import os
import asyncio
import base64
import logging
import httpx
import fitz

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
MODEL = os.getenv("LAYER_1_VISION_MODEL", "nvidia/nemotron-nano-12b-v2-vl:free")

SYSTEM_PROMPT = (
    "You are a medical document analyzer. Extract ALL text from this medical document page.\n"
    "Include:\n"
    "- All medications (name, dose, frequency, prescriber)\n"
    "- All lab values (test name, value, unit, reference range, date)\n"
    "- All diagnoses/conditions\n"
    "- All allergies\n"
    "- Provider names and specialties\n"
    "- Dates (of service, of lab draw, of prescription)\n"
    "- Patient demographics\n"
    "Preserve the structure. Output as structured text."
)

HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://caregiver-briefing-tool.local",
    "X-Title": "Caregiver Briefing Tool",
}

# ---------------------------------------------------------------------------
# Retry helper — exponential backoff with jitter, respects Retry-After header
# This is standard production practice for any paid or free LLM API.
# ---------------------------------------------------------------------------
MAX_RETRIES = 4
BASE_DELAY_S = 2.0   # 2s → 4s → 8s → 16s


async def _post_with_retry(client: httpx.AsyncClient, url: str, payload: dict) -> dict:
    """POST to OpenRouter with exponential backoff on 429/500/timeout."""
    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = await client.post(url, headers=HEADERS, json=payload, timeout=90.0)

            # Rate limited — respect the Retry-After header if present
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("retry-after", BASE_DELAY_S * (2 ** attempt)))
                logger.warning(f"Rate limited (429). Waiting {retry_after:.1f}s before retry {attempt + 1}/{MAX_RETRIES}.")
                await asyncio.sleep(retry_after)
                last_error = httpx.HTTPStatusError(f"429 Rate Limited", request=resp.request, response=resp)
                continue

            # Transient server error — retry with backoff
            if resp.status_code >= 500:
                delay = BASE_DELAY_S * (2 ** attempt)
                logger.warning(f"Server error {resp.status_code}. Waiting {delay:.1f}s before retry {attempt + 1}/{MAX_RETRIES}.")
                await asyncio.sleep(delay)
                last_error = httpx.HTTPStatusError(f"{resp.status_code} Server Error", request=resp.request, response=resp)
                continue

            resp.raise_for_status()
            return resp.json()

        except httpx.TimeoutException as e:
            delay = BASE_DELAY_S * (2 ** attempt)
            logger.warning(f"Timeout on attempt {attempt + 1}/{MAX_RETRIES}. Waiting {delay:.1f}s.")
            await asyncio.sleep(delay)
            last_error = e
            continue

        except httpx.HTTPStatusError as e:
            # 4xx that isn't 429 — not retryable
            if e.response.status_code < 500 and e.response.status_code != 429:
                raise
            last_error = e
            continue

    raise RuntimeError(f"All {MAX_RETRIES} retries exhausted. Last error: {last_error}")


async def extract_pdf_text(pdf_bytes: bytes, model_override: str | None = None) -> dict:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = doc.page_count
    model = model_override or MODEL

    page_texts = []
    failures = 0

    async with httpx.AsyncClient() as client:
        for i in range(pages):
            page = doc[i]
            pix = page.get_pixmap(dpi=150)
            png = pix.tobytes("png")
            b64 = base64.b64encode(png).decode("utf-8")

            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract text from this page."},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                        ],
                    },
                ],
                "temperature": 0.0,
            }

            try:
                data = await _post_with_retry(client, f"{OPENROUTER_BASE_URL}/chat/completions", payload)
                content = data["choices"][0]["message"]["content"]
                page_texts.append(content)
                # Small courtesy delay between pages to avoid burst rate limits
                if i < pages - 1:
                    await asyncio.sleep(1.0)
            except Exception as e:
                logger.error(f"Failed to extract page {i + 1} after all retries: {e}")
                page_texts.append("")
                failures += 1

    doc.close()

    if failures == pages and pages > 0:
        raise RuntimeError(f"All {pages} pages failed to extract. Check OpenRouter API key and rate limits.")

    parts = []
    for i, text in enumerate(page_texts):
        parts.append(f"--- Page {i + 1} ---\n{text}")
    full_text = "\n".join(parts)

    return {"extracted_text": full_text, "page_count": pages}

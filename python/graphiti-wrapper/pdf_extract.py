import os
import asyncio
import base64
import logging
import httpx
import fitz

from model_resolver import get_vision_model_chain, resolve_model
from gemini_ocr import extract_page, has_gemini_keys

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
VISION_MODEL_CHAIN = get_vision_model_chain()

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

    page_texts = []
    failures = 0

    async with httpx.AsyncClient() as client:
        for i in range(pages):
            page = doc[i]
            
            # --- Primary: Try PyMuPDF native text extraction first ---
            # Digital PDFs (lab reports, EHR summaries) have embedded text.
            # Native extraction takes 0.001s, is 100% accurate, and avoids AI vision costs/errors.
            native_text = page.get_text("text").strip()
            
            # If native text is substantial (e.g. > 40 chars), use it directly
            if len(native_text) > 40 and "user safety:" not in native_text.lower():
                logger.info(f"Page {i + 1}/{pages}: Extracted {len(native_text)} chars via native PDF text parser.")
                page_texts.append(native_text)
                continue

            # --- Fallback: Call Vision AI model for scanned/image pages ---
            pix = page.get_pixmap(dpi=150)
            png = pix.tobytes("png")
            b64 = base64.b64encode(png).decode("utf-8")

            page_succeeded = False

            # --- Try Gemini first (3-key pool, free tier) ---
            if has_gemini_keys():
                try:
                    text = await extract_page(b64, user_prompt="Extract text from this page.", page_label=f"pg{i+1}")
                    page_texts.append(text)
                    page_succeeded = True
                except Exception as e:
                    logger.warning(f"Gemini OCR failed for page {i + 1}/{pages}: {e}. Falling back to OpenRouter.")

            if not page_succeeded:
                chain = [model_override] if model_override else VISION_MODEL_CHAIN

                for model_name in chain:
                    payload = {
                        "model": model_name,
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
                        content = data["choices"][0]["message"]["content"].strip()
                    
                        # Reject safety preamble responses (e.g. "User Safety: safe")
                        if "user safety:" in content.lower() or len(content) < 15:
                            logger.warning(f"Vision model {model_name} returned safety preamble or trivial output: '{content}'. Trying native/next...")
                            if native_text:
                                content = native_text
                            else:
                                continue

                        page_texts.append(content)
                        page_succeeded = True
                        break
                    except Exception as e:
                        logger.warning(f"Vision model {model_name} failed for page {i + 1} ({e}). Trying next model...")
                        continue

            if not page_succeeded:
                if native_text:
                    logger.info(f"Page {i + 1}/{pages}: Falling back to native text ({len(native_text)} chars).")
                    page_texts.append(native_text)
                else:
                    logger.error(f"Failed to extract page {i + 1} with all available models.")
                    page_texts.append("")
                    failures += 1

            if i < pages - 1 and page_succeeded:
                await asyncio.sleep(0.5)

    doc.close()

    if failures == pages and pages > 0:
        if has_gemini_keys():
            raise RuntimeError(
                f"All {pages} pages failed to extract. Check GEMINI_API_KEYS and rate limits "
                f"(Gemini and OpenRouter chains both exhausted, or native text unavailable)."
            )
        raise RuntimeError(
            f"All {pages} pages failed to extract. Check OPENROUTER_API_KEY and rate limits "
            f"(no native text available)."
        )

    parts = []
    for i, text in enumerate(page_texts):
        parts.append(f"--- Page {i + 1} ---\n{text}")
    full_text = "\n".join(parts)

    return {"extracted_text": full_text, "page_count": pages}

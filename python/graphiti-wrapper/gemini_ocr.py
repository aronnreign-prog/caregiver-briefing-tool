import os
import asyncio
import logging
import itertools
import time
import httpx

logger = logging.getLogger(__name__)

# --- Config ---
_GEMINI_API_KEYS = [
    k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()
]
_GEMINI_MODELS = [
    "gemini-3.1-flash-lite",
    "gemini-3-flash",
]
_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
_MAX_RETRIES = 5
_BASE_DELAY_S = 2.0
_TIMEOUT_S = 90.0

_key_pool = itertools.cycle(_GEMINI_API_KEYS) if _GEMINI_API_KEYS else None

_SYSTEM_PROMPT = (
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


class _RateLimited(Exception):
    pass


class _ServerError(Exception):
    pass


class _NonRetryable(Exception):
    pass


class GeminiExhaustedError(RuntimeError):
    pass


def has_gemini_keys() -> bool:
    return bool(_GEMINI_API_KEYS)


async def extract_page(
    png_base64: str,
    user_prompt: str = "Extract text from this page.",
    page_label: str = "",
) -> str:
    if not _key_pool:
        raise RuntimeError("No Gemini API keys configured (GEMINI_API_KEYS env is empty)")

    label = f" page={page_label}" if page_label else ""

    for model_id in _GEMINI_MODELS:
        for attempt in range(_MAX_RETRIES):
            t0 = time.time()
            key = next(_key_pool)
            key_preview = f"...{key[-6:]}" if len(key) > 10 else key

            try:
                text = await _call_gemini(model_id, key, png_base64, user_prompt)
                dur_ms = (time.time() - t0) * 1000
                logger.info(
                    f"[timing] gemini page ({model_id}{label}, key={key_preview}): "
                    f"{dur_ms:.0f}ms (attempt {attempt + 1})"
                )
                return text

            except _NonRetryable:
                logger.warning(
                    f"[GEMINI] {model_id} non-retryable failure "
                    f"(attempt {attempt + 1}). Skipping model."
                )
                break

            except _RateLimited:
                delay = _BASE_DELAY_S * (2**attempt)
                logger.warning(
                    f"[GEMINI] {model_id} 429 rate-limited at key {key_preview} "
                    f"(attempt {attempt + 1}/{_MAX_RETRIES}). Backing off {delay:.1f}s"
                )
                await asyncio.sleep(delay)
                continue

            except _ServerError:
                delay = _BASE_DELAY_S * (2**attempt)
                logger.warning(
                    f"[GEMINI] {model_id} server error "
                    f"(attempt {attempt + 1}/{_MAX_RETRIES}). Backing off {delay:.1f}s"
                )
                await asyncio.sleep(delay)
                continue

            except (httpx.TimeoutException, asyncio.TimeoutError):
                delay = _BASE_DELAY_S * (2**attempt)
                logger.warning(
                    f"[GEMINI] {model_id} timeout "
                    f"(attempt {attempt + 1}/{_MAX_RETRIES}). Backing off {delay:.1f}s"
                )
                await asyncio.sleep(delay)
                continue

        logger.warning(
            f"[GEMINI] Model {model_id} exhausted after {_MAX_RETRIES} retries. "
            "Trying next model."
        )

    raise GeminiExhaustedError(
        f"[GEMINI] All models ({len(_GEMINI_MODELS)}) and keys exhausted. OCR failed."
    )


async def _call_gemini(
    model: str, api_key: str, png_b64: str, user_prompt: str
) -> str:
    url = f"{_BASE_URL}/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [
            {
                "parts": [
                    {"inlineData": {"mimeType": "image/png", "data": png_b64}},
                    {"text": user_prompt},
                ]
            }
        ],
        "systemInstruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "generationConfig": {"temperature": 0.0},
    }

    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code == 429:
        raise _RateLimited()

    if resp.status_code >= 500:
        raise _ServerError()

    if resp.status_code >= 400:
        text_preview = (resp.text or "")[:200]
        raise _NonRetryable(f"HTTP {resp.status_code}: {text_preview}")

    data = resp.json()
    candidates = data.get("candidates", [])

    if not candidates:
        raise _NonRetryable("No candidates returned — likely blocked by safety filter")

    finish_reason = candidates[0].get("finishReason", "")
    if finish_reason == "SAFETY":
        raise _NonRetryable("Gemini blocked response: SAFETY finish reason")

    parts = candidates[0].get("content", {}).get("parts", [])
    if not parts:
        raise _NonRetryable("Gemini returned empty parts array")

    content = parts[0].get("text", "")

    if len(content) < 15 or "user safety:" in content.lower():
        raise _NonRetryable(f"Gemini returned trivial/safety response: '{content[:80]}'")

    return content.strip()

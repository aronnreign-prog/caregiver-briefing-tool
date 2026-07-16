import os
import json
import logging
import httpx

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
EXTRACT_MODEL = os.getenv("ENTITY_EXTRACT_MODEL", "deepseek/deepseek-chat-v3-0324:free")

SYSTEM_PROMPT = """You are a clinical entity extraction engine. From the given medical text, extract:
1. medications — each with a "name" (the drug name) and optional "dosage", "frequency", "route", "form", "strength", "duration".
2. lab_values — each with "test" (the lab/test name, lowercase), "value" (numeric value as a string), and "unit" (optional).

Return ONLY a JSON object with exactly two keys: "medications" (array) and "lab_values" (array).
If nothing is found, return empty arrays. Do not include any explanatory text outside the JSON."""

HEADERS = {
    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://caregiver-briefing-tool.local",
    "X-Title": "Caregiver Briefing Tool",
}


async def fetch_rxnorm_code(drug_name: str) -> str | None:
    """Fetch RxNorm CUI for a given drug name using NIH RxNav API."""
    try:
        url = f"https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term={drug_name}&maxEntries=1"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                approx_group = data.get("approximateGroup", {})
                candidates = approx_group.get("candidate", [])
                if candidates:
                    return candidates[0].get("rxcui")
    except Exception as e:
        logger.warning(f"Failed to fetch RxNorm for {drug_name}: {e}")
    return None


async def fetch_icd10_code(condition_name: str) -> str | None:
    """Fetch ICD-10 code for a given condition using NIH ClinicalTables API."""
    try:
        url = f"https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms={condition_name}&maxList=1"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                if len(data) >= 4 and data[3]:
                    # data[3] is an array of [code, name]
                    return data[3][0][0]
    except Exception as e:
        logger.warning(f"Failed to fetch ICD-10 for {condition_name}: {e}")
    return None


async def extract_entities(text: str) -> dict:
    """
    Extract medications and lab values from text using an OpenRouter LLM.
    Returns {"medications": [...], "lab_values": [...]}.
    """
    if not OPENROUTER_API_KEY:
        logger.error("OPENROUTER_API_KEY not set. Cannot extract entities via LLM.")
        return {"medications": [], "lab_values": []}

    payload = {
        "model": EXTRACT_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.0,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=HEADERS,
                json=payload,
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)

        medications = parsed.get("medications", [])
        lab_values = parsed.get("lab_values", [])

        # Enrich medications with RxNorm codes (best-effort, non-blocking).
        for med in medications:
            if "name" in med and "rxcui" not in med:
                rxcui = await fetch_rxnorm_code(med["name"])
                if rxcui:
                    med["rxcui"] = rxcui

        return {
            "medications": medications,
            "lab_values": lab_values,
        }
    except Exception as e:
        logger.error(f"OpenRouter entity extraction failed: {e}")
        return {"medications": [], "lab_values": []}

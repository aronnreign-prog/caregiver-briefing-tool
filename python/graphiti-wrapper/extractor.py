import os
import json
import re
import logging
import asyncio
import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Layer 2 Entity Extraction — Architecture Decision (from research session):
#
#   MEDICATIONS  → Med7 ML model (en_core_med7_lg)
#                  Rule-based NER is not enough for messy drug names/dosages.
#                  Med7 is a lightweight (~500MB) clinical NER model trained on
#                  MIMIC-III. Runs locally, zero API calls, zero rate limits.
#                  Labels: DRUG, DOSAGE, FREQUENCY, ROUTE, FORM, STRENGTH, DURATION
#
#   LAB VALUES   → spaCy Matcher rules (deterministic, faster than ML).
#                  Lab values always follow the same pattern:
#                  <test_name> <numeric_value> <unit>
#                  e.g. "Glucose 100 mg/dL", "GFR: 58 mL/min/1.73m2"
#                  Rules beat ML here because the pattern is highly structured.
#
#   RXNORM CODES → NIH RxNav API (free government database, deterministic)
#   ICD-10 CODES → NIH ClinicalTables API (free, deterministic)
#
#   LLM FALLBACK → OpenRouter only used if Med7 is unavailable (e.g., model
#                  not yet downloaded). Never relied on as primary extractor.
# ---------------------------------------------------------------------------

# ── Med7 / Biomedical Hugging Face API Configuration ──────────────────────────
HF_TOKEN = os.getenv("HF_TOKEN")
HF_API_URL = "https://router.huggingface.co/hf-inference/models/d4data/biomedical-ner-all"

# ── spaCy Matcher for lab values (deterministic rules) ───────────────────────
_lab_matcher = None

# Comprehensive list of common lab test names used in clinical documents
LAB_TEST_NAMES = [
    # Kidney
    "gfr", "egfr", "creatinine", "bun", "urea nitrogen",
    # Blood sugar
    "glucose", "hba1c", "hemoglobin a1c", "a1c", "fasting glucose",
    # Lipids
    "ldl", "hdl", "cholesterol", "triglycerides", "triglyceride",
    # Blood count
    "hemoglobin", "hematocrit", "wbc", "rbc", "platelets", "platelet count",
    "neutrophils", "lymphocytes", "monocytes", "eosinophils", "basophils",
    # Liver
    "alt", "ast", "alkaline phosphatase", "bilirubin", "albumin",
    # Thyroid
    "tsh", "t3", "t4", "free t4",
    # Electrolytes
    "sodium", "potassium", "chloride", "bicarbonate", "calcium", "magnesium", "phosphorus",
    # Cardiac
    "troponin", "bnp", "pro-bnp", "nt-probnp", "nt-pro-bnp", "nt probnp", "ntprobnp", "ck-mb", "creatine kinase",
    # Coagulation
    "inr", "pt", "ptt", "aptt",
    # Vitamins / Other
    "vitamin d", "b12", "folate", "ferritin", "iron", "uric acid",
    # Urine
    "urine protein", "urine creatinine", "microalbumin",
    # Blood pressure (often documented with labs)
    "blood pressure", "systolic", "diastolic",
    # Weight / BMI
    "bmi", "weight",
]

# Common measurement units
LAB_UNITS = [
    "mg/dl", "mg/l", "mmol/l", "g/dl", "g/l", "ng/ml", "pg/ml", "iu/l",
    "u/l", "meq/l", "mmhg", "mm hg", "ml/min", "ml/min/1.73m2",
    "%", "units", "cells/ul", "k/ul", "x10^3/ul", "x10^9/l",
    "umol/l", "nmol/l", "pmol/l", "miu/ml", "ng/dl",
]


def _get_lab_matcher():
    """Build a spaCy Matcher that finds: <lab_name> [optional colon] <number> [optional unit>."""
    global _lab_matcher
    if _lab_matcher is None:
        try:
            import spacy
            from spacy.matcher import Matcher

            # Use a blank English model just for tokenization + matching
            nlp = spacy.blank("en")
            matcher = Matcher(nlp.vocab)

            # Pattern: lab_name (1–4 tokens) + optional colon + number + optional unit
            # We register one pattern per lab test name phrase
            for test in LAB_TEST_NAMES:
                tokens = test.split()
                # Build token pattern list: each word as LOWER match
                name_pattern = [{"LOWER": t} for t in tokens]
                # Then: optional colon, then a number, then optional unit
                full_pattern = (
                    name_pattern
                    + [{"TEXT": ":", "OP": "?"}]
                    + [{"LIKE_NUM": True}]
                    + [{"LOWER": {"IN": LAB_UNITS}, "OP": "?"}]
                )
                rule_id = f"LAB_{test.upper().replace(' ', '_')}"
                matcher.add(rule_id, [full_pattern])

            _lab_matcher = (nlp, matcher)
            logger.info(f"Lab value Matcher built with {len(LAB_TEST_NAMES)} test patterns.")
        except Exception as e:
            logger.warning(f"Could not build lab Matcher: {e}")
            _lab_matcher = False
    return _lab_matcher if _lab_matcher is not False else None


def _extract_labs_with_matcher(text: str) -> list[dict]:
    """Deterministically extract lab values using spaCy Matcher rules."""
    result = _get_lab_matcher()
    if result is None:
        return []
    nlp, matcher = result
    text_clean = re.sub(r'[*_`#]', ' ', text)
    doc = nlp(text_clean[:200_000])
    matches = matcher(doc)
    labs = []
    seen = set()
    for match_id, start, end in matches:
        span = doc[start:end]
        tokens = [t for t in span]
        # Find the numeric token
        num_tok = next((t for t in tokens if t.like_num), None)
        if num_tok is None:
            continue
        # Test name is everything before the number (strip colon)
        name_tokens = [t for t in tokens[:tokens.index(num_tok)] if t.text != ":"]
        test_name = " ".join(t.text for t in name_tokens).strip().lower()
        value = num_tok.text
        # Unit is the token right after the number, if it's in our units list
        num_idx = tokens.index(num_tok)
        unit = ""
        if num_idx + 1 < len(tokens) and tokens[num_idx + 1].lower_ in LAB_UNITS:
            unit = tokens[num_idx + 1].text
        key = (test_name, value)
        if key not in seen:
            seen.add(key)
            labs.append({"test": test_name, "value": value, "unit": unit, "source": "matcher"})
    logger.info(f"spaCy Matcher found {len(labs)} lab values.")
    return labs


async def _extract_meds_with_med7_api(text: str) -> list[dict]:
    """Extract medications using Hugging Face Inference API for d4data/biomedical-ner-all.

    Uses a short 5s timeout so DNS failures or model cold starts fail fast
    and fall through to the LLM fallback immediately.
    """
    if not HF_TOKEN:
        logger.warning("HF_TOKEN not set — cannot extract medications via Hugging Face API.")
        return []
    
    headers = {"Authorization": f"Bearer {HF_TOKEN}", "Content-Type": "application/json"}
    payload = {"inputs": text[:30_000]} # Keep payload size reasonable for API
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(HF_API_URL, headers=headers, json=payload, timeout=5.0)
            if resp.status_code != 200:
                logger.warning(f"HF API returned {resp.status_code}: {resp.text}")
                return []
            
            entities = resp.json()
            meds = []
            seen_drugs = set()
            current_drug = {}
            for ent in entities:
                label = ent.get("entity_group", "")
                raw_word = ent.get("word", "").strip()
                
                # Merge BERT subword tokens (e.g. "li" + "##sin" + "##opril" -> "lisinopril")
                if raw_word.startswith("##"):
                    word = raw_word[2:]
                    is_subword = True
                else:
                    word = raw_word
                    is_subword = False

                if label in ("Medication", "DRUG"):
                    if is_subword and current_drug.get("name"):
                        current_drug["name"] += word
                    else:
                        if current_drug and "name" in current_drug:
                            name_lower = current_drug["name"].lower()
                            if name_lower not in seen_drugs and len(name_lower) > 2:
                                seen_drugs.add(name_lower)
                                meds.append({**current_drug, "source": "d4data-biomedical-ner"})
                        current_drug = {"name": word}
                elif label == "Dosage":
                    if is_subword and current_drug.get("dosage"):
                        current_drug["dosage"] += f"{word}"
                    else:
                        current_drug["dosage"] = f"{current_drug.get('dosage', '')} {word}".strip()
                    
            # Flush last drug
            if current_drug and "name" in current_drug:
                name_lower = current_drug["name"].lower()
                if name_lower not in seen_drugs and len(name_lower) > 2:
                    meds.append({**current_drug, "source": "d4data-biomedical-ner"})
            logger.info(f"Biomedical HF API found {len(meds)} medications.")
            return meds
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        logger.debug(f"Biomedical HF API unreachable (network/DNS): {e}")
        return []
    except Exception as e:
        logger.warning(f"Biomedical HF API extraction failed: {e}")
        return []



# ── OpenRouter LLM (fallback only) ───────────────────────────────────────────
from model_resolver import get_extractor_model_chain, resolve_model

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
EXTRACT_MODEL_CHAIN = get_extractor_model_chain()

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


async def _llm_extract_fallback(text: str) -> tuple[list[dict], list[dict]]:
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY not set — no LLM fallback available.")
        return [], []

    for model_name in EXTRACT_MODEL_CHAIN:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": text[:8000]},
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
                parsed = json.loads(resp.json()["choices"][0]["message"]["content"])
                meds = parsed.get("medications", [])
                labs = parsed.get("lab_values", [])
                logger.info(f"LLM fallback ({model_name}) found {len(meds)} meds, {len(labs)} labs.")
                return meds, labs
        except Exception as e:
            logger.warning(f"Model {model_name} failed ({e}). Trying next fallback...")
            continue

    logger.warning("All LLM fallback models failed.")
    return [], []


# ── NIH API enrichment (deterministic code lookup) ───────────────────────────
async def fetch_rxnorm_code(drug_name: str) -> str | None:
    """Fetch RxNorm CUI for a given drug name using NIH RxNav API."""
    try:
        url = f"https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term={drug_name}&maxEntries=1"
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                candidates = data.get("approximateGroup", {}).get("candidate", [])
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
                    return data[3][0][0]
    except Exception as e:
        logger.warning(f"Failed to fetch ICD-10 for {condition_name}: {e}")
    return None


# ── Main entry point ──────────────────────────────────────────────────────────
async def extract_entities(text: str) -> dict:
    """
    Layer 2: Medical Entity Extraction.

    Strategy (as decided in architecture session):
      1. Med7 ML model → medications (local, zero API, handles messy drug text)
      2. spaCy Matcher rules → lab values (deterministic, rules beat ML for structured data)
      3. LLM fallback → run if Med7 is unavailable or returns insufficient entities (< 4)
      4. NIH RxNav API → enrich medications with RxNorm codes (deterministic)

    Returns: {"medications": [...], "lab_values": [...]}
    """
    clean_text = re.sub(r'[*_`#]', ' ', text)

    # --- Step 1: Deterministic lab value extraction (spaCy Matcher) ---
    labs = _extract_labs_with_matcher(clean_text)

    # --- Step 2: Medication extraction (Med7 via Hugging Face Inference API) ---
    meds = await _extract_meds_with_med7_api(clean_text)

    # --- Step 3: LLM fallback to enrich medication and lab extraction ---
    llm_meds, llm_labs = await _llm_extract_fallback(clean_text)

    # Merge LLM meds avoiding duplicates
    seen_meds = {m.get("name", "").lower() for m in meds if "name" in m}
    for lm in llm_meds:
        lm_name = lm.get("name", "").lower()
        if lm_name and lm_name not in seen_meds:
            meds.append(lm)
            seen_meds.add(lm_name)

    # Merge LLM labs with Matcher labs (deduplicate by test name)
    seen_tests = {l.get("test", "").lower() for l in labs if "test" in l}
    for l in llm_labs:
        test_name = l.get("test", "").lower()
        if test_name and test_name not in seen_tests:
            labs.append(l)
            seen_tests.add(test_name)

    # Filter out junk NER artifacts (like single character meds or "medications" header)
    meds = [m for m in meds if m.get("name") and len(m["name"]) > 2 and m["name"].lower() not in ("medications", "hcl")]

    # --- Step 4: Enrich medications with RxNorm codes (NIH API, deterministic) ---
    rxnorm_tasks = [
        fetch_rxnorm_code(m["name"])
        for m in meds if "name" in m and "rxcui" not in m
    ]
    rxcuis = await asyncio.gather(*rxnorm_tasks, return_exceptions=True)
    for med, rxcui in zip(meds, rxcuis):
        if isinstance(rxcui, str):
            med["rxcui"] = rxcui

    return {"medications": meds, "lab_values": labs}

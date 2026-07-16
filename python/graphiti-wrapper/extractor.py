import spacy
from spacy.matcher import Matcher
import httpx
import logging

logger = logging.getLogger(__name__)

# Try loading the med7 model. In Docker, it should be installed via the wheel.
try:
    med7 = spacy.load("en_core_med7_lg")
    # med7 includes standard spaCy components, we can add our Matcher to it.
    matcher = Matcher(med7.vocab)
except Exception as e:
    logger.error(f"Failed to load en_core_med7_lg. Is it installed? Error: {e}")
    med7 = None
    matcher = None

# Set up the lab value Matcher patterns if med7 loaded successfully.
if matcher:
    # Common lab tests to extract
    lab_tests = [
        "creatinine", "gfr", "egfr", "hba1c", "wbc", "hemoglobin",
        "hgb", "sodium", "potassium", "bun", "alt", "ast", "tsh",
        "inr", "platelets", "hematocrit", "glucose", "ldl", "hdl"
    ]

    # Pattern: [test name] [optional colon/is] [number] [optional unit]
    pattern = [
        {"LOWER": {"IN": lab_tests}},
        {"IS_PUNCT": True, "OP": "?"},
        {"TEXT": {"REGEX": "^(was|is|of|at)$"}, "OP": "?"},
        {"LIKE_NUM": True},
        {"LOWER": {"REGEX": "^(mg|g|mmol|meq|k|iu|miu|%)"}, "OP": "?"},
        {"IS_PUNCT": True, "OP": "?"},
        {"LOWER": {"REGEX": "^(dl|l|ul|ml|min)$"}, "OP": "?"}
    ]
    matcher.add("LAB_VALUE", [pattern])

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
    Extract medications (Med7) and lab values (spaCy Matcher) from text.
    """
    if not med7 or not matcher:
        logger.error("Med7 model not loaded. Cannot extract entities.")
        return {"medications": [], "lab_values": []}

    doc = med7(text)
    
    # 1. Extract medications
    medications = []
    # Med7 entity labels: DRUG, DOSAGE, FREQUENCY, ROUTE, FORM, STRENGTH, DURATION
    # Group entities by sentence to assemble complex medication regimens
    for sent in doc.sents:
        drug = None
        attrs = {}
        for ent in sent.ents:
            if ent.label_ == "DRUG":
                drug = ent.text
            elif ent.label_ in ["DOSAGE", "FREQUENCY", "ROUTE", "FORM", "STRENGTH", "DURATION"]:
                attrs[ent.label_.lower()] = ent.text
        
        if drug:
            # Look up RxNorm
            rxcui = await fetch_rxnorm_code(drug)
            med_entry = {
                "name": drug,
                "rxcui": rxcui,
                **attrs
            }
            medications.append(med_entry)

    # 2. Extract lab values using Matcher
    lab_values = []
    matches = matcher(doc)
    for match_id, start, end in matches:
        span = doc[start:end]
        
        # Parse the span into test, value, and unit
        test_name = None
        value = None
        unit_parts = []
        
        for token in span:
            if token.lower_ in lab_tests:
                test_name = token.lower_
            elif token.like_num:
                value = token.text
            elif not token.is_punct and not token.lower_ in ["was", "is", "of", "at"]:
                # If it's not the test name, not a number, and not a filler/punct, it's likely a unit part
                if token.lower_ != test_name:
                    unit_parts.append(token.text)
        
        unit = "".join(unit_parts) if unit_parts else None
        
        if test_name and value:
            lab_values.append({
                "test": test_name,
                "value": value,
                "unit": unit
            })

    return {
        "medications": medications,
        "lab_values": lab_values
    }

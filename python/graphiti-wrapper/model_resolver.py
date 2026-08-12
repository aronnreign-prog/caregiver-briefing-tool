import os

# Groq model IDs — different format from OpenRouter slugs.
# No "provider/name" prefix, no ":free" suffix.
# Verify current list at: https://console.groq.com/docs/models
# or: curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"

# Models confirmed unavailable/deprecated on Groq.
DEPRECATED_MODELS = frozenset([
    # Add here if Groq removes a model
])

PRIMARY_MODEL = os.getenv("GROQ_MODEL", "")

# General-purpose fallback chain (used by Graphiti entity extraction)
FALLBACK_CHAIN = [
    PRIMARY_MODEL if PRIMARY_MODEL and PRIMARY_MODEL not in DEPRECATED_MODELS else "",
    "llama-3.3-70b-versatile",       # 70B, strong reasoning, 128k context
    "llama-3.1-8b-instant",          # 8B fast path fallback
    "gemma2-9b-it",                  # Gemma2 fallback
]

# Entity extraction — needs good instruction following + JSON output
EXTRACTOR_FALLBACK_CHAIN = [
    os.getenv("ENTITY_EXTRACT_MODEL", ""),
    "llama-3.3-70b-versatile",
    "deepseek-r1-distill-llama-70b",
    "llama-3.1-8b-instant",
]

# Reranking — needs good semantic reasoning, smaller model acceptable
RERANK_FALLBACK_CHAIN = [
    os.getenv("RERANK_MODEL", ""),
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
]

# Briefing / synthesis LLM — needs strong summarisation + clinical reasoning
LLM_CHAIN = [
    os.getenv("LLM_MODEL", ""),
    "llama-3.3-70b-versatile",
    "deepseek-r1-distill-llama-70b",
    "llama-3.1-8b-instant",
]

# Vision model chain — Groq does not serve vision models as of Aug 2026.
# Kept as empty so pdf_extract.py fast-paths to local OCR (RapidOCR/Tesseract).
VISION_FALLBACK_CHAIN = [
    os.getenv("LAYER_1_VISION_MODEL", ""),
]

# Metadata extraction (document date, patient name, etc.)
METADATA_FALLBACK_CHAIN = [
    os.getenv("METADATA_MODEL", ""),
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
]


def _clean(chain: list[str]) -> list[str]:
    return [m for m in chain if m and m not in DEPRECATED_MODELS]


def get_model_fallback_chain() -> list[str]:
    return _clean(FALLBACK_CHAIN)


def get_extractor_model_chain() -> list[str]:
    return _clean(EXTRACTOR_FALLBACK_CHAIN)


def get_vision_model_chain() -> list[str]:
    return _clean(VISION_FALLBACK_CHAIN)


def get_metadata_model_chain() -> list[str]:
    return _clean(METADATA_FALLBACK_CHAIN)


def get_rerank_model_chain() -> list[str]:
    return _clean(RERANK_FALLBACK_CHAIN)


def get_llm_model_chain() -> list[str]:
    return _clean(LLM_CHAIN)


def resolve_model(chain: list[str]) -> str | None:
    return chain[0] if chain else None
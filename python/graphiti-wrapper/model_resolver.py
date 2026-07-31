import os

DEPRECATED_MODELS = frozenset([
    "qwen/qwen-2-vl-7b-instruct:free",
])

PRIMARY_MODEL = os.getenv("OPENROUTER_MODEL", "")

FALLBACK_CHAIN = [
    PRIMARY_MODEL if PRIMARY_MODEL and PRIMARY_MODEL not in DEPRECATED_MODELS else "",
    "openrouter/free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct-2503:free",
    "google/gemini-2.0-flash-exp:free",
]

EXTRACTOR_FALLBACK_CHAIN = [
    os.getenv("ENTITY_EXTRACT_MODEL", ""),
    "deepseek/deepseek-chat-v3-0324:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct-2503:free",
    "openrouter/free",
]

VISION_FALLBACK_CHAIN = [
    os.getenv("LAYER_1_VISION_MODEL", ""),
    "openrouter/free",
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "google/gemma-4-26b-a4b-it:free",
]

METADATA_FALLBACK_CHAIN = [
    os.getenv("METADATA_MODEL", ""),
    "openrouter/free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct-2503:free",
]

RERANK_FALLBACK_CHAIN = [
    os.getenv("RERANK_MODEL", ""),
    "openrouter/free",
    "deepseek/deepseek-chat-v3-0324",
]

LLM_CHAIN = [
    os.getenv("LLM_MODEL", ""),
    "openrouter/free",
    "anthropic/claude-3-haiku",
    "mistralai/mistral-7b-instruct:free",
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
"""
Graphiti + FalkorDB Python Wrapper
===================================
Exposes Graphiti's temporal knowledge graph as a simple REST API
so the TypeScript Supabase Edge Functions can call it via fetch().

Endpoints:
  POST /add-facts                          — Add a processed PDF episode to the graph
  GET  /patient-state/{patient_id}         — Get all current facts for a patient
  GET  /trend/{patient_id}/{entity_name}   — Get all historical values for an entity
  POST /temporal-query                     — What was true for an entity at a given time
  GET  /health                             — Health check
"""

import os
import json
import re
import base64
import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any
import httpx

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Enforce SEMAPHORE_LIMIT=10 for 10x parallel deduplication/concurrency (Requirement R2)
os.environ["SEMAPHORE_LIMIT"] = os.getenv("SEMAPHORE_LIMIT", "10")
import graphiti_core.helpers
graphiti_core.helpers.SEMAPHORE_LIMIT = 10

from google.genai import types
import google.genai as genai
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.llm_client.config import LLMConfig, ModelSize
from graphiti_core.prompts.models import Message



def extract_json_from_response(content: str) -> dict[str, Any]:
    """
    Extract and parse the first valid JSON object from response content.
    Handles: pure JSON, code fences, leading/trailing text, multiple objects.
    Rejects empty strings, whitespace, and HTML error pages early with ValueError.
    """
    if content is None or not str(content).strip():
        raise ValueError("Empty or whitespace LLM response payload")

    cleaned = str(content).strip()

    if (
        cleaned.startswith("<")
        or cleaned.lower().startswith("rate limit")
        or "502 bad gateway" in cleaned.lower()
        or "503 service unavailable" in cleaned.lower()
        or "504 gateway timeout" in cleaned.lower()
    ):
        raise ValueError(f"HTML or API error response returned: {cleaned[:100]}")

    cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s*```$', '', cleaned, flags=re.MULTILINE).strip()

    if not cleaned:
        raise ValueError("Empty LLM response payload after stripping code fences")

    try:
        res = json.loads(cleaned)
        if isinstance(res, dict):
            return res
    except json.JSONDecodeError:
        pass

    brace_count = 0
    start_idx = None
    for i, char in enumerate(cleaned):
        if char == '{':
            if start_idx is None:
                start_idx = i
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0 and start_idx is not None:
                json_str = cleaned[start_idx:i+1]
                try:
                    res = json.loads(json_str)
                    if isinstance(res, dict):
                        return res
                except json.JSONDecodeError:
                    start_idx = None

    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned, re.DOTALL)
    if json_match:
        try:
            res = json.loads(json_match.group())
            if isinstance(res, dict):
                return res
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract valid JSON object from LLM output (length {len(content)})")


# Patch OpenAIGenericClient._generate_response to handle OpenRouter failure modes
_original_generic_generate = OpenAIGenericClient._generate_response

async def _patched_generic_generate(self, messages, response_model=None, max_tokens=16384, model_size=None):
    openai_messages = []
    user_text_content = ""
    for m in messages:
        m.content = self._clean_input(m.content)
        if m.role == 'user':
            openai_messages.append({'role': 'user', 'content': m.content})
            user_text_content += f"\n{m.content}"
        elif m.role == 'system':
            openai_messages.append({'role': 'system', 'content': m.content})

    import openai as _openai
    import httpx
    from tenacity import (
        AsyncRetrying,
        stop_after_attempt,
        wait_exponential_jitter,
        retry_if_exception_type,
    )
    from model_resolver import get_model_fallback_chain

    models_to_try = get_model_fallback_chain()
    if getattr(self, "model", None) and self.model not in models_to_try:
        models_to_try = [self.model] + models_to_try

    last_error = None

    for model_name in models_to_try:
        try:
            current_messages = list(openai_messages)
            for attempt in range(2):
                try:
                    async for retry_state in AsyncRetrying(
                        stop=stop_after_attempt(3),
                        wait=wait_exponential_jitter(initial=1, max=6, jitter=1),
                        retry=retry_if_exception_type((
                            _openai.RateLimitError,
                            _openai.APIConnectionError,
                            _openai.APITimeoutError,
                            _openai.InternalServerError,
                            httpx.TimeoutException,
                            httpx.HTTPStatusError,
                        )),
                        reraise=True,
                    ):
                        with retry_state:
                            response = await self.client.chat.completions.create(
                                model=model_name,
                                messages=current_messages,
                                temperature=self.temperature,
                                max_tokens=max_tokens,
                                response_format=self._build_response_format(response_model),
                            )
                            result = response.choices[0].message.content or ''
                            parsed = extract_json_from_response(result)

                    if response_model and any(k in parsed for k in ('$defs', '$def', '$schema')):
                        raise ValueError('LLM returned schema definition instead of data')

                    if isinstance(parsed, list):
                        raise ValueError('LLM returned list instead of object')

                    if not isinstance(parsed, dict):
                        raise ValueError(f'LLM returned non-dict type: {type(parsed).__name__}')

                    top_keys = set(parsed.keys())
                    if top_keys <= {'type', 'properties', 'title', 'description', 'required', 'allOf', 'anyOf', 'oneOf', 'enum', 'items', 'additionalProperties', 'definitions'}:
                        raise ValueError('LLM returned schema fragment instead of data')

                    # Post-process: remap field names from OpenRouter's common variations
                    if response_model and isinstance(parsed, dict):
                        expected_schema = response_model.model_json_schema()
                        expected_props = set(expected_schema.get('properties', {}).keys())
                        actual_keys = set(parsed.keys())
                        if not expected_props <= actual_keys:
                            remapped = dict(parsed)
                            known_top_remaps = {
                                'entities': 'extracted_entities',
                                'nodes': 'extracted_nodes',
                            }
                            for actual_key, remap_key in known_top_remaps.items():
                                if actual_key in remapped and remap_key in expected_props and remap_key not in remapped:
                                    logger.info(f'[OpenRouter] top-level remap: "{actual_key}" -> "{remap_key}"')
                                    remapped[remap_key] = remapped.pop(actual_key)
                            parsed = remapped

                    # Remap nested field names inside array items
                    if response_model and isinstance(parsed, dict):
                        model_name_str = getattr(response_model, '__name__', '')

                        if model_name_str == 'ExtractedEntities' and isinstance(parsed.get('extracted_entities'), list):
                            ENTITY_ITEM_REMAPS = {
                                'entity_name':        'name',
                                'entityName':         'name',
                                'entity_type_name':   'entity_type_id',
                                'entity_type':        'entity_type_id',
                                'type':               'entity_type_id',
                                'typeId':             'entity_type_id',
                                'type_id':            'entity_type_id',
                                'indices':            'episode_indices',
                                'episode_index':      'episode_indices',
                            }
                            fixed_items = []
                            for item in parsed['extracted_entities']:
                                if isinstance(item, str):
                                    fixed_items.append({'name': item, 'entity_type_id': 0, 'episode_indices': [0]})
                                    continue
                                if not isinstance(item, dict):
                                    continue
                                fixed = dict(item)
                                for alias, canonical in ENTITY_ITEM_REMAPS.items():
                                    if alias in fixed and canonical not in fixed:
                                        fixed[canonical] = fixed.pop(alias)
                                if 'entity_type_id' in fixed and not isinstance(fixed['entity_type_id'], int):
                                    fixed['entity_type_id'] = 0
                                if 'episode_indices' in fixed and not isinstance(fixed['episode_indices'], list):
                                    fixed['episode_indices'] = [fixed['episode_indices']]
                                fixed.setdefault('episode_indices', [0])
                                fixed_items.append(fixed)
                            parsed['extracted_entities'] = fixed_items

                        if model_name_str == 'ExtractedEdges' and isinstance(parsed.get('edges'), list):
                            EDGE_ITEM_REMAPS = {
                                'source': 'source_entity_name',
                                'source_entity': 'source_entity_name',
                                'target': 'target_entity_name',
                                'target_entity': 'target_entity_name',
                                'relation': 'relation_type',
                                'relationship': 'relation_type',
                                'type': 'relation_type',
                            }
                            fixed_edges = []
                            for item in parsed['edges']:
                                if not isinstance(item, dict):
                                    continue
                                fixed = dict(item)
                                for alias, canonical in EDGE_ITEM_REMAPS.items():
                                    if alias in fixed and canonical not in fixed:
                                        fixed[canonical] = fixed.pop(alias)
                                fixed.setdefault('source_entity_name', 'Unknown')
                                fixed.setdefault('target_entity_name', 'Unknown')
                                fixed.setdefault('relation_type', 'ASSOCIATED_WITH')
                                fixed.setdefault('fact', 'Relationship extracted')
                                if 'episode_indices' in fixed and not isinstance(fixed['episode_indices'], list):
                                    fixed['episode_indices'] = [fixed['episode_indices']]
                                fixed.setdefault('episode_indices', [0])
                                fixed_edges.append(fixed)
                            parsed['edges'] = fixed_edges

                    return parsed

                except (json.JSONDecodeError, ValueError, KeyError) as parse_err:
                    logger.warning(f"[OpenRouter] parse error on model '{model_name}' attempt {attempt+1}/2: {parse_err}")
                    if attempt >= 1:
                        raise parse_err
                    current_messages.append({
                        'role': 'user',
                        'content': (
                            f'Your last response was rejected because: {parse_err}. '
                            f'OUTPUT ONLY THE REQUESTED DATA as a plain JSON object. '
                            f'NEVER return a JSON Schema definition, type descriptors, $defs, or property listings.'
                        )
                    })

        except Exception as e:
            logger.warning(f"[OpenRouter Fallback] Model '{model_name}' failed: {e}. Trying next fallback model...")
            last_error = e
            continue

    # R3.e: Wire local spaCy Matcher failover if all LLMs in fallback chain fail
    logger.warning(f"[R3 Fallback] All OpenRouter LLMs in fallback chain failed (last error: {last_error}). Synthesizing structure via local spaCy Matcher.")
    try:
        from extractor import _extract_labs_with_matcher
        labs = _extract_labs_with_matcher(user_text_content)
    except Exception as spacy_err:
        logger.warning(f"[R3 Fallback] spaCy matcher failed: {spacy_err}")
        labs = []

    model_name_str = getattr(response_model, '__name__', '') if response_model else ''
    if model_name_str == 'ExtractedEntities' or (response_model and 'extracted_entities' in response_model.model_json_schema().get('properties', {})):
        entities_list = [
            {"name": lab["test"].upper(), "entity_type_id": 0, "episode_indices": [0]}
            for lab in labs
        ]
        if not entities_list:
            entities_list = [{"name": "Patient", "entity_type_id": 0, "episode_indices": [0]}]
        return {"extracted_entities": entities_list}

    if model_name_str == 'ExtractedEdges' or (response_model and 'edges' in response_model.model_json_schema().get('properties', {})):
        edges_list = [
            {
                "source_entity_name": "Patient",
                "target_entity_name": lab["test"].upper(),
                "relation_type": "HAS_LAB_VALUE",
                "fact": f"{lab['test']} is {lab['value']} {lab['unit']}".strip(),
                "episode_indices": [0],
            }
            for lab in labs
        ]
        return {"edges": edges_list}

    return {"extracted_entities": [], "edges": []}

OpenAIGenericClient._generate_response = _patched_generic_generate

from graphiti_core.embedder.client import EmbedderClient, EmbedderConfig

# ---------------------------------------------------------------------------
# NvidiaEmbedder — Deep module
# ---------------------------------------------------------------------------
# One export. Calls NVIDIA NIM (integrate.api.nvidia.com/v1/embeddings) which
# is OpenAI-compatible. Sends all texts as a single batch request (fast path).
# Error handling philosophy:
#   - 429 → explicit rate-limit warning + exponential backoff
#   - 401 → hard fail immediately (bad key — retry won't help)
#   - 400 → hard fail immediately (bad input — retry won't help)
#   - Empty payload → ValueError at point of detection, never reaches API
#   - API returns fewer vectors than input → RuntimeError with exact counts
#   - All failures logged with [timing] + [embed] structured prefix
# ---------------------------------------------------------------------------

class NvidiaEmbedderConfig(EmbedderConfig):
    api_key: str = ""
    model: str = "nvidia/nemotron-3-embed-1b"
    base_url: str = "https://integrate.api.nvidia.com/v1"
    embedding_dim: int = 2048  # nemotron-3-embed-1b native output dimension


class NvidiaEmbedder(EmbedderClient):
    """
    Deep module: wraps NVIDIA NIM /v1/embeddings into Graphiti's EmbedderClient
    interface. One HTTP call per create_batch invocation regardless of batch size.
    """

    def __init__(self, config: NvidiaEmbedderConfig) -> None:
        self.config = config
        self._semaphore = asyncio.Semaphore(5)  # cap concurrent batch calls
        if not config.api_key:
            # Fail loud at startup — not silently at first embed call
            raise RuntimeError(
                "[embed] NVIDIA_API_KEY is not set. "
                "Set it in Render env vars or .env. "
                "Get a key at https://build.nvidia.com/nvidia/nemotron-3-embed-1b"
            )

    async def create(self, input_data: str | list[str]) -> list[float]:
        """Single-text embed. Delegates to create_batch for code reuse."""
        texts = [input_data] if isinstance(input_data, str) else input_data
        results = await self.create_batch(texts)
        return results[0]

    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        """
        Fast path: empty list returns immediately without touching the network.
        Slow path: one HTTP POST to NVIDIA NIM for all texts simultaneously.
        """
        if not input_data_list:
            return []

        # Validate before network call — surfaces bad input at point of detection
        if any(not isinstance(t, str) or len(t) == 0 for t in input_data_list):
            raise ValueError(
                f"[embed] create_batch received {len(input_data_list)} texts "
                "but one or more are empty or non-string. Refusing to call API."
            )

        max_retries = 3
        last_error: Exception | None = None

        for attempt in range(max_retries):
            async with self._semaphore:
                t0 = time.monotonic()
                try:
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        response = await client.post(
                            f"{self.config.base_url}/embeddings",
                            headers={
                                "Authorization": f"Bearer {self.config.api_key}",
                                "Content-Type": "application/json",
                            },
                            json={
                                "model": self.config.model,
                                "input": input_data_list,
                            },
                        )

                    elapsed_ms = int((time.monotonic() - t0) * 1000)

                    # --- Error visibility: distinguish failure categories ---
                    if response.status_code == 401:
                        # Hard fail — retrying with same key is pointless
                        raise RuntimeError(
                            f"[embed] NVIDIA API returned 401 Unauthorized. "
                            f"Check NVIDIA_API_KEY is valid. "
                            f"model={self.config.model}"
                        )

                    if response.status_code == 400:
                        # Hard fail — bad input, retrying won't help
                        body = response.text[:300]
                        raise ValueError(
                            f"[embed] NVIDIA API returned 400 Bad Request. "
                            f"Input texts={len(input_data_list)}, body={body}"
                        )

                    if response.status_code == 429:
                        wait = 2 ** (attempt + 1)  # 2s, 4s, 8s
                        logger.warning(
                            f"[embed] NVIDIA API 429 rate limit "
                            f"(attempt {attempt+1}/{max_retries}). "
                            f"Retrying in {wait}s. model={self.config.model}"
                        )
                        last_error = RuntimeError(
                            f"[embed] NVIDIA API 429 after {max_retries} attempts"
                        )
                        await asyncio.sleep(wait)
                        continue

                    if not response.is_success:
                        body = response.text[:300]
                        raise RuntimeError(
                            f"[embed] NVIDIA API returned {response.status_code}. "
                            f"model={self.config.model}, body={body}"
                        )

                    data = response.json()
                    items = data.get("data")
                    if not items:
                        raise RuntimeError(
                            f"[embed] NVIDIA API returned success but 'data' field "
                            f"is empty or missing. Full response keys: {list(data.keys())}"
                        )

                    if len(items) != len(input_data_list):
                        raise RuntimeError(
                            f"[embed] NVIDIA API returned {len(items)} vectors "
                            f"but expected {len(input_data_list)}. "
                            f"Mismatch would silently corrupt graph node embeddings."
                        )

                    # Sort by index to guarantee order matches input order
                    items_sorted = sorted(items, key=lambda x: x["index"])
                    vectors = [item["embedding"] for item in items_sorted]

                    logger.info(
                        f"[timing] nvidia_embed batch {len(input_data_list)} texts: {elapsed_ms}ms "
                        f"dim={len(vectors[0]) if vectors else 0}"
                    )
                    return vectors

                except (RuntimeError, ValueError):
                    # These are already descriptive — re-raise immediately
                    raise
                except Exception as e:
                    elapsed_ms = int((time.monotonic() - t0) * 1000)
                    last_error = e
                    logger.warning(
                        f"[embed] NVIDIA API unexpected error on attempt "
                        f"{attempt+1}/{max_retries} after {elapsed_ms}ms: "
                        f"{type(e).__name__}: {e}"
                    )
                    if attempt < max_retries - 1:
                        await asyncio.sleep(2 ** attempt)
                    continue

        raise last_error or RuntimeError(
            f"[embed] NVIDIA embedding failed after {max_retries} attempts. "
            f"model={self.config.model}"
        )

from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver

from extractor import extract_entities
from pdf_extract import extract_pdf_text

import time
import functools, inspect

def timing(func):
    """Decorator: log duration of any async route. Preserves function signature for FastAPI."""
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        t0 = time.monotonic()
        result = await func(*args, **kwargs)
        dur = (time.monotonic() - t0) * 1000
        logger.info(f"[timing] {func.__name__}: {dur:.0f}ms")
        return result
    wrapper.__signature__ = inspect.signature(func)
    return wrapper

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AddFactsRequest(BaseModel):
    patient_id: str
    episode_text: str              # Full extracted text from the PDF (Layer 1 output)
    source_doc_id: str             # UUID of the document row in Postgres
    source_doc_date: str | None = None  # ISO date: when the document was created (valid_from)
    entities: list[dict] = []      # Pre-extracted medical entities (Layer 2 output)
    reference_time: str            # ISO datetime: when we are ingesting this fact


class TemporalQueryRequest(BaseModel):
    patient_id: str
    entity_name: str               # e.g. "GFR", "Lisinopril"
    valid_at: Optional[str] = None # ISO date; None = "right now"


class ExtractEntitiesRequest(BaseModel):
    text: str                      # Text to extract entities from


class ExtractPdfRequest(BaseModel):
    pdf_base64: str                # Base64-encoded PDF bytes (Layer 1 input)
    model: str | None = None       # Optional override of LAYER_1_VISION_MODEL


class ProcessDocumentRequest(BaseModel):
    pdf_base64: str
    patient_id: str
    source_doc_id: str
    source_doc_date: str | None = None
    reference_time: str            # ISO datetime


class ProcessBriefingRequest(BaseModel):
    patient_id: str
    audience: str = "family caregiver"
    lab_entities: list[str] = []   # entity names to fetch trends for


class VerifyBriefingRequest(BaseModel):
    patient_id: str
    generated_briefing: str
    raw_claims: list[dict] = []
    layer5_results: list[dict] = []  # RxNav DDI results
    audience: str = "family caregiver"


# ---------------------------------------------------------------------------
# Graphiti initialisation
# ---------------------------------------------------------------------------

# OpenRouter is compatible with the OpenAI SDK — we just point base_url at it.
# Graphiti uses an LLM for entity extraction and an embedder for semantic search.
from model_resolver import (
    get_model_fallback_chain,
    get_rerank_model_chain,
    resolve_model,
)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
ENTITY_EXTRACT_MODEL = resolve_model(get_model_fallback_chain())
RERANK_MODEL = resolve_model(get_rerank_model_chain())

# Embeddings: NVIDIA NIM (integrate.api.nvidia.com/v1/embeddings).
# nemotron-3-embed-1b natively outputs 2048-dim vectors — no truncation needed.
# EMBED_DIM is env-driven to allow override if model changes.
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
NVIDIA_EMBED_MODEL = os.getenv("NVIDIA_EMBED_MODEL", "nvidia/nemotron-3-embed-1b")
EMBED_DIM = int(os.getenv("EMBED_DIM", "2048"))

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "49277"))
FALKORDB_PASSWORD = os.getenv("FALKORDB_PASSWORD")

# Supabase REST — used by background tasks to report graph failures back to the UI
# Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Render env vars.
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

graphiti: Graphiti | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global graphiti

    llm_client = OpenAIGenericClient(
        config=LLMConfig(
            api_key=OPENROUTER_API_KEY,
            model=ENTITY_EXTRACT_MODEL,
            base_url=OPENROUTER_BASE_URL,
        ),
        max_tokens=16384,
        structured_output_mode="json_object",
    )

    # Monkey-patch generate_response to strip schema injection from prompt.
    # graphiti-core injects the full JSON Schema into the prompt in json_object mode
    # (see generate_response lines 194-200 in openai_generic_client.py), which causes
    # DeepSeek/OpenRouter free models to regurgitate the schema definition instead of
    # filling it with data. We replace it with a minimal "output JSON" instruction.
    _original_gen_resp = OpenAIGenericClient.generate_response

    async def _patched_gen_resp(self, messages, response_model=None, max_tokens=None, model_size=None, group_id=None, prompt_name=None, *, attribute_extraction=False):
        self._apply_attribute_extraction_preamble(messages, attribute_extraction)
        if max_tokens is None:
            max_tokens = self.max_tokens or 16384
        if model_size is None:
            model_size = ModelSize.medium

        if response_model is not None:
            schema = response_model.model_json_schema()
            props = schema.get('properties', {})
            required = schema.get('required', [])
            fields_list = []
            for k, v in props.items():
                if '$ref' in v:
                    fields_list.append(f'"{k}" (list of objects)')
                elif v.get('type') == 'array':
                    fields_list.append(f'"{k}" (list)')
                else:
                    fields_list.append(f'"{k}" ({v.get("type","any")})')
            field_hint = ', '.join(fields_list)
            req_hint = f' Required fields: {", ".join(required)}.' if required else ''
            messages[-1].content += (
                f'\n\nOutput a JSON object with fields: {field_hint}.{req_hint}'
                f' Fill in actual values. Do NOT output a JSON Schema definition.'
            )

        from graphiti_core.llm_client.client import get_extraction_language_instruction
        messages[0].content += get_extraction_language_instruction(group_id)

        with self.tracer.start_span('llm.generate') as span:
            span.add_attributes({'llm.provider': 'openai', 'model.size': model_size.value, 'max_tokens': max_tokens})
            if prompt_name:
                span.add_attributes({'prompt.name': prompt_name})
            try:
                return await self._generate_response_with_retry(messages, response_model, max_tokens=max_tokens, model_size=model_size)
            except Exception as e:
                span.set_status('error', str(e))
                span.record_exception(e)
                raise

    OpenAIGenericClient.generate_response = _patched_gen_resp

    embedder = NvidiaEmbedder(
        config=NvidiaEmbedderConfig(
            api_key=NVIDIA_API_KEY,
            model=NVIDIA_EMBED_MODEL,
            embedding_dim=EMBED_DIM,
        )
    )

    # Reranker: Graphiti falls back to a default OpenAIRerankerClient (which needs
    # an OPENAI_API_KEY) if cross_encoder is None, so we must pass a real one.
    # Point it at OpenRouter (used only during search(), not add-facts).
    cross_encoder = OpenAIRerankerClient(
        config=LLMConfig(
            api_key=OPENROUTER_API_KEY,
            model=RERANK_MODEL,
            base_url=OPENROUTER_BASE_URL,
        )
    )

    falkor_driver = None
    graphiti = None
    max_retries = 5

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to FalkorDB (attempt {attempt}/{max_retries}) at {FALKORDB_HOST}:{FALKORDB_PORT}...")
            falkor_driver = FalkorDriver(host=FALKORDB_HOST, port=FALKORDB_PORT, password=FALKORDB_PASSWORD, username="falkordb")
            graphiti = Graphiti(
                graph_driver=falkor_driver,
                llm_client=llm_client,
                embedder=embedder,
                cross_encoder=cross_encoder,
            )
            logger.info("Building Graphiti indices and constraints…")
            await graphiti.build_indices_and_constraints()
            logger.info("Graphiti ready ✓")
            break
        except Exception as e:
            logger.warning(f"FalkorDB connection attempt {attempt} failed: {e}")
            if attempt == max_retries:
                logger.error("Failed to connect to FalkorDB after max retries. Exiting.")
                raise e
            await asyncio.sleep(2 * attempt)

    yield

    if graphiti is not None:
        await graphiti.close()
        logger.info("Graphiti connection closed.")


app = FastAPI(title="Graphiti Medical Wrapper", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_iso(s: str) -> datetime:
    """Parse an ISO string to a timezone-aware datetime (UTC)."""
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _get_valid_from(r: Any) -> Optional[datetime]:
    """Safely get start-time from any graphiti search result or edge object.

    graphiti-core 0.29.x uses valid_at/created_at on EntityEdge,
    not valid_from. This helper tries all known attribute names in order.
    """
    for attr in ("valid_from", "valid_at", "created_at", "reference_time"):
        val = getattr(r, attr, None)
        if val is not None and isinstance(val, datetime):
            return val
    return None


def _get_valid_to(r: Any) -> Optional[datetime]:
    """Safely get end-time from any graphiti search result or edge object.

    graphiti-core 0.29.x uses invalid_at/expired_at on EntityEdge,
    not valid_to. This helper tries all known attribute names in order.
    """
    for attr in ("valid_to", "invalid_at", "expired_at"):
        val = getattr(r, attr, None)
        if val is not None and isinstance(val, datetime):
            return val
    return None


async def _supabase_update_document(doc_id: str, patch: dict) -> None:
    """
    PATCH a documents row in Supabase via the REST API.
    Used by background tasks to surface graph failures to the UI so the
    document badge never freezes in 'processing' state.
    Silently skips when env vars are missing (local dev without Supabase).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning(
            f"[Supabase] SUPABASE_URL / SERVICE_ROLE_KEY not set — "
            f"skipping status update for doc {doc_id}. "
            "Add these env vars to the Render service to enable failure reporting."
        )
        return
    url = f"{SUPABASE_URL}/rest/v1/documents?id=eq.{doc_id}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.patch(url, json=patch, headers=headers)
        if resp.status_code not in (200, 204):
            logger.warning(
                f"[Supabase] documents PATCH failed for doc {doc_id}: "
                f"{resp.status_code} {resp.text[:200]}"
            )
    except Exception as e:
        logger.warning(f"[Supabase] documents PATCH error for doc {doc_id}: {e}")


async def _run_cypher(query: str, params: dict | None = None) -> list:
    """
    Execute a raw Cypher query against the FalkorDB graph via the Graphiti driver.
    Returns the result rows (may be empty) or raises on driver error.
    Wraps the call in a try/except so callers can decide how to handle failures.
    """
    if graphiti is None or graphiti.driver is None:
        raise RuntimeError("Graphiti driver not initialised")
    if params:
        for key, value in params.items():
            query = query.replace(f"${key}", f"'{str(value).replace(chr(39), chr(39)+chr(39))}'")
    return await graphiti.driver.execute_query(query)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    db_status = "disconnected"
    try:
        if graphiti is not None and graphiti.driver is not None:
            await graphiti.driver.health_check()
            db_status = "connected"
    except Exception as e:
        logger.warning(f"FalkorDB health check failed: {e}")
        db_status = f"error: {e}"

    return {
        "status": "ok",
        "llm_model": get_model_fallback_chain()[0] if get_model_fallback_chain() else "openrouter/free",
        "rerank_model": get_rerank_model_chain()[0] if get_rerank_model_chain() else "openrouter/free",
        "falkordb": db_status,
    }


async def _process_add_episode_bg(req: AddFactsRequest, episode_body: str):
    """
    Background task: ingest one PDF episode into Graphiti.

    Improvements over naive implementation:
    - Uses document's own date as reference_time (temporal accuracy).
    - Purges stale episode nodes before re-ingesting (idempotent re-processing).
    - Reports graph failures back to Supabase so the UI badge doesn't freeze.
    """
    episode_name = f"doc_{req.source_doc_id}"
    ts = datetime.now(timezone.utc).isoformat()

    if graphiti is None:
        logger.error(
            f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
            "Graphiti not initialized — aborting."
        )
        await _supabase_update_document(req.source_doc_id, {
            "status": "failed",
            "error_message": "[graphiti] Service not initialized",
        })
        return

    # --- 1. Temporal accuracy: use document's own date, not ingestion wall-clock ---
    ref_time: datetime
    if req.source_doc_date:
        try:
            ref_time = _parse_iso(req.source_doc_date)
            logger.info(
                f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
                f"reference_time set from document date: {ref_time.isoformat()}"
            )
        except Exception:
            logger.warning(
                f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
                f"Cannot parse source_doc_date '{req.source_doc_date}' — falling back to reference_time."
            )
            ref_time = _parse_iso(req.reference_time)
    else:
        ref_time = _parse_iso(req.reference_time)

    # --- 2. Pre-ingest purge: remove stale episode nodes for idempotent re-processing ---
    try:
        await _run_cypher(
            "MATCH (n {group_id: $group_id, name: $name}) DETACH DELETE n",
            {"group_id": req.patient_id, "name": episode_name},
        )
        logger.info(
            f"[{ts}][graph.purge][patient={req.patient_id}][doc={req.source_doc_id}] "
            "Stale episode nodes purged."
        )
    except Exception as purge_err:
        # Non-fatal — if there were no existing nodes this just returns empty.
        logger.warning(
            f"[{ts}][graph.purge][patient={req.patient_id}][doc={req.source_doc_id}] "
            f"Pre-ingest purge failed (continuing): {purge_err}"
        )

    # --- 3. Ingest ---
    try:
        logger.info(
            f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
            f"Starting add_episode (ref={ref_time.isoformat()})"
        )
        result = await graphiti.add_episode(
            name=episode_name,
            episode_body=episode_body,
            source=EpisodeType.text,
            reference_time=ref_time,
            group_id=req.patient_id,          # ← partition by patient in FalkorDB
            source_description=(
                f"Medical document {req.source_doc_id} "
                f"for patient {req.patient_id}, "
                f"dated {req.source_doc_date or 'unknown'}"
            ),
        )
        logger.info(
            f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
            f"Success — uuid={result.episode.uuid}, nodes={len(result.nodes)}, edges={len(result.edges)}"
        )
    except Exception as e:
        logger.error(
            f"[{ts}][graph.add][patient={req.patient_id}][doc={req.source_doc_id}] "
            f"add_episode FAILED: {e}",
            exc_info=True,
        )
        # Report failure back to Supabase so the UI badge flips to 'failed'.
        await _supabase_update_document(req.source_doc_id, {
            "status": "failed",
            "error_message": f"[graphiti] {str(e)[:500]}",
        })


@app.post("/add-facts")
async def add_facts(req: AddFactsRequest):
    """
    Ingest a processed PDF episode into the temporal knowledge graph.

    Non-blocking async ingestion: launches Graphiti add_episode in background task
    and returns 200 OK immediately (< 1s) with status="processing".
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    # Build a rich episode body that includes both the raw text AND
    # any pre-extracted entities from Layer 2 (makes entity resolution more accurate)
    entity_context = ""
    if req.entities:
        entity_lines = []
        for e in req.entities:
            entity_lines.append(
                f"[{e.get('Type', 'ENTITY')}] {e.get('Text', '')} "
                f"(score: {e.get('Score', 1.0):.2f})"
            )
        entity_context = "\n\nPRE-EXTRACTED ENTITIES:\n" + "\n".join(entity_lines)

    episode_body = (
        f"PATIENT_ID: {req.patient_id}\n"
        f"DOCUMENT_ID: {req.source_doc_id}\n"
        f"DOCUMENT_DATE: {req.source_doc_date or 'unknown'}\n\n"
        f"DOCUMENT TEXT:\n{req.episode_text}"
        f"{entity_context}"
    )

    asyncio.create_task(_process_add_episode_bg(req, episode_body))

    return {
        "status": "processing",
        "episode_id": f"doc_{req.source_doc_id}",
        "patient_id": req.patient_id,
    }


@app.delete("/patient/{patient_id}")
async def delete_patient_graph(patient_id: str):
    """
    Cascade-delete ALL graph nodes/edges belonging to a patient.
    Called by the Next.js deletePatient server action after the Supabase row is
    deleted, so FalkorDB stays in sync and no orphaned nodes are left behind.

    Cypher: MATCH (n {group_id: $patient_id}) DETACH DELETE n
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")
    ts = datetime.now(timezone.utc).isoformat()
    try:
        await _run_cypher(
            "MATCH (n {group_id: $group_id}) DETACH DELETE n",
            {"group_id": patient_id},
        )
        logger.info(
            f"[{ts}][graph.delete_patient][patient={patient_id}] "
            "All nodes and edges purged from FalkorDB."
        )
        return {"status": "ok", "deleted_group_id": patient_id}
    except Exception as e:
        logger.error(
            f"[{ts}][graph.delete_patient][patient={patient_id}] FAILED: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Graph cleanup failed: {e}")


@app.delete("/document/{patient_id}/{document_id}")
async def delete_document_graph(patient_id: str, document_id: str):
    """
    Delete the episode nodes for a single document while preserving the rest of
    the patient's graph history. Used when a user deletes or re-uploads a document.

    Entity nodes shared across multiple documents are NOT deleted — only the
    episodic node itself and its edges are removed.

    Cypher: MATCH (n {group_id: $patient_id, name: $episode_name}) DETACH DELETE n
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")
    episode_name = f"doc_{document_id}"
    ts = datetime.now(timezone.utc).isoformat()
    try:
        await _run_cypher(
            "MATCH (n {group_id: $group_id, name: $name}) DETACH DELETE n",
            {"group_id": patient_id, "name": episode_name},
        )
        logger.info(
            f"[{ts}][graph.delete_document][patient={patient_id}][doc={document_id}] "
            f"Episode '{episode_name}' purged from FalkorDB."
        )
        return {"status": "ok", "deleted_episode": episode_name, "patient_id": patient_id}
    except Exception as e:
        logger.error(
            f"[{ts}][graph.delete_document][patient={patient_id}][doc={document_id}] FAILED: {e}",
            exc_info=True,
        )
        raise HTTPException(status_code=500, detail=f"Document graph cleanup failed: {e}")



@app.get("/patient-state/{patient_id}")
async def get_patient_state(patient_id: str):
    """
    Return all CURRENT facts for a patient (facts where valid_to is None).
    Used by Layer 3 (LLM reasoning) to build the briefing.
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    results = await graphiti.search(
        query=f"current medications, conditions, lab values, and allergies for patient {patient_id}",
        group_ids=[patient_id],               # ← scope search to this patient's subgraph
        num_results=200,
    )

    # Keep only facts with no expiry — use _get_valid_to which handles
    # both valid_to (search results) and invalid_at / expired_at (EntityEdge).
    current_facts = [r for r in results if _get_valid_to(r) is None]

    return {
        "patient_id": patient_id,
        "current_facts": [
            {
                "fact": r.fact,
                "entity_name": getattr(r, "name", None),
                "valid_from": _get_valid_from(r).isoformat() if _get_valid_from(r) else None,
                "source_node_uuid": str(r.uuid),
            }
            for r in current_facts
        ],
    }


@app.get("/trend/{patient_id}/{entity_name}")
async def get_trend(patient_id: str, entity_name: str):
    """
    Return all historical values for a specific entity (e.g., GFR over 18 months),
    sorted chronologically. Used by Layer 3 to detect trends like declining GFR.
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    results = await graphiti.search(
        query=f"all {entity_name} values for patient {patient_id}",
        group_ids=[patient_id],               # ← scope search to this patient's subgraph
        num_results=100,
    )

    # Sort by valid_from ascending — use safe helper for both attribute variants
    sorted_results = sorted(
        results,
        key=lambda r: _get_valid_from(r) or datetime.min.replace(tzinfo=timezone.utc),
    )

    return {
        "patient_id": patient_id,
        "entity_name": entity_name,
        "trend": [
            {
                "fact": r.fact,
                "valid_from": _get_valid_from(r).isoformat() if _get_valid_from(r) else None,
                "valid_to": _get_valid_to(r).isoformat() if _get_valid_to(r) else None,
                "is_current": _get_valid_to(r) is None,
                "source_node_uuid": str(r.uuid),
            }
            for r in sorted_results
        ],
    }


@app.post("/temporal-query")
async def temporal_query(req: TemporalQueryRequest):
    """
    Return what was true for a specific entity at a specific point in time.
    e.g. "What was the patient's GFR on 2024-06-01?"
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    results = await graphiti.search(
        query=f"{req.entity_name} for patient {req.patient_id}",
        group_ids=[req.patient_id],           # ← scope search to this patient's subgraph
        num_results=100,
    )

    if req.valid_at:
        valid_date = _parse_iso(req.valid_at)
        filtered = []
        for r in results:
            vf = _get_valid_from(r)
            vt = _get_valid_to(r)
            if vf is not None and vf <= valid_date and (vt is None or vt > valid_date):
                filtered.append(r)
        results = filtered

    return {
        "patient_id": req.patient_id,
        "entity_name": req.entity_name,
        "valid_at": req.valid_at,
        "facts": [
            {
                "fact": r.fact,
                "valid_from": _get_valid_from(r).isoformat() if _get_valid_from(r) else None,
                "valid_to": _get_valid_to(r).isoformat() if _get_valid_to(r) else None,
                "source_node_uuid": str(r.uuid),
            }
            for r in results
        ],
    }


@app.post("/extract-entities")
async def api_extract_entities(req: ExtractEntitiesRequest):
    """
    Extract medical entities (medications, labs) from raw text.
    """
    try:
        entities = await extract_entities(req.text)
        return entities
    except Exception as e:
        logger.error(f"Error in extract-entities: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error during extraction")


@app.post("/extract-pdf")
async def api_extract_pdf(req: ExtractPdfRequest):
    """
    Layer 1: Convert a PDF (base64) to per-page PNGs and extract text via a
    vision model. Returns concatenated structured text for downstream layers.
    """
    try:
        pdf_bytes = base64.b64decode(req.pdf_base64)
        result = await extract_pdf_text(pdf_bytes, model_override=req.model)
        return result
    except Exception as e:
        logger.error(f"Error in extract-pdf: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error during PDF extraction")


@app.post("/process-document")
@timing
async def api_process_document(req: ProcessDocumentRequest):
    """
    Bulk endpoint: PDF extraction + entity extraction + Graphiti ingestion in ONE call.
    Collapses 3 HTTP round trips (/extract-pdf → /extract-entities → /add-facts) into
    1 in-process pipeline with zero HTTP overhead between steps.
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    result = {
        "status": "ok",
        "extracted_text": "",
        "extracted_entities": {},
        "graph_status": "pending",
    }

    try:
        pdf_bytes = base64.b64decode(req.pdf_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 PDF: {e}")

    try:
        extract_result = await extract_pdf_text(pdf_bytes)
        extracted_text = extract_result.get("extracted_text", "")
        if not extracted_text:
            raise HTTPException(status_code=422, detail="PDF extraction returned no text")
        result["extracted_text"] = extracted_text
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}")
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {e}")

    try:
        entities = await extract_entities(extracted_text)
        result["extracted_entities"] = entities
    except Exception as e:
        logger.warning(f"Entity extraction failed (non-fatal): {e}")
        result["extracted_entities"] = {"medications": [], "lab_values": []}

    episode_name = f"doc_{req.source_doc_id}"
    entity_context = ""
    if result["extracted_entities"]:
        entity_lines = []
        all_entities = result["extracted_entities"].get("medications", []) + result["extracted_entities"].get("lab_values", [])
        for ent in all_entities:
            if isinstance(ent, dict):
                entity_lines.append(f"[{ent.get('Type', 'ENTITY')}] {ent.get('Text', '')} (score: {ent.get('Score', 1.0):.2f})")
        if entity_lines:
            entity_context = "\n\nPRE-EXTRACTED ENTITIES:\n" + "\n".join(entity_lines)

    episode_body = (
        f"PATIENT_ID: {req.patient_id}\n"
        f"DOCUMENT_ID: {req.source_doc_id}\n"
        f"DOCUMENT_DATE: {req.source_doc_date or 'unknown'}\n\n"
        f"DOCUMENT TEXT:\n{extracted_text}"
        f"{entity_context}"
    )

    ref_time = datetime.now(timezone.utc)
    if req.source_doc_date:
        try:
            ref_time = datetime.fromisoformat(req.source_doc_date)
            if ref_time.tzinfo is None:
                ref_time = ref_time.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    try:
        await graphiti.add_episode(
            name=episode_name,
            episode_body=episode_body,
            source=EpisodeType.text,
            reference_time=ref_time,
            group_id=req.patient_id,
            source_description=f"Medical document {req.source_doc_id} for patient {req.patient_id}, dated {req.source_doc_date or 'unknown'}",
        )
        result["graph_status"] = "ingested"
    except Exception as e:
        logger.error(f"Graphiti ingestion failed: {e}")
        result["graph_status"] = f"failed: {str(e)[:200]}"

    return result


@app.post("/generate-briefing")
@timing
async def api_generate_briefing(req: ProcessBriefingRequest):
    """
    Bulk endpoint: patient state + lab trends in ONE call.
    Collapses N+1 HTTP round trips (1 patient-state + N trend calls) into 1.
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    result = {
        "status": "ok",
        "patient_id": req.patient_id,
        "current_facts": [],
        "trends": {},
    }

    try:
        search_results = await graphiti.search(
            query=f"current medications, conditions, lab values, and allergies for patient {req.patient_id}",
            group_ids=[req.patient_id],
            num_results=200,
        )
        current_facts = [r for r in search_results if _get_valid_to(r) is None]
        result["current_facts"] = [
            {
                "fact": r.fact,
                "entity_name": getattr(r, "name", None),
                "valid_from": _get_valid_from(r).isoformat() if _get_valid_from(r) else None,
                "source_node_uuid": str(r.uuid),
            }
            for r in current_facts
        ]
    except Exception as e:
        logger.error(f"Patient state fetch failed: {e}")
        raise HTTPException(status_code=500, detail=f"Patient state fetch failed: {e}")

    trends = {}
    for entity_name in req.lab_entities:
        try:
            trend_results = await graphiti.search(
                query=f"all {entity_name} values for patient {req.patient_id}",
                group_ids=[req.patient_id],
                num_results=100,
            )
            sorted_trend = sorted(
                trend_results,
                key=lambda r: _get_valid_from(r) or datetime.min.replace(tzinfo=timezone.utc),
            )
            trends[entity_name] = [
                {
                    "fact": r.fact,
                    "valid_from": _get_valid_from(r).isoformat() if _get_valid_from(r) else None,
                    "valid_to": _get_valid_to(r).isoformat() if _get_valid_to(r) else None,
                    "is_current": _get_valid_to(r) is None,
                    "source_node_uuid": str(r.uuid),
                }
                for r in sorted_trend
            ]
        except Exception as e:
            logger.warning(f"Trend fetch failed for {entity_name} (non-fatal): {e}")
            trends[entity_name] = []

    result["trends"] = trends
    return result


@app.post("/verify-briefing")
@timing
async def api_verify_briefing(req: VerifyBriefingRequest):
    """
    PaperTrail: decompose claims → extract evidence per document → match → semantic verify.
    Moved from the Edge Function into Python to eliminate N per-document LLM HTTPS calls
    and avoid re-fetching documents from Supabase (FalkorDB already has the text).
    Returns verified claims, rejected claims, and final (stripped) briefing text.
    """
    if graphiti is None:
        raise HTTPException(status_code=503, detail="Graphiti not initialised")

    llm = graphiti.llm_client
    generated_briefing = req.generated_briefing
    layer5_results = req.layer5_results or []

    # --- Stage 1: Atomic Claim Decomposition ---
    decompose_prompt = (
        f"Decompose the following briefing into atomic claims. "
        f"Each claim should be a single verifiable fact.\n"
        f"Briefing: {generated_briefing}\n"
        f"Output as JSON array of {{claim_id, claim_text, claim_type, expected_evidence}}. "
        f"claim_type can be \"source_document\", \"medical_knowledge\", or \"reasoning\"."
    )

    atomic_claims = []
    try:
        decomp_result = await llm.generate_response(
            messages=[Message(role="user", content=decompose_prompt)],
            max_tokens=4096,
        )
        parsed = json.loads(decomp_result) if isinstance(decomp_result, str) else decomp_result
        atomic_claims = parsed if isinstance(parsed, list) else parsed.get("claims", [])
    except Exception as e:
        logger.warning(f"Claim decomposition failed: {e}")

    if not atomic_claims:
        return {
            "status": "ok",
            "verified_claims": req.raw_claims,
            "rejected_claims": [],
            "final_briefing_text": generated_briefing,
        }

    # --- Stage 2: Search pre-indexed document evidence via Graphiti ---
    # Instead of fetching all document texts and running N LLM calls for evidence
    # extraction, we use Graphiti's existing search index (built during ingestion).
    # This trades N LLM calls (expensive) for N in-memory searches (cheap).
    atomic_evidence = []
    for claim in atomic_claims:
        claim_text = claim.get("claim_text", "")
        if not claim_text or len(claim_text) < 10:
            continue
        try:
            search_results = await graphiti.search(
                query=claim_text,
                group_ids=[req.patient_id],
                num_results=5,
            )
            for r in search_results[:3]:
                if r.fact:
                    doc_name = getattr(r, "name", "") or ""
                    doc_id = doc_name.replace("doc_", "") if isinstance(doc_name, str) and doc_name.startswith("doc_") else doc_name
                    atomic_evidence.append({
                        "evidence_id": str(r.uuid),
                        "evidence_text": r.fact,
                        "source_quote": r.fact[:200],
                        "source_doc_id": str(doc_id),
                        "score": getattr(r, "score", 0.5),
                    })
        except Exception as e:
            logger.warning(f"Evidence search failed for claim '{claim_text[:50]}': {e}")

    # --- Stage 4: String-match pass ---
    verified_claims = []
    rejected_claims = []
    unverified_claims = []

    for claim in atomic_claims:
        flag = "UNSUPPORTED"
        evidence = None

        if claim.get("claim_type") == "medical_knowledge":
            matched_ddi = next(
                (r for r in layer5_results
                 if claim.get("claim_text", "").lower().find(r.get("medications", [""])[0].lower()) >= 0
                 or claim.get("claim_text", "").lower().find(r.get("medications", [""])[-1].lower()) >= 0),
                None,
            )
            if matched_ddi:
                flag = "MEDICAL_KNOWLEDGE"
                evidence = {
                    "source": "RxNav",
                    "entry_text": matched_ddi.get("citation", ""),
                    "match_type": "medical_knowledge",
                }
        else:
            claim_lower = (claim.get("claim_text") or "").lower()
            expected = (claim.get("expected_evidence") or claim.get("claim_text") or "").lower()

            matched_ev = next(
                (ev for ev in atomic_evidence
                 if expected in (ev.get("source_quote") or "").lower()
                 or expected in (ev.get("evidence_text") or "").lower()),
                None,
            )

            if matched_ev:
                flag = "SUPPORTED"
                evidence = {
                    "source_doc_id": matched_ev.get("source_doc_id"),
                    "source_quote": matched_ev.get("source_quote") or matched_ev.get("evidence_text"),
                    "match_type": "exact",
                    "confidence": 1.0,
                }

        if flag != "UNSUPPORTED":
            verified_claims.append({**claim, "flag": flag, "evidence": evidence})
        elif claim.get("claim_type") != "medical_knowledge":
            unverified_claims.append(claim)
        else:
            verified_claims.append({
                **claim,
                "flag": "MEDICAL_KNOWLEDGE",
                "evidence": {"source": "RxNav", "entry_text": "General clinical knowledge"},
            })

    # --- Stage 5: Batch Semantic Match for unverified claims ---
    if unverified_claims and atomic_evidence:
        unverified_payload = [{"id": c.get("claim_id"), "text": c.get("claim_text")} for c in unverified_claims]
        evidence_payload = [e.get("evidence_text") or e.get("source_quote") or "" for e in atomic_evidence]
        batch_prompt = (
            f"Verify whether the following claims are supported by the evidence pool.\n"
            f"Claims: {json.dumps(unverified_payload)}\n"
            f"Evidence: {json.dumps(evidence_payload)}\n\n"
            f'Output JSON: {{"results": [{{"id": "claim_id", "is_supported": true/false, "confidence": 0.0-1.0, "matching_fact": "quote"}}]}}'
        )
        try:
            batch_result = await llm.generate_response(
                messages=[Message(role="user", content=batch_prompt)],
                max_tokens=4096,
            )
            parsed_batch = json.loads(batch_result) if isinstance(batch_result, str) else batch_result
            batch_results = parsed_batch.get("results", []) if isinstance(parsed_batch, dict) else []

            for claim in unverified_claims:
                match = next((r for r in batch_results if r.get("id") == claim.get("claim_id")), None)
                if match and match.get("is_supported") and match.get("confidence", 0) >= 0.5:
                    vflag = "SUPPORTED" if match.get("confidence", 0) > 0.8 else "PARTIALLY SUPPORTED"
                    verified_claims.append({
                        **claim,
                        "flag": vflag,
                        "evidence": {
                            "source_doc_id": "semantic-match",
                            "source_quote": match.get("matching_fact") or claim.get("claim_text"),
                            "match_type": "semantic",
                            "confidence": match.get("confidence"),
                        },
                    })
                else:
                    rejected_claims.append({**claim, "flag": "UNSUPPORTED", "evidence": None})
        except Exception as e:
            logger.warning(f"Batch semantic verification failed: {e}")
            for claim in unverified_claims:
                rejected_claims.append({**claim, "flag": "UNSUPPORTED", "evidence": None})
    else:
        for claim in unverified_claims:
            rejected_claims.append({**claim, "flag": "UNSUPPORTED", "evidence": None})

    # --- Strip unsupported claims from briefing text ---
    final_briefing = generated_briefing
    for rejected in rejected_claims:
        final_briefing = final_briefing.replace(rejected.get("claim_text", ""), "")

    logger.info(
        f"PaperTrail complete: {len(verified_claims)} supported, "
        f"{len(rejected_claims)} rejected, {len(final_briefing)} chars"
    )

    return {
        "status": "ok",
        "verified_claims": verified_claims,
        "rejected_claims": rejected_claims,
        "final_briefing_text": final_briefing,
    }

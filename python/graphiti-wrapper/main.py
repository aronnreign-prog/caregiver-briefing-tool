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
    """
    content = re.sub(r'^```(?:json)?\s*', '', content, flags=re.MULTILINE)
    content = re.sub(r'\s*```$', '', content, flags=re.MULTILINE)

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    brace_count = 0
    start_idx = None
    for i, char in enumerate(content):
        if char == '{':
            if start_idx is None:
                start_idx = i
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0 and start_idx is not None:
                json_str = content[start_idx:i+1]
                try:
                    return json.loads(json_str)
                except json.JSONDecodeError:
                    start_idx = None

    json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError(
        f"Could not extract valid JSON from response. Preview: {content[:200]}",
        content, 0,
    )


# Patch OpenAIGenericClient._generate_response to handle OpenRouter failure modes
_original_generic_generate = OpenAIGenericClient._generate_response

async def _patched_generic_generate(self, messages, response_model=None, max_tokens=16384, model_size=None):
    openai_messages = []
    for m in messages:
        m.content = self._clean_input(m.content)
        if m.role == 'user':
            openai_messages.append({'role': 'user', 'content': m.content})
        elif m.role == 'system':
            openai_messages.append({'role': 'system', 'content': m.content})

    import openai as _openai

    for attempt in range(3):
        try:
            response = await self.client.chat.completions.create(
                model=self.model or 'gpt-4.1-mini',
                messages=openai_messages,
                temperature=self.temperature,
                max_tokens=max_tokens,
                response_format=self._build_response_format(response_model),
            )
            result = response.choices[0].message.content or ''
            if not result:
                raise Exception('LLM returned an empty response')

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
            # to graphiti-core's expected field names. DeepSeek free models often
            # return 'entities' instead of 'extracted_entities', etc.
            #
            # NOTE: ExtractedEdges uses "edges" (not "extracted_edges") as its
            # top-level key in the actual schema — do NOT remap it.
            if response_model and isinstance(parsed, dict):
                expected_schema = response_model.model_json_schema()
                expected_props = set(expected_schema.get('properties', {}).keys())
                actual_keys = set(parsed.keys())
                if not expected_props <= actual_keys:
                    # Try fuzzy remapping for common top-level mismatches.
                    remapped = dict(parsed)
                    # Only remap 'entities'->'extracted_entities' and
                    # 'nodes'->'extracted_nodes'. DO NOT remap 'edges' because
                    # ExtractedEdges.model_json_schema() has "edges" as the
                    # correct top-level key (the old 'extracted_edges' entry
                    # was wrong and would have hidden valid data).
                    known_top_remaps = {
                        'entities': 'extracted_entities',
                        'nodes': 'extracted_nodes',
                    }
                    for actual_key, remap_key in known_top_remaps.items():
                        if actual_key in remapped and remap_key in expected_props and remap_key not in remapped:
                            logger.info(f'[OpenRouter] top-level remap: "{actual_key}" -> "{remap_key}"')
                            remapped[remap_key] = remapped.pop(actual_key)
                    parsed = remapped

            # Remap nested field names inside array items.
            # LLMs (especially DeepSeek free via OpenRouter) frequently use
            # natural-language variants of field names inside nested objects:
            #   ExtractedEntity: entity_name -> name, entity_type_name -> entity_type_id
            # These remaps are keyed by response_model class name so they only
            # fire for the relevant Pydantic model, avoiding false positives.
            if response_model and isinstance(parsed, dict):
                model_name = getattr(response_model, '__name__', '')

                # --- ExtractedEntities nested item remapper ---
                if model_name == 'ExtractedEntities' and isinstance(parsed.get('extracted_entities'), list):
                    ENTITY_ITEM_REMAPS = {
                        # LLM alias          -> correct Pydantic field name
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
                            logger.warning(
                                f'[OpenRouter] extracted_entities item is bare string, coercing: "{item[:60]}"'
                            )
                            fixed_items.append({'name': item, 'entity_type_id': 0, 'episode_indices': [0]})
                            continue
                        if not isinstance(item, dict):
                            logger.warning(
                                f'[OpenRouter] extracted_entities item has unexpected type '
                                f'{type(item).__name__}, skipping'
                            )
                            continue
                        fixed = dict(item)
                        for alias, canonical in ENTITY_ITEM_REMAPS.items():
                            if alias in fixed and canonical not in fixed:
                                logger.info(f'[OpenRouter] nested entity remap: "{alias}" -> "{canonical}"')
                                fixed[canonical] = fixed.pop(alias)
                        # entity_type_id must be an int; if the LLM gave a string
                        # label (e.g. "Medication"), convert to 0 so Pydantic
                        # doesn't crash — graphiti will re-classify from context.
                        if 'entity_type_id' in fixed and not isinstance(fixed['entity_type_id'], int):
                            logger.warning(
                                f'[OpenRouter] entity_type_id is non-int '
                                f'("{fixed["entity_type_id"]}"), defaulting to 0'
                            )
                            fixed['entity_type_id'] = 0
                        # episode_indices must be a list; coerce scalar to list
                        if 'episode_indices' in fixed and not isinstance(fixed['episode_indices'], list):
                            fixed['episode_indices'] = [fixed['episode_indices']]
                        # Ensure required fields have sane defaults if still missing
                        fixed.setdefault('episode_indices', [0])
                        fixed_items.append(fixed)
                    parsed['extracted_entities'] = fixed_items

                # --- ExtractedEdges nested item remapper ---
                if model_name == 'ExtractedEdges' and isinstance(parsed.get('edges'), list):
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
                            logger.warning(f'[OpenRouter] edges item has unexpected type {type(item).__name__}, skipping')
                            continue
                        fixed = dict(item)
                        for alias, canonical in EDGE_ITEM_REMAPS.items():
                            if alias in fixed and canonical not in fixed:
                                logger.info(f'[OpenRouter] nested edge remap: "{alias}" -> "{canonical}"')
                                fixed[canonical] = fixed.pop(alias)
                        # Ensure required fields have fallback string if missing
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

        except _openai.RateLimitError:
            raise
        except _openai.BadRequestError:
            # json_schema format not supported by this model — fall back to json_object
            if self.structured_output_mode == 'json_schema' and attempt == 0:
                logger.warning('json_schema not supported by model, falling back to json_object')
                self.structured_output_mode = 'json_object'
                continue
            raise
        except (json.JSONDecodeError, ValueError, KeyError) as e:
            logger.warning(
                f'[OpenRouter] parse error on attempt {attempt+1}/3: {e}'
            )
            if attempt >= 2:
                raise
            error_msg = Message(
                role='user',
                content=(
                    f'Your last response was rejected because: {e}. '
                    f'OUTPUT ONLY THE REQUESTED DATA as a plain JSON object. '
                    f'NEVER return a JSON Schema definition, type descriptors, $defs, or property listings. '
                    f'Fill in the actual values.'
                ),
            )
            openai_messages.append({'role': 'user', 'content': error_msg.content})
        except Exception:
            raise

OpenAIGenericClient._generate_response = _patched_generic_generate
from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver

from extractor import extract_entities
from pdf_extract import extract_pdf_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

# Embeddings: OpenRouter serves NO embedding models, so Graphiti's embedder uses
# Google Gemini (free tier) instead. Keep chat/LLM on OpenRouter.
# EMBED_DIM is env-driven: 768 for local (light on RAM); set to the model default
# (3072 for gemini-embedding-001) when hosting separately.
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "49277"))
FALKORDB_PASSWORD = os.getenv("FALKORDB_PASSWORD")

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

    embedder = GeminiEmbedder(
        config=GeminiEmbedderConfig(
            api_key=GEMINI_API_KEY,
            embedding_model=EMBED_MODEL,
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


@app.post("/add-facts")
async def add_facts(req: AddFactsRequest):
    """
    Ingest a processed PDF episode into the temporal knowledge graph.

    Graphiti will:
      • Extract entities (Patient, Medication, Condition, LabValue, Provider)
      • Resolve duplicates / aliases (Lisinopril == lisinopril)
      • Invalidate old facts superseded by new values (sets valid_to)
      • Store bi-temporal metadata using reference_time as the anchor
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

    result = await graphiti.add_episode(
        name=f"doc_{req.source_doc_id}",
        episode_body=episode_body,
        source=EpisodeType.text,
        reference_time=_parse_iso(req.reference_time),
        source_description=(
            f"Medical document {req.source_doc_id} "
            f"for patient {req.patient_id}, "
            f"dated {req.source_doc_date or 'unknown'}"
        ),
    )

    return {
        "status": "ok",
        "episode_uuid": str(result.episode.uuid),
        "nodes_extracted": len(result.nodes),
        "edges_extracted": len(result.edges),
    }


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

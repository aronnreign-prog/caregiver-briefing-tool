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
import base64
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client import OpenAIClient, LLMConfig
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

    llm_client = OpenAIClient(
        config=LLMConfig(
            api_key=OPENROUTER_API_KEY,
            model=ENTITY_EXTRACT_MODEL,
            base_url=OPENROUTER_BASE_URL,
        )
    )

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

    yield

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

    current_facts = [r for r in results if r.valid_at is None]

    return {
        "patient_id": patient_id,
        "current_facts": [
            {
                "fact": r.fact,
                "entity_name": getattr(r, "name", None),
                "valid_from": r.valid_from.isoformat() if r.valid_from else None,
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

    # Sort by valid_from ascending
    sorted_results = sorted(
        results,
        key=lambda r: r.valid_from if r.valid_from else datetime.min.replace(tzinfo=timezone.utc),
    )

    return {
        "patient_id": patient_id,
        "entity_name": entity_name,
        "trend": [
            {
                "fact": r.fact,
                "valid_from": r.valid_from.isoformat() if r.valid_from else None,
                "valid_to": r.valid_to.isoformat() if r.valid_to else None,
                "is_current": r.valid_to is None,
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
        results = [
            r for r in results
            if r.valid_from is not None
            and r.valid_from <= valid_date
            and (r.valid_to is None or r.valid_to > valid_date)
        ]

    return {
        "patient_id": req.patient_id,
        "entity_name": req.entity_name,
        "valid_at": req.valid_at,
        "facts": [
            {
                "fact": r.fact,
                "valid_from": r.valid_from.isoformat() if r.valid_from else None,
                "valid_to": r.valid_to.isoformat() if r.valid_to else None,
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

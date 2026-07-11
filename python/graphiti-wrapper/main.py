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
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client import OpenAIClient, LLMConfig
from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AddFactsRequest(BaseModel):
    patient_id: str
    episode_text: str              # Full extracted text from the PDF (Layer 1 output)
    source_doc_id: str             # UUID of the document row in Postgres
    source_doc_date: str           # ISO date: when the document was created (valid_from)
    entities: list[dict] = []      # Pre-extracted medical entities (Layer 2 output)
    reference_time: str            # ISO datetime: when we are ingesting this fact


class TemporalQueryRequest(BaseModel):
    patient_id: str
    entity_name: str               # e.g. "GFR", "Lisinopril"
    valid_at: Optional[str] = None # ISO date; None = "right now"


# ---------------------------------------------------------------------------
# Graphiti initialisation
# ---------------------------------------------------------------------------

# OpenRouter is compatible with the OpenAI SDK — we just point base_url at it.
# Graphiti uses an LLM for entity extraction and an embedder for semantic search.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
ENTITY_EXTRACT_MODEL = os.getenv("ENTITY_EXTRACT_MODEL", "qwen/qwen-2-vl-7b-instruct:free")
EMBED_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")  # via OpenRouter or OpenAI

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))

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

    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            api_key=OPENROUTER_API_KEY,
            embedding_model=EMBED_MODEL,
            base_url=OPENROUTER_BASE_URL,
        )
    )

    graphiti = Graphiti(
        FALKORDB_HOST,
        FALKORDB_PORT,
        llm_client=llm_client,
        embedder=embedder,
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
def health():
    return {"status": "ok"}


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
        f"DOCUMENT_DATE: {req.source_doc_date}\n\n"
        f"DOCUMENT TEXT:\n{req.episode_text}"
        f"{entity_context}"
    )

    episode = await graphiti.add_episode(
        name=f"doc_{req.source_doc_id}",
        episode_body=episode_body,
        source=EpisodeType.text,
        reference_time=_parse_iso(req.reference_time),
        source_description=(
            f"Medical document {req.source_doc_id} "
            f"for patient {req.patient_id}, "
            f"dated {req.source_doc_date}"
        ),
    )

    return {"status": "ok", "episode_uuid": str(episode.uuid)}


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

    current_facts = [r for r in results if r.valid_to is None]

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

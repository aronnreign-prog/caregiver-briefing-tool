# Graphiti + FalkorDB Integration Spec

> **Graphiti is the moat (Layer 7).** It handles bi-temporal fact storage, entity resolution, conflict detection, and temporal queries. We do NOT write custom bi-temporal logic — we call Graphiti's API.

---

## Why Graphiti + FalkorDB (NOT Neo4j)

We use FalkorDB instead of Neo4j as Graphiti's backend because:

| | Neo4j | FalkorDB |
|---|---|---|
| RAM for our dataset | ~2GB minimum | ~300MB (7x less per FalkorDB V4.8 benchmarks) |
| Architecture | Java, native graph | Redis module (Redis-compatible protocol) |
| Hosting | Neo4j Aura free (200K nodes) OR 2GB+ VPS | Upstash Redis free tier (256MB, 10K commands/day) OR self-hosted |
| Graphiti support | Native | Native (officially documented) |
| Cypher query | Full Cypher | Cypher-compatible (subset, covers Graphiti's needs) |

**Decision: FalkorDB.** It's 7x lighter, runs on free tiers that Neo4j can't fit on, and Graphiti officially supports it.

**Source:** 
- Graphiti FalkorDB config: https://help.getzep.com/graphiti/configuration/falkor-db-configuration
- FalkorDB + Graphiti tutorial: https://www.falkordb.com/blog/graphiti-get-started
- FalkorDB V4.8 benchmark: https://dev.to/falkordb/falkordb-v48-neo4j-requires-7x-the-memory-to-hold-the-same-dataset-5c3i

---

## Architecture

```
TypeScript (Supabase Edge Function)
  ↓ HTTP call (fetch)
Python FastAPI Service (~50 lines)
  ↓ Python SDK
Graphiti
  ↓ Redis protocol
FalkorDB (on Upstash OR self-hosted Docker)
```

**Why a Python wrapper?** Graphiti is Python-only (`graphiti-core` on PyPI). The TypeScript Edge Function can't run Python directly. So we wrap Graphiti in a tiny FastAPI service that exposes REST endpoints. The Edge Function calls these endpoints via HTTP.

---

## FalkorDB Setup

### Option A: Upstash Redis Free Tier (recommended for MVT)
- Sign up at upstash.com (free, no credit card)
- Create a Redis database
- Get the REST URL and REST token (or Redis URL)
- FalkorDB connects to Upstash via Redis protocol

**Note:** Upstash free tier = 256MB storage, 10K commands/day, $0/mo forever. Sufficient for MVT (10-20 patients × ~100 facts each = 1-2K facts, well under 256MB).

### Option B: Self-Hosted FalkorDB (Docker)
```yaml
# docker-compose.yml
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports:
      - "6379:6379"   # Redis protocol
      - "3000:3000"   # Web UI
    volumes:
      - falkordb_data:/var/lib/falkordb/data
    command: falkordb --save 60 1 --loglevel warning

volumes:
  falkordb_data:
```

Run: `docker compose up -d`

---

## Graphiti Python Wrapper (FastAPI)

### File: `python/graphiti-wrapper/main.py`

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from datetime import datetime
import os

app = FastAPI()

# Initialize Graphiti with FalkorDB backend
graphiti = Graphiti(
    driver=None,  # Will use FalkorDB driver
    uri=os.getenv("FALKORDB_URI", "bolt://localhost:7687"),
    # For FalkorDB via Redis protocol:
    # uri=os.getenv("FALKORDB_REDIS_URI", "redis://localhost:6379"),
)

class AddFactsRequest(BaseModel):
    patient_id: str
    episode_text: str  # The extracted text from the PDF
    source_doc_id: str
    source_doc_date: str  # When the document was created (valid_from)
    entities: list[dict]  # AWS Comprehend Medical entities
    reference_time: str  # ISO datetime

class QueryFactsRequest(BaseModel):
    patient_id: str
    query: str  # Natural language query
    max_results: int = 50

class TemporalQueryRequest(BaseModel):
    patient_id: str
    entity_name: str  # e.g., "GFR"
    valid_at: str | None = None  # ISO date, or None for "now"

@app.on_event("startup")
async def startup():
    await graphiti.build_indices_and_constraints()

@app.post("/add-facts")
async def add_facts(req: AddFactsRequest):
    """Add medical facts from a processed PDF to the temporal knowledge graph."""
    episode = await graphiti.add_episode(
        name=f"medical_record_{req.source_doc_id}",
        episode_body=req.episode_text,
        source=EpisodeType.message,
        reference_time=datetime.fromisoformat(req.reference_time),
        source_description=f"Source: {req.source_doc_id}, Patient: {req.patient_id}",
        entity_types=["Patient", "Medication", "Condition", "LabValue", "Provider"],
        # Graphiti will extract entities, but we also pass pre-extracted ones
        # from AWS Comprehend Medical for better accuracy
    )
    return {"status": "ok", "episode_id": episode.id}

@app.post("/query-facts")
async def query_facts(req: QueryFactsRequest):
    """Query the temporal knowledge graph for facts about a patient."""
    results = await graphiti.search(
        query=req.query,
        num_results=req.max_results,
        # Filter by patient_id in the graph
    )
    return {
        "facts": [
            {
                "fact_id": r.fact_id,
                "entity_name": r.entity_name,
                "value": r.value,
                "valid_from": r.valid_from,
                "valid_to": r.valid_to,
                "source_doc_id": r.source_doc_id,
                "source_quote": r.source_quote,
            }
            for r in results
        ]
    }

@app.post("/temporal-query")
async def temporal_query(req: TemporalQueryRequest):
    """Query what was true for a specific entity at a specific time."""
    # Graphiti handles bi-temporal queries natively
    # This is the key capability — "what was GFR on 2024-06-01?"
    results = await graphiti.search(
        query=f"{req.entity_name} for patient {req.patient_id}",
        num_results=100,
        # Graphiti's temporal awareness handles the valid_from/valid_to filtering
    )
    # Filter to the requested time
    if req.valid_at:
        valid_date = datetime.fromisoformat(req.valid_at).date()
        results = [
            r for r in results
            if r.valid_from <= valid_date
            and (r.valid_to is None or r.valid_to > valid_date)
        ]
    return {
        "entity": req.entity_name,
        "valid_at": req.valid_at,
        "facts": [
            {
                "value": r.value,
                "valid_from": r.valid_from,
                "valid_to": r.valid_to,
                "source_doc_id": r.source_doc_id,
            }
            for r in results
        ]
    }

@app.get("/patient-state/{patient_id}")
async def get_patient_state(patient_id: str):
    """Get the current state of a patient — all current facts (valid_to is None)."""
    # This is what Layer 3 (LLM reasoning) queries to generate the briefing
    results = await graphiti.search(
        query=f"current medications, conditions, and labs for patient {patient_id}",
        num_results=200,
    )
    # Filter to current facts only (valid_to is None)
    current_facts = [r for r in results if r.valid_to is None]
    return {
        "patient_id": patient_id,
        "current_facts": [
            {
                "entity_type": r.entity_type,
                "entity_name": r.entity_name,
                "value": r.value,
                "valid_from": r.valid_from,
                "source_doc_id": r.source_doc_id,
                "source_quote": r.source_quote,
            }
            for r in current_facts
        ]
    }

@app.get("/trend/{patient_id}/{entity_name}")
async def get_trend(patient_id: str, entity_name: str):
    """Get the trend of a specific entity over time (e.g., GFR over 18 months)."""
    results = await graphiti.search(
        query=f"{entity_name} values for patient {patient_id}",
        num_results=100,
    )
    # Sort by valid_from
    sorted_results = sorted(results, key=lambda r: r.valid_from)
    return {
        "patient_id": patient_id,
        "entity_name": entity_name,
        "trend": [
            {
                "value": r.value,
                "valid_from": r.valid_from,
                "valid_to": r.valid_to,
                "source_doc_id": r.source_doc_id,
                "is_current": r.valid_to is None,
            }
            for r in sorted_results
        ]
    }
```

### File: `python/graphiti-wrapper/requirements.txt`
```
fastapi==0.115.0
uvicorn==0.30.0
graphiti-core==0.5.0
pydantic==2.9.0
```

### File: `python/graphiti-wrapper/Dockerfile`
```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## TypeScript Integration (Supabase Edge Function)

### File: `src/supabase/functions/process-briefing/index.ts`

```typescript
// The Edge Function calls the Python Graphiti wrapper via HTTP
const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL")!;
const PATIENT_ID = "..."; // from request

// Step 1: After Layer 1 (PDF extraction) and Layer 2 (AWS Comprehend Medical)
// Add facts to Graphiti
const addResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/add-facts`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    patient_id: PATIENT_ID,
    episode_text: extractedText, // from Layer 1
    source_doc_id: pdfId,
    source_doc_date: documentDate,
    entities: comprehendMedicalEntities, // from Layer 2
    reference_time: new Date().toISOString(),
  }),
});

// Step 2: Query current patient state (for Layer 3 reasoning)
const stateResponse = await fetch(
  `${GRAPHITI_WRAPPER_URL}/patient-state/${PATIENT_ID}`
);
const { current_facts } = await stateResponse.json();

// Step 3: Query GFR trend (for the kidney function example)
const trendResponse = await fetch(
  `${GRAPHITI_WRAPPER_URL}/trend/${PATIENT_ID}/GFR`
);
const { trend } = await trendResponse.json();

// Step 4: Pass current_facts + trend to Layer 3 (Claude Haiku reasoning)
// ... see pipeline.md
```

---

## Key Graphiti Concepts (for the coding agent)

### Episodes
An "episode" is a unit of information added to the graph. Each uploaded PDF becomes an episode. Graphiti processes the episode text, extracts entities and relationships, and stores them as bi-temporal facts.

### Entities
Graphiti automatically extracts entities from episode text. We configure entity types: Patient, Medication, Condition, LabValue, Provider. We ALSO pass pre-extracted entities from AWS Comprehend Medical for better accuracy.

### Bi-temporal facts
Each fact has:
- `valid_from`: when the fact became true in the real world (e.g., when the GFR was measured)
- `valid_to`: when the fact stopped being true (None if still current, set when invalidated)
- `recorded`: when the system learned the fact (provenance)
- `source`: which episode (PDF) produced the fact

When a new fact contradicts an old one (e.g., new GFR value), Graphiti INVALIDATES the old fact (sets `valid_to`) rather than deleting it. History is preserved.

### Temporal queries
- "What was true on date X?" → filter facts where `valid_from <= X AND (valid_to IS NULL OR valid_to > X)`
- "What is true now?" → filter facts where `valid_to IS NULL`
- "Trend over time" → all facts for an entity, sorted by `valid_from`

**Graphiti handles these queries.** We do NOT write custom SQL for them. We call Graphiti's search API.

---

## Deployment

### MVT deployment:
- FalkorDB on Upstash Redis free tier ($0/mo)
- Python wrapper on:
  - AWS t4g.small (2GB ARM, free until Dec 2026), OR
  - Self-hosted on the same VPS as the rest of the stack
- The wrapper is ~50 lines of Python — minimal resource usage

### Docker Compose for local dev:
```yaml
# docker-compose.yml (local development)
services:
  falkordb:
    image: falkordb/falkordb:latest
    ports: ["6379:6379", "3000:3000"]
    volumes: ["falkordb_data:/var/lib/falkordb/data"]

  graphiti-wrapper:
    build: ./python/graphiti-wrapper
    ports: ["8000:8000"]
    environment:
      - FALKORDB_URI=bolt://falkordb:7687
    depends_on: [falkordb]

  postgres:
    image: postgres:16
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: dev
    volumes: ["postgres_data:/var/lib/postgresql/data"]

volumes:
  falkordb_data:
  postgres_data:
```

---

## What Graphiti Handles (DO NOT Implement Yourself)

| Capability | Graphiti handles | We should NOT build |
|---|---|---|
| Bi-temporal storage | ✓ | ❌ Custom SQL schema with valid_from/valid_to |
| Entity resolution (Lisinopril = lisinopril) | ✓ (simplified for MVT) | ❌ Custom entity matching |
| Conflict detection (new value invalidates old) | ✓ | ❌ Custom invalidation logic |
| Temporal queries ("what was true on X") | ✓ | ❌ Custom temporal SQL |
| Multi-hop queries | ✓ (not needed for MVT) | ❌ Custom graph traversal |
| Provenance tracking | ✓ | ❌ Custom provenance schema |

**Rule:** If Graphiti does it, call Graphiti's API. Do NOT write custom logic for these capabilities.

---

## Testing

1. Start FalkorDB + Graphiti wrapper locally: `docker compose up`
2. Generate a Synthea patient with multi-year history
3. Upload 5-10 documents (labs, visit notes, prescriptions) one at a time
4. After each upload, call `/add-facts`
5. After all uploads, call `/patient-state/{id}` — verify current medications, conditions, labs are correct
6. Call `/trend/{id}/GFR` — verify the trend shows all historical GFR values in order
7. Call `/temporal-query` with a past date — verify it returns the correct historical state
8. Verify that old facts are invalidated (valid_to is set) when new values arrive, not deleted

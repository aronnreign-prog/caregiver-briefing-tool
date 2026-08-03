# Caregiver Briefing Tool — Milestone 1 Comprehensive Diagnostic & Endpoint Discovery Analysis

**Author:** Explorer Agent (`explorer_m1_1`)  
**Date:** 2026-08-01  
**Project:** Caregiver Briefing Tool — Live End-to-End Validation & Diagnostic Audit (Milestone 1)  
**Working Directory:** `C:\Users\Dell\caregiver-briefing-tool\.agents\explorer_m1_1`

---

## Executive Summary

This report documents the live endpoint discovery, environment configuration audit, 4-layer pipeline API mapping, and test dataset inventory for Milestone 1 of the Caregiver Briefing Tool. All 4 architecture layers—from multimodal PDF ingestion to PaperTrail citation verification—were analyzed through complete static code inspection and configuration auditing.

---

## 1. Environment & Architecture Overview

The system operates across a hybrid cloud architecture comprising three primary runtimes:

1. **Supabase Cloud (`https://qtwxthxhwwqovpcqrdqj.supabase.co`)**:
   - PostgreSQL database with `pg_cron`, PostgREST API, Supabase Auth, and Storage bucket (`medical_records`).
   - TypeScript Deno Edge Functions: `process-document` and `process-briefing`.
2. **Render Python Service (`https://caregiver-briefing-tool.onrender.com`)**:
   - FastAPI application wrapping Graphiti temporal knowledge graph engine (`graphiti-core`).
   - Integrates PyMuPDF (`fitz`), spaCy Matcher rules, Hugging Face Inference API (`en_core_med7_lg`), OpenRouter LLM API client, and Google Gemini Embedder (`gemini-embedding-001`).
3. **FalkorDB Remote Graph Database (`r-6jissuruar.instance-ql5fhbodg.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud:49277`)**:
   - Redis protocol Graph Database storing bi-temporal knowledge graph nodes and edges (`valid_from`, `valid_to`).

### Environment Truth Table & Confirmed Mismatches (from `ENV_TRUTH.md` & `.env.local` audit)

| Variable / Component | Declared / Documented State | Actual Runtime / On-Disk State | Assessment / Mismatch Note |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` line 2 | `https://qtwxthxhwwqovpcqrdqj.supabase.co` | Valid Supabase Cloud project URL |
| `GRAPHITI_WRAPPER_URL` | `.env.local` line 22 | `https://caregiver-briefing-tool.onrender.com` | Deployed Render service |
| `FALKORDB_HOST` / `PORT` | `.env.local` lines 32-33 | `r-6jissuruar...cloud:49277` | Remote FalkorDB Cloud instance |
| `OPENROUTER_API_KEY` | `.env.local` line 9 | `sk-or-v1-620f...` | Present locally; must be declared in Supabase Secrets for Cloud Edge functions |
| `GEMINI_API_KEY` | `.env.local` line 11 | `AQ.Ab8RN6...` | Google AI Studio key for Graphiti GeminiEmbedder |
| `HF_TOKEN` | `.env.local` line 13 | `hf_vlwX...` | HuggingFace Inference API token for Med7 NER |
| `FALKORDB_URI` in `.env.local` | `bolt://localhost:7687` | Unsupported scheme | **Mismatch**: Stack uses Redis protocol (`FALKORDB_HOST`/`PORT`), not Bolt. |
| `MODELS.md` vs Code | `qwen/qwen-2-vl-7b-instruct:free` | Code fallback: `nvidia/nemotron-nano-12b-v2-vl:free` | **Doc Drift**: Rely on code fallback chain in `model_resolver.py`. |

---

## 2. Comprehensive 4-Layer Endpoint & Schema Catalog

### Layer 1: PDF Ingestion & Multimodal Vision Extraction

- **Edge Function Endpoint**: `POST https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-document`
  - **Auth**: Service Role JWT (`SUPABASE_SERVICE_ROLE_KEY`) or User JWT (`verify_jwt`)
  - **Headers**: `Authorization: Bearer <TOKEN>`, `Content-Type: application/json`
  - **Request Body**: `{"worker_name": "edge-worker-1"}` (or empty POST; claims next job from `public.jobs` where `job_type = 'process_document'`)
  - **Job Payload**: `{"document_id": "<UUID>"}`
  - **Processing Flow**:
    1. Downloads PDF binary from `medical_records` storage bucket using `doc.storage_path`.
    2. Base64-encodes PDF bytes and POSTs to Python Wrapper `/extract-pdf`.
    3. Receives `extracted_text`.
    4. Calls OpenRouter LLM (`METADATA_MODEL` / `meta-llama/llama-3.1-8b-instruct:free`) to extract metadata: `document_date` (ISO YYYY-MM-DD or null), `document_type`, `provider_name`.
    5. Calls Python Wrapper `/extract-entities` (Layer 2).
    6. Calls Python Wrapper `/add-facts` (Layer 2).
    7. Updates `documents` table (`status = 'extracted'`) and `jobs` table (`status = 'complete'`).

- **Python Wrapper Endpoint**: `POST https://caregiver-briefing-tool.onrender.com/extract-pdf`
  - **Auth**: None (Internal service)
  - **Headers**: `Content-Type: application/json`
  - **Request Body**: `{"pdf_base64": "<base64_encoded_pdf>", "model": "<optional_model_override>"}`
  - **Response Body**:
    ```json
    {
      "extracted_text": "--- Page 1 ---\n...",
      "page_count": 1
    }
    ```
  - **Vision Fallback Chain**: `LAYER_1_VISION_MODEL` -> `openrouter/free` -> `nvidia/nemotron-nano-12b-v2-vl:free` -> `google/gemma-4-26b-a4b-it:free`.

---

### Layer 2: Medical Entity Extraction & FalkorDB Knowledge Graph Ingestion

- **Python Wrapper Endpoint**: `POST https://caregiver-briefing-tool.onrender.com/extract-entities`
  - **Request Body**: `{"text": "<raw_extracted_text>"}`
  - **Response Body**:
    ```json
    {
      "medications": [
        {
          "name": "Lisinopril",
          "dosage": "10mg",
          "frequency": "daily",
          "rxcui": "314077",
          "source": "med7-hf-api"
        }
      ],
      "lab_values": [
        {
          "test": "gfr",
          "value": "58",
          "unit": "ml/min/1.73m2",
          "source": "matcher"
        }
      ]
    }
    ```
  - **Extraction Strategy**:
    1. spaCy Matcher rules (57 test patterns + units) for lab values (deterministic).
    2. Med7 Hugging Face Inference API (`kormilitzin/en_core_med7_lg`) for clinical medication NER.
    3. OpenRouter LLM fallback (`EXTRACT_MODEL_CHAIN`) if Med7 API is unreachable.
    4. NIH RxNav API (`https://rxnav.nlm.nih.gov/REST/approximateTerm.json`) to enrich medications with RxCUI codes.

- **Python Wrapper Endpoint**: `POST https://caregiver-briefing-tool.onrender.com/add-facts`
  - **Request Body**:
    ```json
    {
      "patient_id": "<UUID>",
      "episode_text": "<full_extracted_text>",
      "source_doc_id": "<UUID>",
      "source_doc_date": "YYYY-MM-DD or null",
      "entities": [{"name": "Lisinopril"}, {"test": "gfr", "value": "58"}],
      "reference_time": "2026-08-01T14:22:55Z"
    }
    ```
  - **Response Body**:
    ```json
    {
      "status": "ok",
      "episode_uuid": "<UUID>",
      "nodes_extracted": 5,
      "edges_extracted": 4
    }
    ```
  - **Engine**: Graphiti core (`add_episode`) + FalkorDB driver + Gemini Embedder (`gemini-embedding-001`, dim 768).

---

### Layer 3: Patient State, Trend Retrieval & Briefing Generation

- **Edge Function Endpoint**: `POST https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-briefing`
  - **Auth**: Service Role JWT or User JWT
  - **Request Body**: `{"worker_name": "briefing-worker-1"}` (or claims job `job_type = 'generate_briefing'`)
  - **Job Payload**: `{"briefing_id": "<UUID>"}`
  - **Processing Flow**:
    1. Queries Python Wrapper `GET /patient-state/{patient_id}` for current active facts (`valid_to` IS NULL).
    2. Queries Python Wrapper `GET /trend/{patient_id}/{lab}` for labs `["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"]`.
    3. Calls NIH RxNav API for Drug-Drug Interaction (DDI) contraindication checks (`/interaction/list.json?rxcuis=...`).
    4. Calls OpenRouter LLM (`LLM_MODEL` / `anthropic/claude-3-haiku`) with patient state, temporal trends, DDI checks, and target audience.
    5. Executes Layer 4 PaperTrail verification.
    6. Saves final briefing into `public.briefings` table (`status = 'complete'`).
    7. Optionally triggers email notification via Resend API (`https://api.resend.com/emails`).

- **Python Wrapper Query Endpoints**:
  1. `GET https://caregiver-briefing-tool.onrender.com/patient-state/{patient_id}`
     - **Response**: `{"patient_id": "...", "current_facts": [{"fact": "...", "entity_name": "...", "valid_from": "...", "source_node_uuid": "..."}]}`
  2. `GET https://caregiver-briefing-tool.onrender.com/trend/{patient_id}/{entity_name}`
     - **Response**: `{"patient_id": "...", "entity_name": "GFR", "trend": [{"fact": "...", "valid_from": "...", "valid_to": "...", "is_current": true, "source_node_uuid": "..."}]}`
  3. `POST https://caregiver-briefing-tool.onrender.com/temporal-query`
     - **Request Body**: `{"patient_id": "...", "entity_name": "GFR", "valid_at": "2024-06-01"}`
     - **Response**: `{"patient_id": "...", "entity_name": "GFR", "valid_at": "...", "facts": [...]}`
  4. `GET https://caregiver-briefing-tool.onrender.com/health`
     - **Response**: `{"status": "ok", "llm_model": "...", "rerank_model": "...", "falkordb": "connected"}`

---

### Layer 4: PaperTrail Citation Verification

- **Execution Location**: Internal sub-pipeline in `process-briefing/index.ts`.
- **4-Stage Verification Pipeline**:
  1. **Stage 1 (Claim Decomposition)**: OpenRouter LLM call breaks generated briefing into atomic verifiable claims:
     ```json
     [
       {
         "claim_id": "c1",
         "claim_text": "GFR declined from 65 to 47",
         "claim_type": "source_document",
         "expected_evidence": "GFR lab history"
       }
     ]
     ```
  2. **Stage 2 (Atomic Evidence Extraction)**: Fetches `extracted_text` of all patient documents from Postgres `documents` table and extracts atomic evidence units via LLM.
  3. **Stage 3 (Claim-Evidence Matching)**:
     - **Strategy A (String Match)**: Exact substring match against source document quotes (`confidence: 1.0`).
     - **Strategy B (Semantic Match)**: LLM semantic evaluation prompt (`confidence >= 0.8` -> `SUPPORTED`, `0.5 <= confidence < 0.8` -> `PARTIALLY SUPPORTED`).
     - **Strategy C (Medical Knowledge)**: Grounded in NIH RxNav / DDI API contraindication data (`flag: MEDICAL_KNOWLEDGE`).
  4. **Stage 4 (Status Checking & Stripping)**:
     - Unsupported claims (`flag: UNSUPPORTED`) are classified as hallucinations.
     - Hallucinated claims are logged (`[REJECTED] Hallucination detected`) and programmatically stripped from `briefing_text`.
     - Verified claims are stored with citation metadata (`source_doc_id`, `source_quote`, `match_type`, `confidence`).

---

## 3. Test Dataset & Diagnostic Tooling Inventory

### Dataset Inventory (`synthea-test-data/`)
- On-disk status: `synthea-test-data/` directory is present but currently empty of pre-baked static files.
- Standalone dataset generator available: `tools/fhir_to_pdf.py`.
  - Converts Synthea FHIR R4 patient bundles into realistic multi-page clinical PDFs (Encounters -> visit note / lab report PDFs; plus summary medication & problem list PDFs) using `reportlab`.

### Diagnostic & Boundary Verification Scripts

| Script Path | Purpose | Key Verification Target |
|---|---|---|
| `tools/test_boundary1.ts` | Edge Function & DB job queue | `process-document` execution, `public.patients`, `public.documents`, `claim_next_job` RPC |
| `tools/test_boundary2.ts` | Briefing flow end-to-end | `process-briefing` execution, LLM reasoning, PaperTrail verification |
| `python/graphiti-wrapper/test_boundary3.py` | Python Backend <-> FalkorDB <-> OpenRouter | spaCy Matcher, OpenRouter connection, FalkorDB connection, RxNav API |
| `tools/verify_graph.py` | Read-only Graphiti verification | GET `/patient-state/{id}` and GET `/trend/{id}/{entity}` response validation |
| `tools/ingest_and_run.py` | End-to-end PDF ingestion harness | Uploads PDFs to storage bucket, queues jobs, invokes `process-document` Edge Function |

---

## 4. Live Diagnostic Readiness Assessment

1. **Schema & Contract Parity**: All 4 layers have well-defined, strongly-typed JSON request/response interfaces.
2. **Failure Resilience**: Edge Functions contain outer error handlers and fallback chains for vision, entity extraction, LLM reasoning, and graph drivers.
3. **PaperTrail Enforcement**: Anti-hallucination stripping is deterministically executed prior to updating `public.briefings`.

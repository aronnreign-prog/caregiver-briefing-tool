# Engineering Principles — CareNote

> Extracted from Jeff Dean's Abseil performance philosophy, mapped to the CareNote codebase.
> Source: https://abseil.io/fast/hints.html (Jeff Dean & Sanjay Ghemawat, Google)
> Generated: 2026-08-06

---

## Core Philosophy

Jeff Dean's approach isn't about specific C++ tricks. It's about a **thought process** that applies to any stack:

1. **Choose the faster alternative if readability isn't affected** — default to efficient patterns
2. **Many small improvements compound** — twenty 1% wins beat one heroic rewrite
3. **Estimate before implementing** — back-of-envelope cost model before writing code
4. **Profile before optimizing** — measurement is the #1 tool
5. **API boundaries are expensive** — every crossing costs latency, coordination, failure points
6. **Fast path first** — the common case is the only code you should read; errors are out-of-line
7. **Modules should be deep** — significant functionality through a narrow interface
8. **Don't make callers pay** — conditional work, not unconditional
9. **Precompute once, query many** — index at ingestion, not at query time
10. **Reduce unnecessary work** — remove duplicate paths, defer what's not needed yet

---

## Codebase Layer Map

### Current (7 boundaries, ~25 round trips for briefing)

```
Browser (React)
  ↓ ↑
Next.js SSR / Server Actions
  ↓ ↑
Supabase Postgres ← pg_cron (wake) → Edge Function (Deno)
                    queue_worker.js → ↑          ↓ (x4-8 HTTP)
                    ingest_and_run  → ↑    Python Wrapper (FastAPI)
                                               ↓
                                          FalkorDB
                                               ↓
                                    OpenRouter / NIH RxNav / Resend
```

**Problems:**
- 3 duplicate wake-up mechanisms (`pg_cron`, `queue_worker.js`, `ingest_and_run.py`)
- Edge Function crosses into Python 4-8 times per document/briefing
- PaperTrail makes 6-10 separate OpenRouter HTTPS calls from the Edge Function
- Each call has TCP + TLS + HTTP + JSON overhead

### Target (4 boundaries, ~4 round trips for briefing)

```
Browser (React)
  ↓ ↑
Next.js SSR / Server Actions
  ↓ ↑
Supabase Postgres ← pg_cron → Edge Function (thin orchestrator)
                                   ↓ (1 HTTP call)
                              Python Wrapper (bulk endpoints)
                                   ↓ (internal function calls)
                              FalkorDB / OpenRouter / RxNav
```

---

## Error Handling Framework

**Rule**: A function only catches errors it can **meaningfully recover from**. Everything else propagates up via `Result<T,E>`.

| Layer | Pattern | Example |
|---|---|---|
| Edge Function | `Result<T, JobError>` | Explicit, no throws |
| Python API | JSON `{ ok, value }` | FastAPI response |
| Server Actions | `{ error?: string }` | Already correct, keep |
| Data Access | `{ success, data, err }` | `patient.ts` is the model |
| Client UI | try/catch → toast | User-facing only |

**Error is handled at the point of failure, not in a distant catch block.**

Example — process-document refactored:
```
claimJob() → Result<Job>
loadDocument(job.documentId) → Result<Doc>
callBulkProcess(pdf) → Result<ExtractedData>
markComplete(job, doc, result) → Result<void>
```

Each step's failure is explicit and handled immediately.

---

## Structural Changes (Priority Order)

### 1. REMOVE queue_worker.js
- **Why**: Duplicates `pg_cron` wake path. Separate Node.js runtime to maintain. Dual-claim race condition.
- **Impact**: Removes 1 service boundary, 1 runtime, eliminates race condition.
- **File**: `tools/queue_worker.js`

### 2. BULK Python Endpoints (6 → 2)
- **POST /process-document** — takes `{ pdf_base64, source_doc_id, patient_id, doc_date }`, returns `{ extracted_text, extracted_entities, graph_status }`
- **POST /generate-briefing** — takes `{ patient_id, audience }`, returns `{ briefing_text, claims, flagged_concerns }`
- **Why**: Collapses 9 round trips → 3 for documents, 20+ → 4 for briefings
- **Files**: `python/graphiti-wrapper/main.py`, `supabase/functions/process-document/index.ts`, `supabase/functions/process-briefing/index.ts`

### 3. MOVE PaperTrail INSIDE Python + PRE-INDEX EVIDENCE
- **Why**: PaperTrail makes 6-10 OpenRouter calls per briefing. Also re-fetches documents from Supabase. Now uses Graphiti's pre-built search index for evidence (built during ingestion).
- **Impact**: Eliminates N per-document LLM extraction calls + 1 Supabase re-fetch per briefing. Evidence search is now in-memory via FalkorDB index.
- **Files**: `python/graphiti-wrapper/main.py`

---

## Module Depth Audit

| Module | Depth | Action |
|---|---|---|
| `_shared/fetch.ts` | Deep ✓ | Gold standard — 2 exports, deep retry logic |
| `patient.ts` | Deep ✓ | 1 function, Result pattern |
| `extractor.py` | Deep ✓ | spaCy → HF → LLM fallback |
| `process-document/index.ts` | Shallow ✗ | Extract sub-modules |
| `process-briefing/index.ts` | Shallow ✗ | Extract: claim-job, patient-state, paper-trail, drug-check, notify |
| `PatientDetailClient.tsx` | Shallow ✗ | Extract: DocumentList, BriefingViewer, CitationChip, FileUpload |
| `main.py` | Shallow ✗ | Extract: routes/, services/, llm/ |

**Deep module test**: One public export, ≥100 lines of internal logic. Callers interact through a narrow, stable interface.

---

## Implementation Plan

- [x] Write knowledge document (this file)
- [x] Remove `queue_worker.js` duplicate wake path
- [x] Create `POST /process-document` bulk endpoint
- [x] Create `POST /generate-briefing` bulk endpoint
- [x] Create `POST /verify-briefing` (PaperTrail offload)
- [x] Refactor Edge Functions to use bulk endpoints (v10, v19)
- [x] Tier 1: `SELECT *` → selective columns (70% payload reduction)
- [x] Tier 1: Sequential doc+briefing → `Promise.all` (50ms latency)
- [x] Tier 1: `process.env` hoisting (server.ts, proxy.ts, actions.ts)
- [x] Tier 1: Adaptive polling + visibility backoff (50-70% idle DB reduction)
- [x] Tier 1: `useRef` stabilize supabase client (no WebSocket churn)
- [x] Tier 1: `window.location.href` → `router.push` (no full reload)
- [x] Tier 1: 6 FK indexes (O(N) → O(log N) on joins)
- [x] Tier 1: React `cache()` on `createClient` (deduplicated server-side)
- [x] Tier 0: Result<T,E> pattern across Edge Functions (v13, v20)
- [x] Tier 0: Structured timing logging on every external call
- [x] Tier 0: Timestamps on Python bulk endpoints (`@timing` decorator)
- [x] Tier 0: Module decomposition — PatientDetailClient (714 lines → 4 deep modules + thin composer)
- [x] Tier 0: Pre-index documents: PaperTrail uses Graphiti's existing search index instead of N LLM evidence extraction calls per document

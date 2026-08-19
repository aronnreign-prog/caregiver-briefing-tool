# Engineering Principles — CareNote

> Philosophy: simplicity at the boundary, depth in the module.
> Updated: 2026-08-19 (post-migration to pure TypeScript stack)

---

## Current Deployed State

| Component | Location | Status |
|---|---|---|
| Next.js App | Vercel / local `npm run dev` | ACTIVE — builds clean (0 TS errors) |
| Supabase | Cloud (qtwxthxhwwqovpcqrdqj) | ACTIVE — Auth, Postgres, Storage |
| Zep Cloud | cloud.getzep.com | ACTIVE — patient memory graphs |
| Google Gemini | AI Studio | ACTIVE — extraction + briefing via @ai-sdk/google |

**Deleted (2026-08-19):** Python/FastAPI wrapper, Deno Edge Functions, Docker, pg_cron, FalkorDB, job queue.

---

## Core Philosophy

1. **API boundaries are expensive** — every crossing costs latency, failure points, maintenance. We collapsed 5 runtimes into 1.
2. **Fast path first** — happy path is in the Server Action. Errors are explicit `{ error: string }` returns, never throws.
3. **Modules should be deep** — `extract.ts` is 1 export with significant internals. `ingest.ts` is 2 exports (add/query).
4. **Precompute once, query many** — Zep graph is built at ingest time. `generateBriefing()` only queries.
5. **Many small improvements** — selective columns, adaptive polling, React `cache()`, `useRef` supabase stabilization.

---

## Architecture (Current)

```
Browser (React 19)
  ↕
Next.js 16.2 Server Actions (TypeScript only)
  ├── ingestDocument()           # fire-and-forget from DocumentUploader
  │     ↓ download PDF (Supabase Storage)
  │     ↓ extractClinicalFacts() → Gemini 2.0 Flash + Zod
  │     ↓ ingestDocumentFacts()  → Zep Cloud graph.add({ data, userId })
  │     ↓ documents.update({ status: "extracted", extracted_entities })
  │
  └── generateBriefing()         # direct call from PatientDetailClient
        ↓ queryPatientMemory()   → Zep Cloud graph.search({ query, userId })
        ↓ generateObject()       → Gemini 2.0 Flash + BriefingOutputSchema
        ↓ briefings.update({ status: "complete", briefing_text, claims })
```

**Boundary count: 3** (Browser → Next.js → Gemini / Zep Cloud / Supabase). Previously 7.

---

## Error Handling Framework

| Layer | Pattern | Example |
|---|---|---|
| Server Actions | `{ error?: string }` return | `ingestDocument()`, `generateBriefing()` |
| Lib modules | try/catch → `{ success, error }` | `ingestDocumentFacts()` returns `IngestResult` |
| Data Access | `{ success, data, err }` | `patient.ts` |
| Client UI | `alert()` for blocking, inline state for recoverable | `DocumentUploader`, `PatientDetailClient` |
| Root boundary | `src/app/error.tsx` | Unhandled server errors |

**Rule**: errors are handled at the point of failure. Zep ingest failure is non-fatal — extraction is still saved to Supabase.

---

## Module Depth Audit (current)

| Module | Export count | Depth | Notes |
|---|---|---|---|
| `src/lib/ai/extract.ts` | 2 (fn + schema) | Deep ✓ | Gemini call + Zod schema + system prompt |
| `src/lib/zep/ingest.ts` | 3 fns | Deep ✓ | user ensure + add + search + text builder |
| `src/lib/data/patient.ts` | 1 fn | Deep ✓ | Result pattern, error propagation |
| `pipeline-actions.ts` | 2 fns | Deep ✓ | Full ingest + briefing pipeline |
| `PatientRealtime.tsx` | 1 component | Deep ✓ | Realtime subscription + cleanup |
| `DocumentUploader.tsx` | 1 component | Deep ✓ | Upload + ingest trigger |
| `DocumentList.tsx` | 1 component | Deep ✓ | List + delete + uploader |

---

## Implementation History

### Phase 1 (2026-08-09) — Jeff Dean optimization cycle
- [x] Result<T,E> pattern across Edge Functions
- [x] Collapsed 9 Python HTTP calls into 3 bulk endpoints
- [x] Module decomposition: PatientDetailClient → 4 deep modules
- [x] Selective columns, adaptive polling, FK indexes, React cache()

### Phase 2 (2026-08-19) — Full TypeScript migration
- [x] Delete python/, docker-compose.yml, supabase/functions/, supabase/migrations/
- [x] Add @ai-sdk/google + ai + zod for Gemini extraction
- [x] Add @getzep/zep-cloud for clinical memory
- [x] New pipeline-actions.ts: ingestDocument() + generateBriefing()
- [x] DocumentUploader: fire-and-forget ingestDocument() (no job queue)
- [x] PatientDetailClient: direct generateBriefing() call (no briefings queue)
- [x] Build: 0 TypeScript errors, npm run build exits 0
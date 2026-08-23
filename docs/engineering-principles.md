# Engineering Principles — CareNote

> Philosophy: simplicity at the boundary, depth in the module.
> Updated: 2026-08-20 (post-migration to Better Auth + Drizzle/Neon + Vercel Blob + Gemini 2.5 Flash)

---

## Current Deployed State

| Component | Location | Status |
|---|---|---|
| Next.js App | Vercel / local `npm run dev` | ACTIVE — builds clean (0 TS errors) |
| Better Auth | Embedded in Next.js (`/api/auth/[...all]`) | ACTIVE — Cookie sessions with Drizzle adapter |
| Neon Postgres | Serverless PostgreSQL (`drizzle-orm/neon-http`) | ACTIVE — Drizzle schema management |
| Vercel Blob | `@vercel/blob` / Vercel Storage | ACTIVE — PDF medical record storage |
| Zep Cloud | cloud.getzep.com | ACTIVE — patient memory graph |
| Google Gemini | AI Studio | ACTIVE — Gemini 2.5 Flash extraction + briefing via @ai-sdk/google |

**Deleted:** Supabase (Auth, Storage, Postgres client), Python/FastAPI wrapper, Deno Edge Functions, Docker, pg_cron, FalkorDB, job queues.

---

## Core Philosophy

1. **API boundaries are expensive** — every crossing costs latency, failure points, maintenance. We collapsed disparate services into a pure TypeScript monolith natively deployed to Vercel.
2. **Fast path first** — happy path is in Server Actions and typed API routes. Errors are explicit `{ error: string }` returns, never unhandled throws.
3. **Modules should be deep** — `extract.ts` is 1 export with rich extraction logic. `ingest.ts` manages Zep graph memory.
4. **Precompute once, query many** — Facts are extracted at upload time into Neon and Zep. `generateBriefing()` synthesizes directly from verified data.
5. **Automated self-healing memory** — Zep Cloud is the single source of truth for longitudinal clinical memory. If graph memory is ever empty or wiped, the pipeline automatically re-extracts from Vercel Blob PDFs and re-ingests.

---

## Architecture (Current)

```
Browser (React 19)
  ↕
Next.js 16.2 Server Actions / Route Handlers (TypeScript only)
  ├── ingestDocument()           # triggered from DocumentUploader
  │     ↓ download PDF (@vercel/blob)
  │     ↓ extractClinicalFacts() → Gemini 2.5 Flash + Zod
  │     ↓ ingestDocumentFacts()  → Zep Cloud graph.add({ data, userId })
  │     ↓ db.update(documents, { status: "extracted", document_date, document_type })
  │
  └── generateBriefing()         # direct call from PatientDetailClient
        ↓ queryPatientMemory()   → Zep Cloud graph.search + episodes.getByUserId
        ↓ self-heal fallback: re-extract from Blob PDFs if graph memory empty
        ↓ generateObject()       → Gemini 2.5 Flash + BriefingOutputSchema
        ↓ db.update(briefings, { status: "complete", briefing_text, claims })
```

**Boundary count: 3** (Browser → Next.js → Gemini / Zep Cloud / Neon DB).

---

## Error Handling Framework

| Layer | Pattern | Example |
|---|---|---|
| Server Actions | `{ error?: string }` return | `ingestDocument()`, `generateBriefing()` |
| Lib modules | try/catch → `{ success, error }` | `ingestDocumentFacts()` returns `IngestResult` |
| Data Access | `{ success, data, err }` | `patient.ts` |
| Client UI | `alert()` for blocking, inline state for recoverable | `DocumentUploader`, `PatientDetailClient` |
| Root boundary | `src/app/error.tsx` | Unhandled server errors |

**Rule**: Errors are handled at the point of failure. Zep ingest failure is non-fatal — extraction is always persisted to Neon PostgreSQL.

---

## Module Depth Audit (Current)

| Module | Export count | Depth | Notes |
|---|---|---|---|
| `src/lib/ai/extract.ts` | 2 (fn + schema) | Deep ✓ | Gemini 2.5 Flash call + Zod schema + system prompt |
| `src/lib/zep/ingest.ts` | 3 fns | Deep ✓ | user ensure + add + search + text builder |
| `src/lib/data/patient.ts` | 1 fn | Deep ✓ | Result pattern, error propagation |
| `pipeline-actions.ts` | 4 fns | Deep ✓ | Full ingest + briefing pipeline with auto-extraction |
| `DocumentUploader.tsx` | 1 component | Deep ✓ | Direct Vercel Blob client upload + ingest trigger |
| `DocumentList.tsx` | 1 component | Deep ✓ | List + delete + dropzone uploader |

---

## Implementation History

### Phase 1 (2026-08-09) — Optimization cycle
- [x] Result<T,E> pattern across functions
- [x] Collapsed Python HTTP calls into bulk endpoints
- [x] Module decomposition: PatientDetailClient → 4 deep modules
- [x] Selective columns, adaptive polling, React cache()

### Phase 2 (2026-08-19) — Pure TypeScript migration
- [x] Delete python/, docker-compose.yml, supabase/functions/, supabase/migrations/
- [x] Add @ai-sdk/google + ai + zod for Gemini extraction
- [x] Add @getzep/zep-cloud for clinical memory

### Phase 3 (2026-08-20) — Supabase Elimination & Monolith Unification
- [x] Replace Supabase Auth with Better Auth (cookie sessions, Drizzle adapter)
- [x] Replace Supabase Postgres with Drizzle ORM + Neon Serverless Postgres
- [x] Replace Supabase Storage with @vercel/blob
- [x] Upgrade model from gemini-2.0-flash to gemini-2.5-flash everywhere
- [x] Build: 0 TypeScript errors, production deployment live on Vercel
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Architecture — CareNote (Caregiver Briefing Tool)

## Stack

```
Browser (React 19) → Next.js 16.2 SSR/Server Actions → Supabase Postgres + Storage
                        ↓ pg_cron HTTP POST
                  Edge Functions (Deno, v13/v20)
                        ↓ 1 bulk HTTP call per operation
                  Python Wrapper (FastAPI, Render)
                        ↓ internal calls
                  FalkorDB Graph DB + OpenRouter LLM + NIH RxNav + Resend
```

## Key Files

| Layer | File | Purpose |
|---|---|---|
| Dashboard | `src/app/dashboard/page.tsx` | Patient cards, selective columns |
| Patient Detail | `src/app/dashboard/patients/[id]/page.tsx` | Parallel doc+briefing fetch |
| Client Decomposition | `PatientDetailClient.tsx`, `PatientRealtime.tsx`, `DocumentUploader.tsx`, `DocumentList.tsx`, `PipelineBar.tsx` | Deep modules |
| Server Actions | `src/app/dashboard/actions.ts` | deletePatient, deleteDocument (FalkorDB sync) |
| Auth Actions | `src/app/auth/actions.ts` | signup (returns error on caregiver insert failure) |
| Error Boundary | `src/app/error.tsx` | Root error UI for all routes |
| Edge: Document | `supabase/functions/process-document/index.ts` | Result<T,E> step pipeline (v13) |
| Edge: Briefing | `supabase/functions/process-briefing/index.ts` | Result<T,E> step pipeline (v20) |
| Shared | `supabase/functions/_shared/result.ts`, `fetch.ts` | Result type, fetchWithRetry/fetchRender |
| Python | `python/graphiti-wrapper/main.py` | 12 endpoints, 3 bulk, @timing decorator |
| Migrations | `supabase/migrations/` | FK indexes, job queue RPC, pg_cron |
| Knowledge | `.references/engineering-principles.md` | Jeff Dean philosophy applied |
| Config | `kilo.json` | Render MCP server |

## Engineering Principles (Applied)

1. **Deep modules** — 1 export, significant internals (PatientRealtime, DocumentUploader, DocumentList, PipelineBar, result.ts)
2. **API boundaries expensive** — collapsed 9 Python HTTP calls into 3 bulk endpoints
3. **Fast path first** — Result<T,E> across Edge Functions; errors at point of failure
4. **Precompute once** — PaperTrail uses Graphiti search index (built during ingestion)
5. **Many small improvements** — selective columns, env hoisting, adaptive polling, FK indexes, cache()

## Error Handling Philosophy

- **Edge Functions**: Result<T,E> — no throws, every error is explicit
- **Python**: @timing decorator for latency, structured logging
- **Server Actions**: `{ error?: string }` return pattern
- **Client**: alert() for critical, inline error state for recoverable
- **Root boundary**: `src/app/error.tsx` for unhandled errors

## Debugging Entry Point

```sql
SELECT status, error_message, started_at, completed_at
FROM jobs WHERE job_type = 'generate_briefing'
ORDER BY created_at DESC LIMIT 5;
```

Then trace via Render MCP (Python logs), Supabase Edge Function logs, and structured timing output.

## Deployments

| Component | Location | Version |
|---|---|---|
| Edge Function: process-document | Supabase | v13 |
| Edge Function: process-briefing | Supabase | v20 |
| Python Wrapper | Render | dep-d9q89rd3erlc738m0f4g (live) |
| Next.js App | (local dev) | — |
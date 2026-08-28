# Workspace Rules — Caregiver Briefing Tool

> These rules are scoped to this project. They extend (not replace) the project rules in `/AGENTS.md`.

---

## Architecture State (Updated 2026-08-20)

The codebase has been fully migrated twice:
1. **2026-08-19**: Python/Deno/Docker → TypeScript Next.js monolith
2. **2026-08-20**: Supabase (Auth + Postgres + Storage) → Better Auth + Drizzle/Neon + Vercel Blob

### What Changed (2026-08-20 migration)

**Deleted:**
- `src/lib/supabase/` (server.ts, client.ts) — Supabase clients gone entirely
- `supabase/config.toml` — Supabase project config
- `@supabase/ssr`, `@supabase/supabase-js` — uninstalled from package.json
- `PatientRealtime.tsx` — deleted (polling handled by PatientDetailClient)

**Added:**
- `src/lib/auth.ts` — Better Auth instance (Drizzle adapter, email/password)
- `src/lib/auth-session.ts` — `getSession()` + `getCaregiver()` React cache() helpers
- `src/lib/auth-client.ts` — browser-side Better Auth client
- `src/lib/db/schema.ts` — Drizzle table definitions (caregivers, patients, documents, briefings)
- `src/lib/db/index.ts` — Neon serverless + Drizzle client
- `drizzle.config.ts` — Drizzle Kit config
- `src/app/api/auth/[...all]/route.ts` — Better Auth catch-all handler
- `src/app/api/upload/route.ts` — Vercel Blob server upload handler
- `src/app/api/patients/[id]/documents/route.ts` — polling API
- `src/app/api/patients/[id]/briefings/route.ts` — polling API

**Updated:**
- `src/proxy.ts` — Better Auth session check (was Supabase)
- `src/app/auth/actions.ts` — Better Auth sign-in/sign-up/sign-out (was Supabase Auth)
- `src/app/dashboard/actions.ts` — Drizzle queries (was Supabase client)
- `src/app/dashboard/patients/[id]/pipeline-actions.ts` — Drizzle + Vercel Blob + Gemini 2.5 Flash + 3-Layer Zep Retrieval
- `src/app/dashboard/patients/[id]/DocumentUploader.tsx` — @vercel/blob upload (was Supabase Storage)
- `src/app/dashboard/patients/[id]/PatientDetailClient.tsx` — fetch() polling (was supabase.from())
- `src/app/dashboard/page.tsx` — Drizzle queries (was Supabase)
- `src/app/dashboard/patients/[id]/page.tsx` — Drizzle queries (was Supabase)
- `src/lib/data/patient.ts` — Drizzle query (was Supabase)
- `src/types/database.ts` — `blob_url` replaces `storage_path`
- AI model: `gemini-3.1-flash-lite` for high rate limit dev & testing (configurable via `AI_MODEL`)

### Debugging Guide

When a document or briefing fails:
1. Query Neon DB — `SELECT id, status, error_message FROM documents ORDER BY uploaded_at DESC LIMIT 5;`
2. Query Neon DB — `SELECT id, status, error_message FROM briefings ORDER BY created_at DESC LIMIT 5;`
3. Next.js server logs: look for `[Pipeline]`, `[Briefing]`, `[Zep]` prefixes
4. Zep Cloud dashboard for graph data issues

### Files to Not Touch Without Care

- `src/lib/zep/ingest.ts` — uses Zep Cloud v2 graph API (`client.graph.add` / `client.graph.search`). The userId is a composite `caregiver-{id}-patient-{id}` — changing this breaks memory lookup.
- `src/lib/ai/extract.ts` — `ClinicalExtractionSchema` is the source of truth for extracted shape. Changes here cascade to `pipeline-actions.ts` and `database.ts`.
- `src/lib/auth-session.ts` — uses React `cache()`. Must return the same session per request.
- `src/lib/db/schema.ts` — Drizzle schema is the source of truth. Changes require `npx drizzle-kit push` to sync Neon.
- `src/app/dashboard/patients/[id]/pipeline-actions.ts` — contains the full ingestion + briefing pipeline. Keep `'use server'` at top.



---

## Model Routing — When to Switch

The user runs THREE tools: **ZCode (DeepSeek V4 Pro)**, **Claude Sonnet (Antigravity CLI)**, and **Gemini (Antigravity CLI)**.
Each has different strengths and costs. The agent MUST recommend a switch at the start of any task where a different model would be more efficient.

### Routing Table

| Task Type | Best Model | Why |
|---|---|---|
| Boilerplate scaffolding (Next.js pages, SQL, Tailwind) | **ZCode** | Cheapest per token, strong at TypeScript boilerplate |
| Drizzle schema, Better Auth config, Vercel Blob wiring | **ZCode** | Fast and cheap for known patterns |
| Novel/complex logic (Zep graph, Gemini schema, claim matching) | **Claude Sonnet** | Best reasoning for novel code |
| Debugging (server action failures, Zep/Gemini API errors) | **Claude Sonnet** | Strong chain-of-thought for root cause |
| Pipeline orchestration (ingest → extract → ingest flow) | **Claude Sonnet** | Complex async state |
| Research (Zep Cloud API docs, AI SDK docs, Supabase internals) | **Gemini** | Web access, good at summarizing |
| Planning / architecture review | **Gemini** | Structured analysis, cheap for long context |
| UI components (shadcn/ui, Tailwind, React) | **ZCode** | Fast at component boilerplate |
| Citation chip / PDF highlight UI | **Claude Sonnet** | Non-trivial interactivity |
| Writing tests | **ZCode** | Pattern-matching task |

### Default Rule
- **Default to ZCode** for boilerplate/known patterns
- **Escalate to Claude Sonnet** for novel logic, debugging, Zep/AI SDK work
- **Escalate to Gemini** only for research/reading (not code generation)

---

## Token Efficiency Rules

1. **No re-summarizing context files.** The user has read the docs.
2. **Show diffs, not full files** for small edits.
3. **Skip explaining boilerplate.** Only explain non-obvious decisions.
4. **Commit after each task.** Do not batch multiple tasks.
5. **No confirmation for trivial decisions.** Decide and note it.

---

## Project Location

- Root: `C:\Users\Dell\caregiver-briefing-tool\`
- All paths relative to this root.
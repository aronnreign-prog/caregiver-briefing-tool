# Workspace Rules — Caregiver Briefing Tool

> These rules are scoped to this project. They extend (not replace) the project rules in `/AGENTS.md`.

---

## Architecture State (Updated 2026-08-19)

The codebase was fully migrated from a distributed Python/Deno/Docker microservice into a clean, 100% TypeScript Next.js app. All legacy runtimes have been deleted.

### What Changed (2026-08-19 migration)

**Deleted:**
- `python/graphiti-wrapper/` — replaced by Gemini 2.0 Flash in TypeScript
- `docker-compose.yml` — no longer needed
- `supabase/functions/` (process-document, process-briefing, _shared) — replaced by Server Actions
- `supabase/migrations/` (all 13 SQL files) — jobs table, pg_cron, queue RPC all gone

**Added:**
- `src/lib/ai/extract.ts` — `extractClinicalFacts(buffer, filename)` using `@ai-sdk/google` + Zod
- `src/lib/zep/ingest.ts` — `ingestDocumentFacts()` + `queryPatientMemory()` using `@getzep/zep-cloud` v2 graph API
- `src/app/dashboard/patients/[id]/pipeline-actions.ts` — `'use server'` actions for `ingestDocument()` + `generateBriefing()`

**Updated:**
- `DocumentUploader.tsx` — calls `ingestDocument()` directly after upload (no job queue)
- `PatientDetailClient.tsx` — calls `generateBriefing()` directly (no job insert)
- `dashboard/actions.ts` — removed all FalkorDB/Render fetch calls
- `types/database.ts` — removed Job type; added Condition; simplified Document status enum

### Debugging Guide

When a document or briefing fails:
1. Check `documents` table — `status` + `error_message` columns
2. Check `briefings` table — `status` + `error_message` columns
3. Next.js server logs: look for `[Pipeline]`, `[Briefing]`, `[Zep]` prefixes
4. Zep Cloud dashboard for graph data issues

### Files to Not Touch Without Care

- `src/lib/zep/ingest.ts` — uses Zep Cloud v2 graph API (`client.graph.add` / `client.graph.search`). The userId is a composite `caregiver-{id}-patient-{id}` — changing this breaks memory lookup.
- `src/lib/ai/extract.ts` — `ClinicalExtractionSchema` is the source of truth for extracted shape. Changes here cascade to `pipeline-actions.ts` and `database.ts`.
- `src/lib/supabase/server.ts` — uses React `cache()`. Must return the same client per request.
- `src/app/dashboard/patients/[id]/pipeline-actions.ts` — contains the full ingestion + briefing pipeline. Keep `'use server'` at top.

---

## Model Routing — When to Switch

The user runs THREE tools: **ZCode (DeepSeek V4 Pro)**, **Claude Sonnet (Antigravity CLI)**, and **Gemini (Antigravity CLI)**.
Each has different strengths and costs. The agent MUST recommend a switch at the start of any task where a different model would be more efficient.

### Routing Table

| Task Type | Best Model | Why |
|---|---|---|
| Boilerplate scaffolding (Next.js pages, SQL, Tailwind) | **ZCode** | Cheapest per token, strong at TypeScript boilerplate |
| Supabase client wiring, env vars, RLS | **ZCode** | Fast and cheap for known patterns |
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
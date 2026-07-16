# CONTEXT_ESSENCE.md — Read This First On Any Fresh Session

> One-screen project identity + verified-working state + caveats. Replace scroll-back.

## Identity
Caregiver Briefing Tool: extracts medical PDFs → builds a bi-temporal knowledge
graph (Graphiti + FalkorDB) → generates caregiver briefings with citations.
Multi-layer pipeline orchestrated by a Supabase job queue (SKIP LOCKED `claim_next_job`).

## Core stack
- **Frontend/API:** Next.js (custom fork — read `node_modules/next/dist/docs/` before coding).
- **DB/Queue/Edge:** Supabase (Postgres + Edge Functions in `supabase/functions/`).
  Job worker: `process-document` calls `rpc('claim_next_job')` (migration `0001_claim_next_job.sql`).
- **Graph layer:** `python/graphiti-wrapper` (FastAPI) + FalkorDB (`docker-compose.yml`, Redis port 6379).
- **LLMs:** OpenRouter, env-driven models (`.agents/MODELS.md`): `LAYER_1_VISION_MODEL` (process-document),
  `LLM_MODEL` (process-briefing). Code `||` fallbacks are the truth, not the doc.

## Verified-working state (as of last commit)
- `requirements.txt`: `graphiti-core[falkordb]==0.29.2`, `pydantic>=2.11.5`. Correct falkordb import:
  `from graphiti_core.driver.falkordb_driver import FalkorDriver`.
- `process-document/index.ts` uses real OpenRouter extraction; document_date is NULL
  when unextracted (never `now()` — Rule M2).
- Pipeline end-to-end: PDF → extract → Graphiti `add-facts` → briefing.

## Key env / gotchas
- MCP scope: `apply_migration`=branch, `execute_sql`/`list_tables`=prod/main.
- `.env.local` is local-only; prod reads Supabase Secrets. `OPENROUTER_API_KEY` is MISSING locally.
- `FALKORDB_URI=bolt://...` in `.env.local` is WRONG scheme; stack uses `host:6379` (Redis).
- Build cache ghosts: run `docker builder prune -f` before `docker compose build --no-cache`
  if a stale layer shows a string absent from disk.

## Caveats (do NOT silently reverse)
- **med7 removed** from `requirements.txt` (stale `==any` BuildKit layer). Entity
  extraction = OpenRouter LLM only. Re-add med7 only with a valid wheel URL.
- Rules/lessons: `.agents/rules/self-correction.md` (Rules 1-7, M1-M7),
  `.agents/skills/strict-spec-adherence/SKILL.md` (FM-1..FM-12). ENV truth: `ENV_TRUTH.md`.
- NEVER blind-retry builds >2x; websearch the exact error + introspect the installed
  package BEFORE editing (Rule 7 / M7).

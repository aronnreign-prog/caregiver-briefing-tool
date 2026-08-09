# Workspace Rules — Caregiver Briefing Tool

> These rules are scoped to this project. They extend (not replace) the project rules in `/AGENTS.md`.

---

## Architecture State (Updated 2026-08-09)

The codebase has been through a full Jeff Dean engineering optimization cycle. See `.references/engineering-principles.md` for the complete rationale and implementation log.

### What's New

- **3 bulk Python endpoints**: `/process-document`, `/generate-briefing`, `/verify-briefing` (collapsed from 9 HTTP calls)
- **Result<T,E> pattern**: `supabase/functions/_shared/result.ts` — used by both Edge Functions
- **Module decomposition**: `PatientDetailClient` split into 4 deep modules (PatientRealtime, DocumentUploader, DocumentList, PipelineBar)
- **PaperTrail in Python**: Evidence extraction now uses Graphiti's pre-built search index
- **Error visibility**: 9/10 gaps closed; root `error.tsx` added; signup returns error on caregiver insert failure
- **Render MCP**: configured in `kilo.json` for service deployment, logs, and monitoring
- **Structured timing**: `[timing]` logs on every external call across Edge Functions and Python

### Debugging Guide

When a document or briefing fails:
1. Query `jobs` table — `error_message` field contains exact failure reason
2. Check Edge Function logs for `[timing]` entries and Result errors
3. Use Render MCP to fetch Python logs for Graphiti/LLM issues
4. PaperTrail failure: claims are marked UNVERIFIED with ⚠ warning in briefing text

### Files to Not Touch Without Care

- `python/graphiti-wrapper/main.py` — `logger` is module-scope, `graphiti` is initialized in lifespan. The `@timing` decorator depends on `logger`.
- `supabase/functions/_shared/result.ts` — used by both Edge Functions. API: `ok()`, `err()`, `errStr()`, `logTiming()`, `Result<T,E>`.
- `src/lib/supabase/server.ts` — uses React `cache()`. Must return the same client per request.

---

## Model Routing — When to Switch

> **Runtime pipeline models** (OpenRouter, env-driven) live in `.agents/MODELS.md`.
> This section is about *which coding agent* to use, not runtime LLM calls.

The user runs THREE tools: **ZCode (DeepSeek V4 Pro)**, **Claude Sonnet (Antigravity CLI)**, and **Gemini (Antigravity CLI)**.
Each has different strengths and costs. The agent MUST recommend a switch at the start of any task where a different model would be more efficient.

### Routing Table

| Task Type | Best Model | Why |
|---|---|---|
| Boilerplate scaffolding (Next.js pages, SQL migrations, Docker configs) | **ZCode** | Cheapest per token, strong at TypeScript boilerplate |
| Edge Function wiring (Supabase client, job queue, env vars) | **ZCode** | Fast and cheap for known patterns |
| Novel/complex logic (PaperTrail, Graphiti, claim-evidence matching) | **Claude Sonnet** | Best reasoning for novel code |
| Debugging (stack traces, distributed system failures, cascading errors) | **Claude Sonnet** | Strong chain-of-thought for root cause |
| Pipeline orchestration (multi-step async, retry logic, error handling) | **Claude Sonnet** | Complex state machines |
| Performance optimization (indexes, query plans, N+1 analysis) | **Claude Sonnet** | Deep reasoning about cost models |
| Research (API docs, Graphiti internals, external service shape) | **Gemini** | Web access, good at summarizing |
| Planning / architecture review | **Gemini** | Structured analysis, cheap for long context |
| UI components (shadcn/ui, Tailwind, React) | **ZCode** | Fast at component boilerplate |
| Citation chip / PDF highlight UI | **Claude Sonnet** | Non-trivial interactivity |
| Writing tests | **ZCode** | Pattern-matching task |
| Error handling audits / visible error propagation | **Claude Sonnet** | Cross-layer analysis |

### Default Rule
- **Default to ZCode** for boilerplate/known patterns
- **Escalate to Claude Sonnet** for novel logic, debugging, distributed system work
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
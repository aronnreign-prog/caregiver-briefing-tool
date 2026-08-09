# Runtime Model Assignment (OpenRouter)

> **Scope:** This file defines the OpenRouter models used by the *running pipeline*
> (Supabase Edge Functions + Python wrapper), NOT which coding *agent* to use.
> For coding-agent routing (ZCode / Claude Sonnet / Gemini), see
> `.agents/AGENTS.md` and `.agents/skills/model_routing/SKILL.md`.
>
> **Principle:** All runtime models are env-driven. To switch a model, edit the
> env var — **never** hardcode a model in code.

## Env Var → Default Model → Used By

| Env Var | Default | Where Read | Task |
|---|---|---|---|
| `LAYER_1_VISION_MODEL` | `qwen/qwen-2-vl-7b-instruct:free` | `process-document/index.ts` | PDF → text extraction (vision/multimodal) |
| `METADATA_MODEL` | `meta-llama/llama-3.1-8b-instruct:free` | `process-document/index.ts` | Document metadata extraction (type, date, provider) |
| `LLM_MODEL` | `anthropic/claude-3-haiku` | `process-briefing/index.ts` | Briefing generation + PaperTrail verification |
| `OPENROUTER_API_KEY` | — | both functions + Python wrapper | Auth for all OpenRouter calls |

## Model Usage in Edge Functions (v13, v20)

### process-document (v13) — Result<T,E> step pipeline
- `extractMetadata()` — `METADATA_MODEL` for document type/date/provider
- `processPdfBulk()` — delegates PDF→text to Python `/process-document` (uses `LAYER_1_VISION_MODEL`)

### process-briefing (v20) — Result<T,E> step pipeline
- `generateBriefingLLM()` — `LLM_MODEL` for briefing text + claims + flagged concerns
- `checkDrugInteractions()` — NIH RxNav API (no LLM, free REST API)
- `runPaperTrail()` — delegates to Python `/verify-briefing` (uses Graphiti search + LLM)

## Python Wrapper Models

The Python wrapper's Graphiti client uses the same `OPENROUTER_API_KEY` via its own LLM configuration. See `python/graphiti-wrapper/main.py` for `LLM_CONFIG` setup.

## How to Override

Set env vars in Supabase Edge Function secrets:
```
supabase secrets set LAYER_1_VISION_MODEL=google/gemma-3-4b-it:free
supabase secrets set LLM_MODEL=deepseek/deepseek-chat-v3-0324:free
```

Or for Python wrapper, set the env var on the Render dashboard.
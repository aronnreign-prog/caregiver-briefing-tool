# Runtime Model Assignment (OpenRouter)

> **Scope:** This file defines the OpenRouter models used by the *running pipeline*
> (Supabase Edge Functions + Python wrapper), NOT which coding *agent* to use.
> For coding-agent routing (ZCode / Claude Sonnet / Gemini), see
> `.agents/AGENTS.md` and `.agents/skills/model_routing/SKILL.md`.
>
> **Principle:** All runtime models are env-driven. To switch a model, edit the
> env var — **never** hardcode a model in code. Free OpenRouter models are the
> default; paid models are opt-in via env override.

## Env Var → Default Model → Used By

| Env Var | Default (free) | Where read | Task |
|---|---|---|---|
| `LAYER_1_VISION_MODEL` | `qwen/qwen-2-vl-7b-instruct:free` | `process-document/index.ts:84` | PDF → text + structured medical extraction (vision/multimodal) |
| `LLM_MODEL` | `anthropic/claude-3-haiku` | `process-briefing/index.ts:147` | Layer 3 reasoning, PaperTrail claim-evidence matching, briefing generation |
| `OPENROUTER_API_KEY` | — | both functions | Auth for all OpenRouter calls |

## How to override (no code edit)

Set the env var in the Supabase Edge Function secrets (Dashboard →
Project Settings → Edge Functions → Secrets) or local `.env.local`:

```
LAYER_1_VISION_MODEL=google/gemma-3-4b-it:free
LLM_MODEL=deepseek/deepseek-chat-v3-0324:free
```

## Free-model options (OpenRouter)

- Vision / document extraction: `qwen/qwen-2-vl-7b-instruct:free`, `google/gemma-3-4b-it:free`
- General reasoning: `anthropic/claude-3-haiku` (cheap, not tagged free),
  `deepseek/deepseek-chat-v3-0324:free`, `meta-llama/llama-3.2-3b-instruct:free`
- Avoid paid models unless explicitly requested by the user.

## Python wrapper (Graphiti)

The FastAPI Graphiti wrapper uses its own LLM config (see
`python/graphiti-wrapper/`). If it calls OpenRouter, use the same
`OPENROUTER_API_KEY` + an env var (e.g. `GRAPHITI_LLM_MODEL`); do not hardcode.

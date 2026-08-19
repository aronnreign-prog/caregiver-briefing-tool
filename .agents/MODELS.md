# Runtime Model Assignment

> **Scope:** This file defines which AI models the *running pipeline* uses, NOT which coding *agent* to use.
> For coding-agent routing (ZCode / Claude Sonnet / Gemini), see `.agents/AGENTS.md`.
>
> **Principle:** All runtime models are env-driven. To switch a model, edit the env var — never hardcode a model in code.

## Env Var → Model → Used By

| Env Var | Default | Where Read | Task |
|---|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | — | `src/lib/ai/extract.ts`, `pipeline-actions.ts` | All Gemini calls (extraction + briefing). **Required.** |
| `ZEP_API_KEY` | — | `src/lib/zep/ingest.ts` | Zep Cloud graph ingestion + search. **Required.** |

## Model Used

All AI calls use **Google Gemini 2.0 Flash** via `@ai-sdk/google`:
- `extractClinicalFacts()` — `google("gemini-2.0-flash")` + `generateObject()` + Zod schema
- `generateBriefing()` — `google("gemini-2.0-flash")` + `generateObject()` + Zod schema

## How to Override the Model

Edit `src/lib/ai/extract.ts` and `src/app/dashboard/patients/[id]/pipeline-actions.ts`:
```ts
// Change model string — any model supported by @ai-sdk/google works
const model = google("gemini-2.5-flash")  // or gemini-2.5-pro, etc.
```

No env var needed for model selection — the model is in code. The API key is env-driven.

## Zep Cloud v2 API Reference

- **Add data**: `client.graph.add({ data: string, type: "text", userId: string })`
- **Search**: `client.graph.search({ query: string, userId: string, limit: number })`
- **Create user**: `client.user.add({ userId: string })`
- **userId convention**: `caregiver-{caregiverId}-patient-{patientId}`
# Runtime Model Assignment

> **Scope:** This file defines which AI models the *running pipeline* uses, NOT which coding *agent* to use.
> For coding-agent routing (ZCode / Claude Sonnet / Gemini), see `.agents/AGENTS.md`.

## Env Var → Model → Used By

| Env Var | Where Read | Task |
|---|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | `src/lib/ai/extract.ts`, `pipeline-actions.ts` | All Gemini calls (extraction + briefing). **Required.** |
| `ZEP_API_KEY` | `src/lib/zep/ingest.ts` | Zep Cloud graph ingestion + search. **Required.** |

## Model Used

All AI pipeline calls use **Google Gemini 2.5 Flash** (`gemini-2.5-flash`) via `@ai-sdk/google`:
- `extractClinicalFacts()` — `google('gemini-2.5-flash')` + `generateObject()` + Zod schema
- `generateBriefing()` — `google('gemini-2.5-flash')` + `generateObject()` + Zod schema

## Zep Cloud v2 API Reference

- **Add episode**: `client.graph.add({ data: string, type: 'text', userId: string })`
- **Search facts**: `client.graph.search({ query: string, userId: string, limit: number })`
- **Get episodes**: `client.graph.episode.getByUserId(userId, { lastn: number })`
- **Create user**: `client.user.add({ userId: string })`
- **userId convention**: `caregiver-{caregiverId}-patient-{patientId}`
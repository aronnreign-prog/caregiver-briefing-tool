# ENV_TRUTH.md — Environment Variable Source of Truth

> Updated: 2026-08-19 (post-migration to pure TypeScript stack)

## Required Variables

| Variable | Where Set | Read By | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Supabase client (browser + server) | Public — safe to expose |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Supabase client (browser + server) | Public — safe to expose |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | `src/app/auth/actions.ts` (signup only) | **Server-only. Never expose to browser.** |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `.env.local` | `src/lib/ai/extract.ts`, `pipeline-actions.ts` | Read automatically by `@ai-sdk/google`. **Server-only.** |
| `ZEP_API_KEY` | `.env.local` | `src/lib/zep/ingest.ts` | **Server-only.** |

## Deleted Variables (no longer used)

These were removed with the 2026-08-19 migration. Do not re-add them.

| Variable | Was Used By | Reason Deleted |
|---|---|---|
| `GRAPHITI_WRAPPER_URL` | `dashboard/actions.ts` | Python wrapper deleted |
| `OPENROUTER_API_KEY` | Edge Functions, Python wrapper | Replaced by `GOOGLE_GENERATIVE_AI_API_KEY` |
| `OPENAI_API_KEY` | Legacy | Removed |
| `ANTHROPIC_API_KEY` | Legacy | Removed |
| `FALKORDB_HOST` / `FALKORDB_PORT` / `FALKORDB_PASSWORD` | Python wrapper | FalkorDB deleted |
| `LAYER_1_VISION_MODEL` / `METADATA_MODEL` / `LLM_MODEL` | Edge Functions | Edge Functions deleted |
| `HF_TOKEN` | Python extractor | Python deleted |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Python | Python deleted |
| `RESEND_API_KEY` | Python notify | Python deleted |
| `RENDER_API_KEY` | Render MCP | Render service deleted |
| `NGROK_AUTH_TOKEN` | Tunnel | Only needed for local dev tunnel, not production |

## Verification Checklist

Before running locally:
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service role key
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` — Google AI Studio key (gemini-2.0-flash access required)
- [ ] `ZEP_API_KEY` — Zep Cloud API key (create project at cloud.getzep.com)

Before deploying to Vercel:
- Set all 5 variables above in Vercel project environment settings
- `NEXT_PUBLIC_*` vars are safe for all environments
- `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ZEP_API_KEY` must be set as **server-only** (not exposed to browser)

## Lessons

- **`GOOGLE_GENERATIVE_AI_API_KEY`** — this exact name is required. The Vercel AI SDK `@ai-sdk/google` reads it automatically. Do NOT rename it.
- **`ZEP_API_KEY`** — Zep Cloud v2. Not the same as Zep open-source (ZEP_API_URL pattern). Cloud only needs the key.
- **Server actions are server-only** — `process.env.ZEP_API_KEY` and `process.env.GOOGLE_GENERATIVE_AI_API_KEY` are read exclusively in server actions and lib modules. They never reach the browser bundle.
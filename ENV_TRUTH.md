# ENV_TRUTH.md — Environment Variable Source of Truth

> Updated: 2026-08-20 (post-migration to Better Auth + Drizzle/Neon + Vercel Blob + Gemini 2.5 Flash)

## Required Variables

| Variable | Where Set | Read By | Notes |
|---|---|---|---|
| `DATABASE_URL` | `.env.local` / Vercel | `src/lib/db/index.ts`, `drizzle.config.ts` | Neon Serverless PostgreSQL connection string. **Server-only.** |
| `BETTER_AUTH_SECRET` | `.env.local` / Vercel | `src/lib/auth.ts` | Secret key used to sign Better Auth session cookies. **Server-only.** |
| `BETTER_AUTH_URL` | `.env.local` / Vercel | `src/lib/auth.ts` | Canonical app URL (e.g. `https://caregiver-briefing-tool.vercel.app`). |
| `NEXT_PUBLIC_APP_URL` | `.env.local` / Vercel | `src/lib/auth-client.ts` | Public app URL exposed to browser for Better Auth client. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `.env.local` / Vercel | `src/lib/ai/extract.ts`, `pipeline-actions.ts` | Google AI Studio key for Gemini 2.5 Flash. Read by `@ai-sdk/google`. **Server-only.** |
| `ZEP_API_KEY` | `.env.local` / Vercel | `src/lib/zep/ingest.ts` | Zep Cloud API key for clinical memory graph. **Server-only.** |
| `BLOB_READ_WRITE_TOKEN` | `.env.local` / Vercel | `@vercel/blob`, `src/app/api/upload/route.ts` | Vercel Blob read/write token for PDF storage. **Server-only.** |

## Deleted Variables (no longer used)

These were removed during the migration away from Supabase, Python, and legacy microservices. Do not re-add them.

| Variable | Was Used By | Reason Deleted |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Client | Supabase eliminated — replaced by Neon & Better Auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Client | Supabase eliminated |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Auth/DB | Supabase eliminated |
| `SUPABASE_URL` / `SUPABASE_KEY` | Supabase Storage | Replaced by `@vercel/blob` |
| `GRAPHITI_WRAPPER_URL` | `dashboard/actions.ts` | Python wrapper deleted |
| `OPENROUTER_API_KEY` | Edge Functions | Replaced by `GOOGLE_GENERATIVE_AI_API_KEY` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Legacy | Removed |
| `FALKORDB_HOST` / `FALKORDB_PORT` | Python wrapper | FalkorDB deleted |
| `HF_TOKEN` / `AWS_ACCESS_KEY_ID` | Python extractor | Python deleted |
| `RESEND_API_KEY` / `RENDER_API_KEY` | Legacy services | Removed |
| `NGROK_AUTH_TOKEN` | Local tunnel | Optional developer tool only |

## Verification Checklist

Before running locally:
- [ ] `DATABASE_URL` — Neon PostgreSQL connection string (pooled)
- [ ] `BETTER_AUTH_SECRET` — 32+ character random string (`openssl rand -base64 32`)
- [ ] `BETTER_AUTH_URL` — `http://localhost:3000`
- [ ] `NEXT_PUBLIC_APP_URL` — `http://localhost:3000`
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY` — Google AI Studio API key (Gemini 2.5 Flash)
- [ ] `ZEP_API_KEY` — Zep Cloud API key (from cloud.getzep.com)
- [ ] `BLOB_READ_WRITE_TOKEN` — Vercel Blob token (`vercel blob create-store` or Vercel dashboard)

Before deploying to Vercel:
- Set all required environment variables in the Vercel project settings.
- Run `npx drizzle-kit push` to synchronize any schema changes to Neon.

## Lessons & Rules

- **`GOOGLE_GENERATIVE_AI_API_KEY`** — this exact name is required by `@ai-sdk/google`.
- **`ZEP_API_KEY`** — used by `@getzep/zep-cloud` v2 graph API.
- **Server actions are server-only** — secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ZEP_API_KEY`, `BLOB_READ_WRITE_TOKEN`) are never exposed to the client bundle.
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Architecture — CareNote (Caregiver Briefing Tool)

## Stack

```
Browser (React 19) → Next.js 16.2 Server Actions → Drizzle ORM + Neon (Postgres)
                            ↓                                  ↑
                    Better Auth (cookie sessions)    @vercel/blob (PDF storage)
                            ↓ ingestDocument()
                    Gemini 3.1 Flash Lite (multimodal PDF → Zod schema)
                            ↓
                    Zep Cloud (graph.add — bi-temporal clinical memory)
                            ↓ generateBriefing()
                    Gemini 3.1 Flash Lite (generateObject → structured briefing)
```

**100% TypeScript. No Python. No Docker. No Deno. No job queue. No pg_cron. No Supabase.**

## Key Files

| Layer | File | Purpose |
|---|---|---|
| Dashboard | `src/app/dashboard/page.tsx` | Patient cards, Drizzle queries |
| Patient Detail | `src/app/dashboard/patients/[id]/page.tsx` | Parallel doc+briefing fetch via Drizzle |
| Client Modules | `PatientDetailClient.tsx`, `DocumentUploader.tsx`, `DocumentList.tsx`, `PipelineBar.tsx` | Deep UI modules |
| Dashboard Actions | `src/app/dashboard/actions.ts` | addPatient, deletePatient, deleteDocument |
| Pipeline Actions | `src/app/dashboard/patients/[id]/pipeline-actions.ts` | `ingestDocument()`, `generateBriefing()`, `createDocumentRecord()`, `createBriefingRecord()` |
| Auth Actions | `src/app/auth/actions.ts` | login, signup, logout via Better Auth |
| Auth Config | `src/lib/auth.ts` | Better Auth instance (Drizzle adapter) |
| Auth Session | `src/lib/auth-session.ts` | `getSession()`, `getCaregiver()` — React cache() helpers |
| Auth Client | `src/lib/auth-client.ts` | Browser-side Better Auth client |
| Auth API | `src/app/api/auth/[...all]/route.ts` | Better Auth catch-all handler |
| Upload API | `src/app/api/upload/route.ts` | Vercel Blob server-side upload handler |
| Polling API | `src/app/api/patients/[id]/documents/route.ts` | Document status polling |
| Polling API | `src/app/api/patients/[id]/briefings/route.ts` | Briefing status polling |
| DB Schema | `src/lib/db/schema.ts` | Drizzle table definitions |
| DB Client | `src/lib/db/index.ts` | Neon serverless + Drizzle client |
| Drizzle Config | `drizzle.config.ts` | Drizzle Kit config (push schema to Neon) |
| AI Extraction | `src/lib/ai/extract.ts` | `extractClinicalFacts(buffer, filename)` — Gemini 2.5 Flash + Zod |
| Zep Memory | `src/lib/zep/ingest.ts` | `ingestDocumentFacts()`, `queryPatientMemory()` — Zep Cloud v2 graph API |
| Middleware | `src/proxy.ts` | Better Auth session check + redirect |
| Error Boundary | `src/app/error.tsx` | Root error UI |
| Types | `src/types/database.ts` | Patient, Document, Briefing, ExtractedEntities |

## Pipeline Flow

### Document Ingestion
```
User selects PDF → @vercel/blob (client upload via /api/upload)
DocumentUploader.tsx calls createDocumentRecord() → inserts DB row (status: "uploaded")
DocumentUploader.tsx calls ingestDocument(documentId)   ← fire-and-forget server action
  → fetch(doc.blob_url) to download PDF bytes
  → extractClinicalFacts(buffer, filename)              ← Gemini 2.5 Flash + Zod
      returns { documentDate, documentType, medications, lab_values, conditions }
  → ingestDocumentFacts(caregiverId, patientId, ...)    ← Zep Cloud graph.add({ data, type: "text", userId })
  → db.update(documents, { status: "extracted", extracted_entities, document_date, ... })
```

### Briefing Generation
```
User clicks "Generate briefing" → createBriefingRecord() → inserts briefings row (status: "queued")
PatientDetailClient calls generateBriefing(patientId, briefingId, audience, caregiverId)
  → buildZepQuery(audience)                              ← audience-dynamic search query
  → queryPatientMemory(caregiverId, patientId, query)   ← 3-layer retrieval:
      1. Longitudinal Entity Nodes (client.graph.node.getByUserId)
      2. Chronological Episodes (client.graph.episode.getByUserId, with [doc_id] & [page] tags)
      3. Concurrent Multi-Domain Search (Promise.allSettled client.graph.search, with temporal invalidation)
  → generateObject({ model: gemini-2.5-flash, schema: BriefingOutputSchema })
  → db.update(briefings, { status: "complete", briefing_text, claims, flagged_concerns })
```

### Status Polling
```
PatientDetailClient adaptive polling → GET /api/patients/[id]/documents
                                      GET /api/patients/[id]/briefings
  → Drizzle queries return updated rows → UI updates in place
```

## Auth Flow (Better Auth)

- **Signup**: `auth.api.signUpEmail()` → creates Better Auth user → inserts `caregivers` row with `user_id` FK
- **Login**: `auth.api.signInEmail()` → sets secure HTTP-only session cookie
- **Session**: `getSession()` → `getCaregiver()` maps Better Auth user.id to caregivers row
- **Logout**: `auth.api.signOut()` → clears cookie → redirect to /login
- **Middleware**: `src/proxy.ts` checks session; redirects logged-in users away from /login and /signup

## Error Handling

- **Server Actions**: `{ error?: string }` return pattern — never throw to client
- **Extraction failure**: document marked `status: "failed"`, `error_message` stored in Neon via Drizzle
- **Briefing failure**: briefing marked `status: "failed"`, `error_message` shown inline
- **Zep failure**: non-fatal — extraction still saved to Neon even if Zep ingest fails
- **Client**: `alert()` for blocking errors, inline state for recoverable

## Debugging Entry Point

```
1. Query Neon: SELECT id, status, error_message FROM documents ORDER BY uploaded_at DESC LIMIT 5;
2. Query Neon: SELECT id, status, error_message FROM briefings ORDER BY created_at DESC LIMIT 5;
3. pipeline-actions.ts logs prefixed [Pipeline] and [Briefing] — check Vercel/Next.js server logs
4. Zep errors prefixed [Zep] — check server logs
```

## Deployments

| Component | Location | Notes |
|---|---|---|
| Next.js App | Vercel (or local) | `npm run dev` / `npm run build` |
| Neon | neon.tech | Serverless Postgres — run `npx drizzle-kit push` to sync schema |
| Vercel Blob | vercel.com/storage/blob | PDF storage — configure BLOB_READ_WRITE_TOKEN |
| Better Auth | Embedded in Next.js | No separate service — /api/auth/[...all] |
| Zep Cloud | cloud.getzep.com | User graph per caregiver+patient pair |
| Gemini | Google AI Studio | via `GOOGLE_GENERATIVE_AI_API_KEY` |

## Required Environment Variables

```
# Neon Postgres
DATABASE_URL=

# Better Auth
BETTER_AUTH_SECRET=        # openssl rand -base64 32
BETTER_AUTH_URL=           # https://your-app.vercel.app (or http://localhost:3000)
NEXT_PUBLIC_APP_URL=       # same as BETTER_AUTH_URL

# Google AI (Gemini 2.5 Flash)
GOOGLE_GENERATIVE_AI_API_KEY=

# Zep Cloud
ZEP_API_KEY=

# Vercel Blob
BLOB_READ_WRITE_TOKEN=
```
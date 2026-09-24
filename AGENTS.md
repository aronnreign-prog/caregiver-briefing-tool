<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Architecture: CareNote (Caregiver Briefing Tool)

## Stack

```
Browser (React 19) → Next.js 16.2 Server Actions → Drizzle ORM + Neon (Postgres)
                            ↓                                  ↑
                    Better Auth (cookie sessions)    @vercel/blob (PDF storage)
                            ↓ ingestDocument()
                    Gemini 2.5 Flash (multimodal PDF → Zod schema)
                            ↓
                    Zep Cloud (graph.add: bi-temporal clinical memory)
                            ↓ generateBriefing()
                    Gemini 2.5 Flash (generateObject / streamObject → structured briefing)
```

**100% TypeScript. No Python. No Docker. No Deno. No job queue. No pg_cron. No Supabase.**

## Key Files

| Layer | File | Purpose |
|---|---|---|
| Dashboard | `src/app/dashboard/page.tsx` | Patient cards, Drizzle queries |
| Patient Detail | `src/app/dashboard/patients/[id]/page.tsx` | Parallel doc+briefing fetch via Drizzle |
| Client Modules | `PatientDetailClient.tsx`, `DocumentUploader.tsx`, `DocumentList.tsx`, `PipelineBar.tsx` | Deep UI modules and PDF viewing navigation |
| Dashboard Actions | `src/app/dashboard/actions.ts` | addPatient, deletePatient, deleteDocument |
| Pipeline Actions | `src/app/dashboard/patients/[id]/pipeline-actions.ts` | `ingestDocument()`, `generateBriefing()`, `createDocumentRecord()`, `createBriefingRecord()`, `askPatientClinicalQuery()` |
| Auth Actions | `src/app/auth/actions.ts` | login, signup, logout via Better Auth |
| Auth Config | `src/lib/auth.ts` | Better Auth instance (Drizzle adapter) |
| Auth Session | `src/lib/auth-session.ts` | `getSession()`, `getCaregiver()`: React cache() helpers |
| Auth Client | `src/lib/auth-client.ts` | Browser-side Better Auth client |
| Auth API | `src/app/api/auth/[...all]/route.ts` | Better Auth catch-all handler |
| Document Viewing Proxy | `src/app/api/documents/[id]/view/route.ts` | Authenticated streaming PDF proxy with CSP sandbox and MIME enforcement |
| Briefing Stream API | `src/app/api/patients/[id]/briefings/stream/route.ts` | Server-Sent Events (SSE) streaming briefing with abortSignal cancellation |
| Upload API | `src/app/api/upload/route.ts` | Vercel Blob server-side upload handler |
| Polling API | `src/app/api/patients/[id]/documents/route.ts` | Document status polling |
| Polling API | `src/app/api/patients/[id]/briefings/route.ts` | Briefing status polling |
| Demo Intake Action | `src/app/actions/demo.ts` | Public demo access intake with deduplication and bounded validation |
| Demo Intake Modal | `src/components/marketing/DemoRequestModal.tsx` | Clinical persona-grounded intake modal with scenario chips |
| Admin Dashboard | `src/app/admin/page.tsx` | Admin console with bounded, inArray SQL aggregation for users and metrics |
| Admin Actions | `src/app/admin/actions.ts` | Admin user lifecycle (create, ban, unban, delete demo users; approve/reject requests) |
| DB Schema | `src/lib/db/schema.ts` | Drizzle table definitions (auth, caregivers, patients, documents, briefings, demo_requests) |
| DB Client | `src/lib/db/index.ts` | Neon serverless + Drizzle client |
| Drizzle Config | `drizzle.config.ts` | Drizzle Kit config (push schema to Neon) |
| AI Extraction | `src/lib/ai/extract.ts` | `extractClinicalFacts(buffer, filename)`: Gemini 2.5 Flash + Zod |
| Zep Memory | `src/lib/zep/ingest.ts` | `ingestDocumentFacts()`, `queryPatientMemory()`: Zep Cloud V3 graph API |
| Middleware / Proxy | `src/proxy.ts` | Better Auth edge session check, normalized path canonicalization, and route gating |
| Error Boundary | `src/app/error.tsx` | Root error UI |
| Types | `src/types/database.ts` | Patient, Document, Briefing, ExtractedEntities |

## Pipeline Flow

### Document Ingestion
```
User selects PDF → @vercel/blob (client upload via /api/upload)
DocumentUploader.tsx calls createDocumentRecord() → inserts DB row (status: "uploaded")
DocumentUploader.tsx calls ingestDocument(documentId)   (fire-and-forget server action)
  → fetch(doc.blob_url) to download PDF bytes (SSRF protected)
  → extractClinicalFacts(buffer, filename)              (Gemini 2.5 Flash + Zod)
      returns { documentDate, documentType, medications, lab_values, conditions }
  → ingestDocumentFacts(caregiverId, patientId, ...)    (Zep Cloud graph.add: { data, type: "text", userId })
  → db.update(documents, { status: "extracted", extracted_entities, document_date, ... })
```

### Authenticated Document Viewing
```
User clicks document link or PaperTrail citation chip (#page=N)
  → Navigates to /api/documents/[id]/view#page=N
  → Verifies caregiver session via getSession() + getCaregiver()
  → Verifies document ownership (caregiver_id matches session)
  → Validates blob URL host against Vercel Blob store domain
  → Streams raw PDF bytes to client with headers:
      Content-Type: application/pdf
      Content-Security-Policy: sandbox; default-src 'none'
      X-Content-Type-Options: nosniff
```

### Briefing Generation (Specialist Power Briefing)
```
User clicks "Generate Specialist Briefing" → createBriefingRecord() → inserts briefings row (status: "queued")
PatientDetailClient calls generateBriefing(patientId, briefingId, 'specialist')
  → queryPatientMemory(caregiverId, patientId, query)   (3-layer retrieval):
      1. Longitudinal Entity Nodes (client.graph.node.getByUserId)
      2. Chronological Episodes (client.graph.episode.getByUserId, with [doc_id] & [page] tags)
      3. Concurrent Multi-Domain Search (Promise.allSettled client.graph.search, with temporal invalidation)
  → generateObject({ model: gemini-2.5-flash, schema: BriefingOutputSchema })
  → db.update(briefings, { status: "complete", briefing_text, claims, flagged_concerns })
```

### Real-Time Streaming Briefing (SSE)
```
Client opens EventSource / fetch stream to /api/patients/[id]/briefings/stream
  → Authenticates caregiver and verifies patient ownership
  → Executes 3-layer Zep memory retrieval
  → Invokes streamObject() with Gemini 2.5 Flash and abortSignal: req.signal
  → Streams incremental briefing chunks directly to client UI
  → Automatically aborts LLM execution if client disconnects
```

### On-Demand Clinical Query (Zep Graph Memory)
```
User asks question in Query Tab → calls askPatientClinicalQuery(patientId, question, previousTurn?)
  → Enforces 1,000 char boundary on user question to prevent token exhaustion DoS
  → queryPatientMemory(caregiverId, patientId, retrievalQuery) (enriched with previousTurn if follow-up)
  → generateObject({ model: gemini-2.5-flash, schema: ClinicalQueryOutputSchema })
  → returns { answer, claims } with inline [claim:cN] tokens linking to source PDF page #page=N
```

### Demo Request & Provisioning Pipeline
```
Visitor on landing page requests access via DemoRequestModal.tsx
  → Submits structured persona role, organization, and clinical focus
  → submitDemoRequest() server action validates bounds and deduplicates pending emails
  → Stores in demo_requests table (status: "pending")
  → Admin reviews submission in /admin console
  → Admin clicks "Approve & Provision":
      - Calls Better Auth admin API auth.api.createUser() with auto-generated secure password
      - Inserts linked caregivers record in Neon
      - Updates demo_requests status to "approved"
      - Displays one-time login credentials for the admin to copy
```

### Status Polling
```
PatientDetailClient adaptive polling → GET /api/patients/[id]/documents
                                      GET /api/patients/[id]/briefings
  → Drizzle queries return updated rows → UI updates in place
```

## Auth Flow (Better Auth)

- **Signup**: Gated by demo access. Direct self-service signup redirects to login or demo modal.
- **Login**: `auth.api.signInEmail()`: sets secure HTTP-only session cookie
- **Session**: `getSession()`: `getCaregiver()` maps Better Auth user.id to caregivers row
- **Logout**: `auth.api.signOut()`: clears cookie: redirect to /login
- **Middleware / Proxy**: `src/proxy.ts` evaluates normalized paths, checks session, and guards routes against path traversal or evasion

## Error Handling

- **Server Actions**: `{ error?: string }` return pattern: never throw unhandled exceptions to client
- **Extraction failure**: document marked `status: "failed"`, `error_message` stored in Neon via Drizzle
- **Briefing failure**: briefing marked `status: "failed"`, `error_message` shown inline
- **Zep failure**: non-fatal: extraction still saved to Neon even if Zep ingest fails
- **Client**: graceful feedback for blocking errors, inline state for recoverable

## Debugging Entry Point

```
1. Query Neon: SELECT id, status, error_message FROM documents ORDER BY uploaded_at DESC LIMIT 5;
2. Query Neon: SELECT id, status, error_message FROM briefings ORDER BY created_at DESC LIMIT 5;
3. pipeline-actions.ts logs prefixed [Pipeline] and [Briefing]: check server logs
4. Zep errors prefixed [Zep]: check server logs
```

## Deployments

| Component | Location | Notes |
|---|---|---|
| Next.js App | Vercel (or local) | `npm run dev` / `npm run build` |
| Neon | neon.tech | Serverless Postgres: run `npx drizzle-kit push` to sync schema |
| Vercel Blob | vercel.com/storage/blob | PDF storage: configure BLOB_READ_WRITE_TOKEN |
| Better Auth | Embedded in Next.js | No separate service: /api/auth/[...all] |
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

# Google AI (Gemini)
GOOGLE_GENERATIVE_AI_API_KEY=
AI_MODEL=                  # optional: defaults to gemini-2.5-flash (e.g. gemini-2.5-pro)

# Zep Cloud
ZEP_API_KEY=

# Vercel Blob
BLOB_READ_WRITE_TOKEN=
```
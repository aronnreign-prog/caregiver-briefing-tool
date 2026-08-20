# CareNote — Caregiver Briefing Tool

AI-powered medical briefing tool for family caregivers. Upload medical documents from any provider; get a verified, source-cited clinical briefing ready for doctor visits.

## Stack

- **Next.js 16.2** (App Router, Server Actions, TypeScript)
- **React 19**
- **Authentication**: **Better Auth** (secure cookie sessions, Drizzle adapter)
- **Database**: **Drizzle ORM** + **Neon** (Serverless PostgreSQL)
- **File Storage**: **@vercel/blob** (raw patient PDF storage)
- **AI Extraction & Synthesis**: **Google Gemini 2.5 Flash** (`@ai-sdk/google` / `ai`) — multimodal PDF fact extraction + structured briefing generation
- **Clinical Memory**: **Zep Cloud v2** (`@getzep/zep-cloud`) — bi-temporal patient memory graph
- **Validation**: **Zod** — runtime schema validation for extraction and briefings
- **Styling**: **Tailwind CSS v4**

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```env
# Neon Postgres
DATABASE_URL=

# Better Auth
BETTER_AUTH_SECRET=        # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Google AI (Gemini 2.5 Flash)
GOOGLE_GENERATIVE_AI_API_KEY=   # from https://aistudio.google.com

# Zep Cloud
ZEP_API_KEY=                    # from https://cloud.getzep.com

# Vercel Blob
BLOB_READ_WRITE_TOKEN=          # from Vercel Storage
```

## How It Works

1. **Upload** — Caregiver uploads PDF medical records (lab reports, discharge summaries, prescriptions) to Vercel Blob.
2. **Extract** — Gemini 2.5 Flash reads the PDF and extracts medications, lab values, and diagnoses validated by Zod.
3. **Remember** — Extracted facts are ingested into Zep Cloud as bi-temporal graph nodes and stored in Neon Postgres.
4. **Brief** — On demand, clinical context is queried and synthesized into a structured briefing (Specialist, GP, Family, ER, or Second Opinion) with every clinical claim verified and cited to source quotes.

## Project Structure

```
src/
  app/
    dashboard/
      page.tsx                    # Patient list (Drizzle queries)
      actions.ts                  # addPatient, deletePatient, deleteDocument
      patients/[id]/
        page.tsx                  # Patient detail (server component)
        PatientDetailClient.tsx   # Interactive UI shell & adaptive polling
        DocumentList.tsx          # Document list + delete
        DocumentUploader.tsx      # PDF upload via @vercel/blob → ingestDocument()
        PipelineBar.tsx           # Extraction status indicator
        pipeline-actions.ts       # ingestDocument() + generateBriefing()
    login/page.tsx                # Sign in (Better Auth client)
    signup/page.tsx               # Sign up (Better Auth client)
    api/
      auth/[...all]/route.ts      # Better Auth handler
      upload/route.ts             # Vercel Blob upload handler
      patients/[id]/
        documents/route.ts        # Polling endpoint
        briefings/route.ts        # Polling endpoint
  lib/
    ai/extract.ts                 # extractClinicalFacts() — Gemini 2.5 Flash + Zod
    zep/ingest.ts                 # ingestDocumentFacts(), queryPatientMemory()
    db/
      index.ts                    # Neon + Drizzle client
      schema.ts                   # Drizzle schema (auth + app tables)
    auth.ts                       # Better Auth server instance
    auth-client.ts                # Better Auth browser client
    auth-session.ts               # getSession(), getCaregiver() helpers
  types/database.ts               # Patient, Document, Briefing, ExtractedEntities
  proxy.ts                        # Auth middleware
```

## Build & Verify

```bash
npm run build      # Production build
npx tsc --noEmit   # Type-check only
```
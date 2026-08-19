# CareNote — Caregiver Briefing Tool

AI-powered medical briefing tool for family caregivers. Upload documents from any provider; get a verified, cited clinical summary ready for doctor visits.

## Stack

- **Next.js 16.2** (App Router, Server Actions, TypeScript)
- **React 19** with Supabase Realtime
- **Google Gemini 2.0 Flash** via `@ai-sdk/google` — multimodal PDF extraction + structured briefing generation
- **Zep Cloud** (`@getzep/zep-cloud`) — bi-temporal clinical memory graph
- **Supabase** — Auth, Postgres, Storage (`medical_records` bucket)
- **Zod** — runtime validation of all AI-extracted schemas
- **Tailwind CSS v4**

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=   # from https://aistudio.google.com
ZEP_API_KEY=                    # from https://cloud.getzep.com
```

## How It Works

1. **Upload** — Caregiver uploads PDF medical records (lab reports, discharge summaries, prescriptions)
2. **Extract** — Gemini 2.0 Flash reads the PDF buffer and extracts medications, lab values, and conditions via a Zod schema
3. **Remember** — Extracted facts are ingested into Zep Cloud as bi-temporal graph nodes (keyed by document date)
4. **Brief** — On demand, Zep memory is queried and synthesised into a structured briefing (specialist / GP / family / ER / second opinion) with every claim verified against source context

## Project Structure

```
src/
  app/
    dashboard/
      page.tsx                    # Patient list
      actions.ts                  # addPatient, deletePatient, deleteDocument
      patients/[id]/
        page.tsx                  # Patient detail (server component)
        PatientDetailClient.tsx   # Interactive UI shell
        PatientRealtime.tsx       # Supabase Realtime subscription
        DocumentList.tsx          # Document list + delete
        DocumentUploader.tsx      # PDF upload → ingestDocument()
        PipelineBar.tsx           # Extraction status indicator
        pipeline-actions.ts       # ingestDocument() + generateBriefing()
    auth/actions.ts               # login, signup, logout
  lib/
    ai/extract.ts                 # extractClinicalFacts() — Gemini + Zod
    zep/ingest.ts                 # ingestDocumentFacts(), queryPatientMemory()
    supabase/server.ts            # React cache() server client
    supabase/client.ts            # Browser client
  types/database.ts               # Patient, Document, Briefing, ExtractedEntities
  proxy.ts                        # Auth middleware
```

## Build

```bash
npm run build      # Production build
npx tsc --noEmit   # Type-check only
```
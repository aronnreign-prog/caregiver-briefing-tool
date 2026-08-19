<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Architecture — CareNote (Caregiver Briefing Tool)

## Stack

```
Browser (React 19) → Next.js 16.2 Server Actions → Supabase Postgres + Storage
                            ↓ ingestDocument()
                    Gemini 2.0 Flash (multimodal PDF → Zod schema)
                            ↓
                    Zep Cloud (graph.add — bi-temporal clinical memory)
                            ↓ generateBriefing()
                    Gemini 2.0 Flash (generateObject → structured briefing)
```

**100% TypeScript. No Python. No Docker. No Deno. No job queue. No pg_cron.**

## Key Files

| Layer | File | Purpose |
|---|---|---|
| Dashboard | `src/app/dashboard/page.tsx` | Patient cards, selective columns |
| Patient Detail | `src/app/dashboard/patients/[id]/page.tsx` | Parallel doc+briefing fetch |
| Client Modules | `PatientDetailClient.tsx`, `PatientRealtime.tsx`, `DocumentUploader.tsx`, `DocumentList.tsx`, `PipelineBar.tsx` | Deep UI modules |
| Dashboard Actions | `src/app/dashboard/actions.ts` | addPatient, deletePatient, deleteDocument |
| Pipeline Actions | `src/app/dashboard/patients/[id]/pipeline-actions.ts` | `ingestDocument()`, `generateBriefing()` — the full pipeline |
| Auth Actions | `src/app/auth/actions.ts` | login, signup, logout |
| AI Extraction | `src/lib/ai/extract.ts` | `extractClinicalFacts(buffer, filename)` — Gemini 2.0 Flash + Zod |
| Zep Memory | `src/lib/zep/ingest.ts` | `ingestDocumentFacts()`, `queryPatientMemory()` — Zep Cloud v2 graph API |
| Supabase Server | `src/lib/supabase/server.ts` | React `cache()` server client |
| Supabase Client | `src/lib/supabase/client.ts` | Browser client |
| Error Boundary | `src/app/error.tsx` | Root error UI |
| Types | `src/types/database.ts` | Patient, Document, Briefing, ExtractedEntities |
| Middleware | `src/proxy.ts` | Auth redirect + session refresh |

## Pipeline Flow

### Document Ingestion
```
User uploads PDF → Supabase Storage
DocumentUploader.tsx calls ingestDocument(documentId)   ← fire-and-forget server action
  → download PDF bytes from Storage
  → extractClinicalFacts(buffer, filename)              ← Gemini 2.0 Flash + Zod
      returns { documentDate, documentType, medications, lab_values, conditions }
  → ingestDocumentFacts(caregiverId, patientId, ...)    ← Zep Cloud graph.add({ data, type: "text", userId })
  → supabase.documents.update({ status: "extracted", extracted_entities, document_date, ... })
```

### Briefing Generation
```
User clicks "Generate briefing" → createBriefing row (status: "queued")
PatientDetailClient calls generateBriefing(patientId, briefingId, audience, caregiverId)
  → queryPatientMemory(caregiverId, patientId, query)   ← Zep Cloud graph.search({ query, userId })
      returns concatenated edge facts + episode text
  → generateObject({ model: gemini-2.0-flash, schema: BriefingOutputSchema })
  → supabase.briefings.update({ status: "complete", briefing_text, claims, flagged_concerns })
```

## Error Handling

- **Server Actions**: `{ error?: string }` return pattern — never throw to client
- **Extraction failure**: document marked `status: "failed"`, `error_message` stored
- **Briefing failure**: briefing marked `status: "failed"`, `error_message` shown inline
- **Zep failure**: non-fatal — extraction still saved to Supabase even if Zep ingest fails
- **Client**: `alert()` for blocking errors, inline state for recoverable

## Debugging Entry Point

```
1. Check supabase documents table: SELECT id, status, error_message FROM documents ORDER BY uploaded_at DESC LIMIT 5;
2. Check supabase briefings table: SELECT id, status, error_message FROM briefings ORDER BY created_at DESC LIMIT 5;
3. pipeline-actions.ts logs prefixed [Pipeline] and [Briefing] — check Next.js server logs
4. Zep errors prefixed [Zep] — check server logs
```

## Deployments

| Component | Location | Notes |
|---|---|---|
| Next.js App | Vercel (or local) | `npm run dev` / `npm run build` |
| Supabase | Cloud | Auth, Postgres, Storage (medical_records bucket) |
| Zep Cloud | cloud.getzep.com | User graph per caregiver+patient pair |
| Gemini | Google AI Studio | via `GOOGLE_GENERATIVE_AI_API_KEY` |

## Required Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=   # Vercel AI SDK reads this automatically
ZEP_API_KEY=                    # Zep Cloud API key
```
# CareNote Architecture Restructuring & Task List

> **Single-Stack Pure TypeScript Next.js Refactoring Plan & Status.**

---

## Completed Milestones

### Phase 1: Legacy Stack Elimination
- [x] Delete Python service (`python/graphiti-wrapper/`)
- [x] Delete Docker compose and FalkorDB configuration
- [x] Delete Supabase Deno Edge Functions (`supabase/functions/`)
- [x] Delete database queue and cron triggers (`supabase/migrations/`)
- [x] Clean up legacy tooling and obsolete scripts from root, `tools/`, and `scripts/`

### Phase 2: Core TypeScript Pipeline Implementation
- [x] Add `@ai-sdk/google`, `ai`, `zod`, and `@getzep/zep-cloud` dependencies
- [x] Implement multimodal PDF extraction via Gemini 2.0 Flash (`src/lib/ai/extract.ts`)
- [x] Implement bi-temporal clinical memory graph via Zep Cloud v2 (`src/lib/zep/ingest.ts`)
- [x] Implement pipeline server actions (`src/app/dashboard/patients/[id]/pipeline-actions.ts`)
- [x] Update frontend components to call server actions directly (`DocumentUploader.tsx`, `PatientDetailClient.tsx`)
- [x] Eliminate job queue dependencies from database types and UI state

### Phase 3: Documentation & Rule Synchronization
- [x] Update `AGENTS.md` and `.agents/AGENTS.md` with current stack and routing
- [x] Update `.agents/MODELS.md` and `ENV_TRUTH.md`
- [x] Rewrite `README.md` and `.env.example`
- [x] Refresh `docs/project-brief.md`, `docs/specs/pipeline.md`, and `docs/specs/papertrail.md`

### Phase 4: Core Clinical Intelligence & PaperTrail Grounding
- [x] Implement PaperTrail deterministic citation extraction (`[doc_id: UUID]`, `[page: N]`)
- [x] Multi-evidence citation arrays supporting longitudinal trend citations
- [x] 3-layer Zep memory retrieval (Longitudinal Entity Nodes + Chronological Episodes + Multi-Domain Search)
- [x] Audience-dynamic Zep search querying (`buildZepQuery`)
- [x] Concurrent multi-domain search via `Promise.allSettled` covering 8 medical domains (Psychiatric/Neuro, Renal, Cardio, Endocrine, Pulmonary, GI, Infectious, Hematology/Oncology)
- [x] Temporal invalidation metadata formatting on graph edges (`valid_from`, `SUPERSEDED`)
- [x] Clinical triage hierarchy & multi-trend prompting with stable patient recognition
- [x] Interactive UI badges for `CONFLICTING` findings and `notable_absence` in PaperTrail

---

## Active & Upcoming Restructuring Tasks

### 1. Ingestion Enhancements
- [ ] Support multi-page PDF chunking / high-resolution page analysis if needed
- [ ] Enhance Zep Cloud ontology configuration for specialized clinical domains
- [ ] Add direct preview integration for extracted entities in patient document list

### 2. Briefing Quality & Customization
- [ ] Expand audience-specific prompt tuning for additional specialist types
- [ ] Add multi-briefing comparison / longitudinal delta views
- [ ] Export briefing to formatted printable PDF / shareable link

### 3. Testing & CI
- [ ] Add unit tests for `extractClinicalFacts()` using sample medical PDFs
- [ ] Add integration test suites for Zep memory query and briefing generation
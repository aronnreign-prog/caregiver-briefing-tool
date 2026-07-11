# MVT Task List — 14 Tasks

> **This file is for the coding agent.** Read AGENTS.md and docs/project-brief.md before starting any task. Work through tasks in order. Commit after each task. Do not skip ahead.

---

## Phase 1: Foundation (Tasks 1-3)

### Task 1: Project Scaffolding

**Read before starting:** Next.js App Router docs, Supabase quickstart docs, Docker Compose basics.

**Do:**
- Create a Next.js app with TypeScript + Tailwind CSS + shadcn/ui
- Set up a Supabase project (free tier) — store URL, anon key, service role key in `.env.local`
- Create `docker-compose.yml` for local dev with FalkorDB + Postgres
- Create `.env.local` and `.env.example` with all environment variables
- Create the file structure specified in AGENTS.md
- Install dependencies: `@supabase/supabase-js`, `pdfjs-dist`, `openai`, `@anthropic-ai/sdk`

**Verify before committing:**
- `docker compose up` starts FalkorDB (port 6379) and Postgres (port 5432) without errors
- `npm run dev` starts Next.js at localhost:3000
- Supabase connection works (can query the database from the app)

**Commit with:** `[task-1] scaffold Next.js + Supabase + Docker Compose`

---

### Task 2: Database Schema + Auth

**Read before starting:** Supabase Auth docs, Supabase Row Level Security docs, the operational tables section in `docs/specs/bi-temporal-schema.sql`.

**Do:**
- Run the SQL from `docs/specs/bi-temporal-schema.sql` (the operational tables section — caregivers, patients, documents, briefings, jobs, audit_log tables)
- Set up Supabase Auth with email/password authentication
- Implement RLS policies (caregivers can only see their own patients and documents)
- Create a signup page, login page, and logout functionality
- Create a protected dashboard page that shows the logged-in caregiver's name
- Test that a caregiver cannot access another caregiver's data

**Verify before committing:**
- A new user can sign up with email/password
- The user can log in and see the dashboard
- The user can log out
- RLS blocks cross-caregiver data access (create two users, verify user A cannot see user B's patients)

**Commit with:** `[task-2] database schema + auth + RLS`

---

### Task 3: Patient Profiles + File Upload

**Read before starting:** Supabase Storage docs, Supabase Realtime docs.

**Do:**
- Create an "Add Patient" form (fields: name, date of birth, relationship to caregiver)
- Create a patient list page showing all patients for the logged-in caregiver
- Create a patient detail page that shows the patient's documents and briefings
- Implement file upload to Supabase Storage (PDF files only, max 10MB)
- When a PDF is uploaded: create a row in the documents table (status: 'uploaded'), create a row in the jobs table (type: 'process_document', status: 'queued')
- Show uploaded documents in the patient detail page with status badges (uploaded / processing / extracted / failed)
- Set up Supabase Realtime subscription so document status updates appear in the UI without page refresh

**Verify before committing:**
- Caregiver can add a patient
- Caregiver can upload a PDF for that patient
- The PDF appears in the patient detail page with a status badge
- Uploading a non-PDF file is rejected
- The status badge updates in real-time when the document status changes in the database

**Commit with:** `[task-3] patient profiles + PDF upload + realtime status`

---

## Phase 2: Document Processing Pipeline (Tasks 4-7)

### Task 4: PDF to Text Extraction (Layer 1)

**Read before starting:** pdfjs-dist API docs, OpenAI GPT-4o-mini vision API docs, Supabase Edge Functions docs.

**Do:**
- Create a Supabase Edge Function named `process-document`
- Implement a job queue worker using the `FOR UPDATE SKIP LOCKED` pattern from `docs/specs/bi-temporal-schema.sql`
- The worker should: pick up the next 'queued' job of type 'process_document', mark it as 'processing', do the work, mark it as 'complete' or 'failed'
- Download the PDF from Supabase Storage
- Use pdfjs-dist to render each page of the PDF to a PNG image
- For each page image, call GPT-4o-mini vision API with this prompt:

```
You are a medical document analyzer. Extract ALL text from this medical document page.
Include:
- All medications (name, dose, frequency, prescriber)
- All lab values (test name, value, unit, reference range, date)
- All diagnoses/conditions
- All allergies
- Provider names and specialties
- Dates (of service, of lab draw, of prescription)
- Patient demographics
Preserve the structure. Output as structured text.
```

- Combine all page texts into one full document text
- Save the extracted text to the documents table (extracted_text column)
- Update the document status to 'extracted'

**Verify before committing:**
- Upload a Synthea-generated PDF
- The document status changes from 'uploaded' to 'processing' to 'extracted'
- The extracted_text field contains all medications, labs, and diagnoses from the PDF
- No medical content was missed (compare extracted text to the original PDF visually)

**Commit with:** `[task-4] PDF → image → vision extraction (Layer 1)`

---

### Task 5: Medical Entity Extraction (Layer 2)

**Read before starting:** AWS Comprehend Medical API docs (detect_entities_v2 method), Anthropic Claude Haiku API docs.

**Do:**
- Set up AWS SDK in the Edge Function with Comprehend Medical permissions
- Call `comprehendmedical.detect_entities_v2()` with the extracted text from Task 4
- Parse the response to extract: medications (with RxNorm codes), conditions (with ICD-10 codes), lab values, dosages
- Save the parsed entities as JSON in the documents table (extracted_entities column)
- Use Claude Haiku to extract document metadata from the text:
  - document_date (when was this document created? e.g., lab draw date, visit date)
  - document_type (is this a lab result, visit note, prescription, or discharge summary?)
  - provider_name (who wrote this document?)
- Save document_date, document_type, provider_name to the documents table

**Verify before committing:**
- For a lab result PDF: extracted_entities contains the lab test name, value, unit, and reference range as structured JSON
- For a prescription PDF: extracted_entities contains the medication name, dose, frequency, and RxNorm code
- document_date, document_type, and provider_name are correctly extracted

**Commit with:** `[task-5] AWS Comprehend Medical entity extraction (Layer 2)`

---

### Task 6: Graphiti + FalkorDB Setup (Layer 7)

**Read before starting:** Graphiti FalkorDB configuration docs (https://help.getzep.com/graphiti/configuration/falkor-db-configuration), FalkorDB Docker quickstart (https://www.falkordb.com/blog/graphiti-get-started), the spec in `docs/specs/graphiti-integration.md`.

**Before writing any code, write a plan covering:**
1. How will the Python FastAPI service connect to FalkorDB?
2. What Graphiti API methods will you call for add_episode and search?
3. How will you handle the bi-temporal data (valid_from, valid_to)?
4. What endpoints will the FastAPI service expose?
5. How will the TypeScript Edge Function call the Python service?

Show the plan. Get approval. Then code.

**Do:**
- Verify FalkorDB is running via `docker compose up falkordb`
- Create the Python FastAPI wrapper as specified in `docs/specs/graphiti-integration.md`
- Install: `graphiti-core`, `fastapi`, `uvicorn`
- Implement these endpoints:
  - `POST /add-facts` — accepts patient_id, episode_text, source_doc_id, source_doc_date, entities, reference_time. Calls Graphiti's `add_episode` method.
  - `GET /patient-state/{patient_id}` — returns all current facts (where valid_to is None)
  - `GET /trend/{patient_id}/{entity_name}` — returns all historical values for an entity, sorted by valid_from
  - `POST /temporal-query` — returns what was true for a specific entity at a specific time
- Add the Python service to docker-compose.yml
- Test each endpoint manually

**Verify before committing:**
- The Python service starts without errors
- `POST /add-facts` with sample medical text returns a success response with an episode_id
- `GET /patient-state/{id}` after adding facts returns the correct current facts
- `GET /trend/{id}/GFR` returns GFR values in chronological order
- When you add a new GFR value, the old value's valid_to is set (invalidated, not deleted)

**Commit with:** `[task-6] Graphiti + FalkorDB Python wrapper (Layer 7)`

---

### Task 7: Feed Entities into Graphiti

**Read before starting:** Graphiti add_episode API docs, the integration spec in `docs/specs/graphiti-integration.md`.

**Do:**
- After Task 5 (entity extraction), call the Python wrapper's `POST /add-facts` endpoint
- Pass these parameters: patient_id, episode_text (the extracted text from Layer 1), source_doc_id, source_doc_date (from Task 5 metadata extraction), entities (the Comprehend Medical output from Task 5), reference_time (current ISO datetime)
- Graphiti will process the episode and store bi-temporal facts
- Handle errors: if the Graphiti service is down, retry 3 times with exponential backoff. If all retries fail, mark the document status as 'failed' with the error message.
- Test with multiple PDFs for the same patient to verify facts accumulate across documents

**Verify before committing:**
- Upload 4 lab result PDFs for one patient (GFR values: 65, 58, 51, 47 on different dates)
- Call `GET /trend/{patient_id}/GFR` — it returns all 4 values in chronological order
- The old GFR values have valid_to set (they are invalidated, not deleted)
- Upload a prescription PDF — call `GET /patient-state/{patient_id}` — it shows the medication as a current fact

**Commit with:** `[task-7] feed Comprehend Medical output into Graphiti (Pipeline 1 complete)`

---

## Phase 3: Briefing Generation Pipeline (Tasks 8-11)

### Task 8: Query Graphiti for Patient State

**Read before starting:** Graphiti search API docs, the integration spec in `docs/specs/graphiti-integration.md`.

**Do:**
- Create a Supabase Edge Function named `process-briefing`
- Implement the same `FOR UPDATE SKIP LOCKED` job queue worker pattern, but for jobs of type 'generate_briefing'
- Call the Python wrapper: `GET /patient-state/{patient_id}` — get all current facts
- Call the Python wrapper: `GET /trend/{patient_id}/GFR` — get GFR trend
- Call the Python wrapper: `GET /trend/{patient_id}/Creatinine` — get Creatinine trend
- Also query trends for other key labs: HbA1c, LDL, Hemoglobin
- Collect all this data as input for the LLM reasoning step

**Verify before committing:**
- For a patient with 4 lab PDFs and 1 cardiologist note:
  - `GET /patient-state/{id}` returns current medications (Lisinopril) and any current conditions
  - `GET /trend/{id}/GFR` returns all 4 GFR values (65, 58, 51, 47) in order
  - The Edge Function can collect all this data without errors

**Commit with:** `[task-8] query Graphiti for patient state + trends (Pipeline 2 Step 1)`

---

### Task 9: LLM Reasoning (Layer 3) + Drug Database Verification (Layer 5)

**Read before starting:** Anthropic Claude Haiku API docs (tool use / function calling), RxNorm API docs (https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html), DDInter docs (https://ddinter.scbdd.com), the pipeline spec in `docs/specs/pipeline.md`.

**Do:**
- Set up the Anthropic SDK in the Edge Function for Claude Haiku
- Implement Layer 5 — RxNorm client: call the RxNorm API to normalize drug names to RxNorm codes
- Implement Layer 5 — DDInter client: call the DDInter API to check drug-disease contraindications (e.g., ACE inhibitor + chronic kidney disease)
- Implement Layer 5 — DDInter client: check drug-drug interactions for all medication pairs
- Collect all contraindication evidence with citations (DDInter entry IDs)
- Call Claude Haiku with:
  - The patient state (current facts from Task 8)
  - The temporal trends (GFR, Creatinine, etc. from Task 8)
  - The drug contraindication results (from Layer 5)
  - The audience type (ER visit, specialist appointment, second opinion, or general)
  - This instruction:

```
You are generating a medical briefing for a caregiver to bring to a doctor.

Patient state: {current_facts}
Temporal trends: {trends}
Drug contraindication checks: {layer_5_results}

Generate a briefing for this audience: {audience}

Rules:
1. For each claim, note which source document it comes from.
2. Flag any trends (e.g., "GFR declining over 18 months").
3. Flag any conflicts between providers (e.g., different doses from different doctors).
4. Flag any contraindications (e.g., medication + condition that shouldn't go together).
5. Be honest about uncertainty — don't make claims you can't ground in the data.
6. Output as JSON: {briefing_text, claims: [{claim_text, expected_source, claim_type}], flagged_concerns: [{concern, severity, related_claims}]}
```

- Parse the Claude Haiku response into: briefing text, structured claims, flagged concerns

**Verify before committing:**
- For the kidney function example (4 GFR labs + 1 ACE inhibitor prescription):
  - Claude Haiku detects the GFR declining trend
  - Claude Haiku detects the new ACE inhibitor prescription
  - Claude Haiku flags the potential contraindication
  - Layer 5 (DDInter) confirms the contraindication with a citation
  - The output includes structured claims with expected sources

**Commit with:** `[task-9] LLM reasoning (Layer 3) + drug DB verification (Layer 5)`

---

### Task 10: PaperTrail Verification (Layer 4)

**Read before starting:** The full PaperTrail spec in `docs/specs/papertrail.md`. Read it completely before starting.

**Before writing any code, write a plan covering:**
1. How will you decompose the briefing into atomic claims? What prompt will you use?
2. How will you decompose source documents into atomic evidence? What prompt will you use?
3. How will you match claims to evidence? (string-match + semantic-match)
4. How will you flag each claim as SUPPORTED / UNSUPPORTED / PARTIALLY SUPPORTED / MEDICAL_KNOWLEDGE / REASONING?
5. What is the JSON data structure for a verified claim with its evidence?

Show the plan. Get approval. Then code.

**Do:**
- Implement Stage 1 (Atomic Claim Decomposition): Call Claude Haiku to decompose the briefing text into atomic claims. Each claim is a single verifiable fact. Output as JSON array of {claim_id, claim_text, claim_type, expected_evidence}.
- Implement Stage 2 (Atomic Evidence Extraction): For each source document, call Claude Haiku to decompose the text into atomic evidence. Each evidence is a single fact with an exact source quote. Output as JSON array of {evidence_id, evidence_text, source_doc_id, source_page, source_quote}.
- Implement Stage 3 (Claim-Evidence Matching):
  - String-match: for each claim, search source documents for the expected source_quote. If found exactly (case-insensitive), the claim is grounded.
  - Semantic-match: if string-match fails, call Claude Haiku to semantically match the claim to evidence. A claim is supported if the evidence asserts the same fact, even if worded differently.
  - Medical-knowledge match: for claims of type "medical_knowledge", verify against Layer 5 results (DDInter/RxNorm citations from Task 9).
- Implement Stage 4 (Flagging): For each claim, assign a flag:
  - SUPPORTED: matching evidence found (string or semantic, confidence > 0.8)
  - PARTIALLY SUPPORTED: some evidence found but incomplete (confidence 0.5-0.8)
  - UNSUPPORTED: no matching evidence found (confidence < 0.5) — REJECT this claim, do not include in the final briefing
  - MEDICAL_KNOWLEDGE: verified via DDInter/RxNorm (Layer 5)
  - REASONING: derived from other claims — include only if all source claims are SUPPORTED
- Output the final JSON structure as specified in `docs/specs/papertrail.md` (claims array with flags + evidence, flagged_concerns, rejected_claims)
- REJECT all UNSUPPORTED claims — they must not appear in the final briefing

**Verify before committing:**
- For the kidney function example:
  - "GFR was 65 on 2024-03-15" → SUPPORTED with source_quote "GFR 65 mL/min/1.73m²" from lab_001.pdf
  - "GFR was 47 on 2024-12-12" → SUPPORTED with source_quote from lab_004.pdf
  - "Lisinopril prescribed" → SUPPORTED with source_quote from cardiologist.pdf
  - "ACE inhibitors contraindicated in CKD" → MEDICAL_KNOWLEDGE with DDInter citation
- Inject a fake claim "Patient has diabetes" (when no diabetes is in the documents) → it must be flagged UNSUPPORTED and rejected
- The final briefing contains only SUPPORTED and MEDICAL_KNOWLEDGE claims
- Every claim in the final briefing has a citation (either source document or DDInter entry)

**Commit with:** `[task-10] PaperTrail atomic claim verification (Layer 4)`

---

### Task 11: Briefing Rendering + Citation Chips UI

**Read before starting:** shadcn/ui component docs, React markdown rendering docs.

**Do:**
- Create a briefing view page that displays when a briefing's status is 'complete'
- Render the briefing_text as markdown
- For each verified claim, render a citation chip next to it:
  - Source document chips (📄 icon): clicking opens the source PDF at the relevant page with the source_quote highlighted
  - Medical knowledge chips (💊 icon): clicking opens the DDInter or RxNorm entry URL in a new tab
- Show flagged concerns at the top of the briefing with severity badges (high = red, medium = yellow, low = blue)
- Show temporal trends as text (e.g., "GFR trend: 65 → 58 → 51 → 47 over 18 months")
- Add a "Generate New Briefing" button with an audience selector dropdown (ER visit, specialist appointment, second opinion, general)
- Send an email notification via Resend when the briefing is ready (subject: "Briefing ready for [patient name]")

**Verify before committing:**
- A caregiver can click "Generate New Briefing", select an audience, and see the briefing appear
- The briefing shows flagged concerns at the top with severity badges
- Each claim has a clickable citation chip
- Clicking a 📄 chip shows the source PDF page with the relevant quote
- Clicking a 💊 chip opens the DDInter/RxNorm entry
- The kidney function example displays correctly: GFR trend with 4 values, each with a citation chip, and the contraindication flag with a DDInter citation

**Commit with:** `[task-11] briefing rendering + citation chips UI`

---

## Phase 4: Testing + Deployment (Tasks 12-14)

### Task 12: End-to-End Test with Synthea Data

**Read before starting:** Synthea docs (https://github.com/synthetichealth/synthea).

**Do:**
- Generate 5-10 synthetic patients using Synthea with multi-year medical histories
- Convert the Synthea output (FHIR JSON) to PDFs (one PDF per encounter/lab/prescription)
- Upload all PDFs for one patient through the UI, one at a time
- Wait for all documents to reach status 'extracted'
- Generate a briefing for that patient (audience: general)
- Verify:
  - All facts are stored in Graphiti (call `GET /patient-state/{id}` and check)
  - The briefing contains the correct current medications, conditions, and labs
  - Temporal trends are detected and displayed (e.g., declining lab values over time)
  - Contraindications are flagged with DDInter citations
  - Every claim in the briefing has a citation chip
  - No unsupported claims appear in the briefing
- Then specifically test the kidney function example:
  - Upload 4 lab PDFs with GFR values 65, 58, 51, 47 on dates 2024-03-15, 2024-06-22, 2024-09-30, 2024-12-12
  - Upload 1 cardiologist note PDF with "Started Lisinopril 10mg daily" dated 2025-01-05
  - Generate a briefing
  - Verify the briefing shows: GFR declining trend with all 4 values cited, Lisinopril prescription cited, contraindication flagged with DDInter citation

**Verify before committing:**
- The MVT success test passes: "The kidney function example works end-to-end on 5-10 documents from one patient, with citation chips, and the caregiver can show it to a doctor without embarrassment."
- If it does not pass, debug the failing layer and do not move to Task 13 until it passes

**Commit with:** `[task-12] end-to-end test with Synthea data — MVT success test passes`

---

### Task 13: Deploy to Production

**Read before starting:** Supabase production deployment docs, Cloudflare Pages deployment docs.

**Do:**
- Deploy the Next.js frontend to Cloudflare Pages (free tier)
- Deploy the Supabase Edge Functions to production
- Set up FalkorDB on Upstash Redis (free tier, 256MB, 10K commands/day) — OR self-host on AWS t4g.small if you need more capacity
- Deploy the Python Graphiti wrapper (on AWS t4g.small 2GB ARM free tier, OR alongside FalkorDB on the same VPS)
- Set up a custom domain with SSL via Cloudflare (free)
- Set all environment variables in production (Supabase URL, Supabase keys, OpenAI key, Anthropic key, AWS Comprehend Medical credentials, Graphiti wrapper URL, Resend API key, Upstash Redis URL)
- Set up Resend for production email notifications
- Set up Sentry for error tracking (free tier, 5K errors/month)
- Verify Supabase automated backups are enabled (free tier includes 7 daily backups)
- Run the full MVT success test on the production deployment

**Verify before committing:**
- The app is live at a public URL with HTTPS
- A new caregiver can sign up, add a patient, upload PDFs, and generate a briefing on the production deployment
- The kidney function example works on production
- Email notifications are sent when briefings are ready
- Sentry is capturing errors (if any)

**Commit with:** `[task-13] deploy to production`

---

### Task 14: Ship to 10 Caregivers

**This task is distribution, not coding. No commit needed.**

**Do:**
- Post on r/AgingParents: "I built a tool that organizes your parent's medical records and generates briefings for doctor visits. Looking for 10 caregivers to test it for free."
- Post on r/CaregiverSupport: similar message
- Post on r/FamilyMedicine: "Built a tool for caregivers — feedback welcome from providers"
- Reach out to caregiver Facebook groups
- Set up a simple landing page with signup (can be a single page on the deployed app)
- Onboard 10 caregivers manually — help each one upload their first PDFs and generate their first briefing
- Collect feedback from each caregiver:
  - Did the briefing actually help?
  - Did they show it to a doctor?
  - Did the doctor trust the briefing?
  - What was missing from the briefing?
  - What was wrong in the briefing?
- Track: do caregivers come back to generate a second briefing?

**Success criteria:**
- 10 caregivers use the tool
- 3+ caregivers generate a second briefing (they found it useful enough to return)
- 1+ caregiver shows the briefing to a doctor and the doctor finds it useful

**If this passes:** The MVT is validated. Move to production improvements (better entity resolution, FHIR integration, scale infrastructure).
**If this fails:** Kill the project or iterate based on the feedback received.

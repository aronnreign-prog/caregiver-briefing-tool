# Pipeline Orchestration Spec

> **How the end-to-end pipeline works.** From PDF upload to briefing output. This is the orchestration layer that ties everything together.

---

## The Two Pipelines

There are TWO separate pipelines that run at different times:

1. **Document Processing Pipeline** — runs when a caregiver uploads a new PDF. Extracts text, entities, and adds facts to Graphiti.
2. **Briefing Generation Pipeline** — runs when a caregiver requests a briefing. Queries Graphiti, reasons over facts, verifies claims, outputs briefing.

Both run as Supabase Edge Functions (TypeScript, 150s timeout).

---

## Pipeline 1: Document Processing

**Trigger:** Caregiver uploads a PDF via the frontend.
**Goal:** Extract medical facts from the PDF and add them to Graphiti's bi-temporal knowledge graph.

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 0: Upload                                                  │
│ - Frontend uploads PDF to Supabase Storage                      │
│ - Creates a row in documents table (status: 'uploaded')         │
│ - Creates a job in jobs table (type: 'process_document')        │
│ - Returns document_id to frontend immediately                   │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: PDF → Image → Text (Layer 1, multimodal)                │
│ - Edge Function picks up job from queue (SKIP LOCKED)           │
│ - Downloads PDF from Supabase Storage                           │
│ - pdfjs-dist renders each page to PNG image                     │
│ - For each page image:                                          │
│   - Call GPT-4o-mini vision API:                                │
│     "Extract ALL text from this medical document page.          │
│      Include medications, lab values, diagnoses, dates,         │
│      provider names. Preserve structure."                       │
│   - Collect extracted text per page                             │
│ - Combine all pages into full document text                     │
│ - Save extracted_text to documents table                        │
│ - Cost: ~$0.001 per page image = ~$0.005 per 5-page PDF         │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Medical Entity Extraction (Layer 2)                     │
│ - Send extracted text to AWS Comprehend Medical                 │
│   - API: comprehendmedical.detect_entities_v2()                 │
│   - Extracts: medications, conditions, labs, dosages            │
│   - Returns RxNorm, ICD-10, SNOMED codes                        │
│ - Cost: $0.01 per 100 chars (within free tier for MVT)          │
│ - Save extracted_entities (JSON) to documents table             │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Extract Document Metadata                               │
│ - Use Claude Haiku to extract from the text:                    │
│   - document_date (when was this document created?)             │
│   - document_type (lab_result? visit_note? prescription?)       │
│   - provider_name (who wrote it?)                               │
│ - This becomes the valid_from for facts in Graphiti             │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Add Facts to Graphiti (Layer 7 — THE MOAT)              │
│ - Call Python Graphiti wrapper: POST /add-facts                 │
│   {                                                             │
│     patient_id: "...",                                          │
│     episode_text: extracted_text,                               │
│     source_doc_id: document_id,                                 │
│     source_doc_date: document_date,                             │
│     entities: comprehend_medical_entities,                      │
│     reference_time: ISO datetime                                │
│   }                                                             │
│ - Graphiti processes the episode:                               │
│   - Extracts entities and relationships                         │
│   - Stores as bi-temporal facts (valid_from, valid_to, etc.)    │
│   - Handles entity resolution (Lisinopril = lisinopril)         │
│   - Handles conflict detection (new value invalidates old)      │
│ - Returns episode_id                                            │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Update Status                                           │
│ - Update documents table: status = 'extracted', processed_at    │
│ - Update job: status = 'complete'                               │
│ - Frontend polls documents table or subscribes via Realtime     │
│ - Caregiver sees "Document processed" notification              │
└─────────────────────────────────────────────────────────────────┘
```

### Error handling for Pipeline 1:
- If Step 1 (vision) fails → retry once, then mark document as 'failed' with error
- If Step 2 (Comprehend Medical) fails → continue with LLM-based extraction as fallback
- If Step 4 (Graphiti) fails → retry with exponential backoff (3 attempts), then queue for later
- Each step is idempotent — if the Edge Function times out and retries, it can resume from the last completed step (check documents.status before each step)

---

## Pipeline 2: Briefing Generation

**Trigger:** Caregiver clicks "Generate Briefing" and selects an audience (ER visit, specialist appointment, second opinion, general).
**Goal:** Produce a trustworthy briefing with citation chips and flagged concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 0: Request                                                 │
│ - Frontend creates a row in briefings table (status: 'queued')  │
│ - Creates a job in jobs table (type: 'generate_briefing')       │
│ - Returns briefing_id to frontend                               │
│ - Frontend polls briefings table or subscribes via Realtime     │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Query Graphiti for Patient State (Layer 7)              │
│ - Call Python Graphiti wrapper: GET /patient-state/{id}         │
│ - Returns all CURRENT facts (valid_to IS NULL):                 │
│   - Current medications (with doses, prescribers)               │
│   - Current conditions (with diagnosis dates)                   │
│   - Recent lab values                                           │
│   - Allergies                                                   │
│ - Also call: GET /trend/{id}/GFR (for kidney function example)  │
│ - Also call: GET /trend/{id}/Creatinine                         │
│ - Collect all temporal trends for key lab values                │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: LLM Reasoning (Layer 3)                                 │
│ - Call Claude Haiku with:                                       │
│   - Patient state (from Step 1)                                 │
│   - Temporal trends (from Step 1)                               │
│   - Audience (ER vs specialist vs general)                      │
│   - Instruction: "Generate a briefing for [audience].           │
│      Detect: trends, conflicts between providers,               │
│      contraindications. For each claim, note the source."       │
│ - Claude Haiku generates:                                       │
│   - Briefing text (markdown)                                    │
│   - List of claims with expected sources                        │
│   - Flagged concerns (trends, conflicts, contraindications)     │
│ - Cost: ~$0.005 per briefing (Claude Haiku)                     │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Layer 5 — Drug Database Verification                    │
│ - For each medication in the patient state:                     │
│   - Call RxNorm API: normalize drug name → RxNorm code          │
│   - Call DDInter API: check drug-disease contraindications      │
│     (e.g., ACE inhibitor + CKD = contraindication)              │
│   - Call DDInter API: check drug-drug interactions              │
│     (for all medication pairs)                                  │
│ - Collect contraindication evidence with citations              │
│ - Cost: $0 (RxNorm + DDInter are free)                          │
│ - This is where medical-knowledge claims get grounded            │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: PaperTrail Verification (Layer 4 — THE TRUST LAYER)     │
│ - Input: Claude Haiku's briefing + claims                       │
│ - Stage A: Decompose briefing into atomic claims                │
│   (Claude Haiku call — see papertrail.md)                       │
│ - Stage B: Decompose source documents into atomic evidence      │
│   (Claude Haiku call per source document)                       │
│ - Stage C: Match claims to evidence                             │
│   - String-match verification (verbatim quotes)                 │
│   - Semantic-match verification (paraphrased)                   │
│   - Medical-knowledge verification (from Step 3, Layer 5)       │
│ - Stage D: Flag each claim                                      │
│   - SUPPORTED / UNSUPPORTED / PARTIALLY SUPPORTED               │
│   - MEDICAL_KNOWLEDGE (grounded in DDInter/RxNorm)              │
│   - REASONING (derived from other claims)                       │
│ - REJECT unsupported claims (don't include in final briefing)   │
│ - Cost: ~$0.03 per briefing (Claude Haiku for decomposition)    │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Render Briefing                                         │
│ - Take verified claims (SUPPORTED + MEDICAL_KNOWLEDGE)          │
│ - Render as markdown with citation chips:                       │
│   - [📄 doc_id p.X] for source-document claims                  │
│   - [💊 DDInter #12345] for medical-knowledge claims            │
│ - Include flagged concerns at the top (if any)                  │
│ - Include temporal context (e.g., "GFR trend: 65→58→51→47       │
│   over 18 months")                                              │
│ - Save to briefings table:                                      │
│   - briefing_text (markdown)                                    │
│   - claims (JSON — full PaperTrail output)                      │
│   - flagged_concerns (JSON)                                     │
│   - status = 'complete'                                         │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Notify Caregiver                                        │
│ - Send email via Resend: "Briefing ready for [patient name]"    │
│ - Frontend receives Realtime update                             │
│ - Caregiver views briefing with citation chips                  │
│ - Caregiver clicks chips to verify sources                      │
│ - Caregiver decides whether to bring to doctor                  │
└─────────────────────────────────────────────────────────────────┘
```

### Error handling for Pipeline 2:
- If Step 1 (Graphiti query) fails → retry, then return partial briefing with "data unavailable" warning
- If Step 2 (Claude Haiku reasoning) fails → retry, then return error
- If Step 3 (Layer 5) fails → continue without drug contraindication checks, mark as "incomplete verification"
- If Step 4 (PaperTrail) fails → return raw briefing with "unverified" warning (better than nothing)
- Total pipeline time: 30-70 seconds (within Supabase Edge Function 150s timeout)

---

## The Async Pattern (Why We Use a Job Queue)

The pipelines take 30-70 seconds. The frontend can't wait synchronously. So we use the async pattern:

```
Frontend                          Supabase                      Job Queue (Postgres)
   │                                 │                               │
   ├── POST /upload (PDF) ──────────►│                               │
   │                                 ├── Create document row ───────►│
   │                                 ├── Create job ────────────────►│ status: queued
   │◄── Return document_id ──────────│                               │
   │                                 │                               │
   │   (frontend polls or subscribes)│                               │
   │                                 │   Edge Function (worker)      │
   │                                 ├── Claim job (SKIP LOCKED) ◄───│ status: processing
   │                                 │                               │
   │                                 │   ... 30-70 seconds ...       │
   │                                 │   (process PDF, add to        │
   │                                 │    Graphiti, etc.)            │
   │                                 │                               │
   │                                 ├── Update job ────────────────►│ status: complete
   │                                 ├── Update document ───────────►│ status: extracted
   │                                 │                               │
   │◄── Realtime update ─────────────│                               │
   │   "Document processed"          │                               │
```

### Frontend status updates:
- **Option A (simpler):** Frontend polls `GET /documents/{id}` every 2 seconds until status = 'extracted'
- **Option B (better UX):** Frontend subscribes to Supabase Realtime channel for the documents table, gets push updates instantly

Use Option B for MVT — Supabase Realtime is free and built-in.

---

## The Kidney Function Example (End-to-End Walkthrough)

This is the MVT success test. Here's exactly what happens:

### Setup:
1. Caregiver creates patient "Mom" (DOB 1958-04-12)
2. Caregiver uploads 4 lab result PDFs over 18 months:
   - lab_001.pdf — GFR 65, dated 2024-03-15
   - lab_002.pdf — GFR 58, dated 2024-06-22
   - lab_003.pdf — GFR 51, dated 2024-09-30
   - lab_004.pdf — GFR 47, dated 2024-12-12
3. Caregiver uploads cardiologist visit note:
   - cardiologist.pdf — "Started Lisinopril 10mg daily" dated 2025-01-05

### Document Processing (Pipeline 1 runs 5 times):
For each PDF:
- Layer 1 (vision) extracts text
- Layer 2 (Comprehend Medical) extracts entities (GFR value, medication, etc.)
- Layer 4 (Graphiti) stores facts as bi-temporal:
  - Fact: GFR=65, valid_from=2024-03-15, valid_to=NULL (later invalidated), source=lab_001.pdf
  - Fact: GFR=58, valid_from=2024-06-22, valid_to=NULL (invalidates previous), source=lab_002.pdf
  - ... etc.
  - Fact: medication=Lisinopril 10mg, valid_from=2025-01-05, valid_to=NULL, source=cardiologist.pdf

### Briefing Generation (Pipeline 2):
1. **Step 1 (Graphiti query):**
   - GET /patient-state/mom → current medications: Lisinopril 10mg, current conditions: (none)
   - GET /trend/mom/GFR → [{65, 2024-03-15}, {58, 2024-06-22}, {51, 2024-09-30}, {47, 2024-12-12}]
   - (Graphiti's bi-temporal model has all 4 GFR values, old ones invalidated not deleted)

2. **Step 2 (Claude Haiku reasoning):**
   - Detects trend: "GFR has declined from 65 to 47 over 18 months (March 2024 to December 2024)"
   - Detects new medication: "Lisinopril 10mg prescribed January 2025"
   - Detects potential contraindication: "ACE inhibitor + declining GFR"

3. **Step 3 (Layer 5 verification):**
   - RxNorm: Lisinopril → RxNorm code 314077, classified as ACE inhibitor
   - DDInter: query "ACE inhibitor + chronic kidney disease" → contraindication found
   - DDInter returns: "ACE inhibitors should be used with caution in CKD stage 3+. Close monitoring of renal function required."
   - Citation: DDInter entry #12345

4. **Step 4 (PaperTrail verification):**
   - Atomic claim: "GFR was 65 on 2024-03-15" → evidence found in lab_001.pdf p.1 ("GFR 65 mL/min/1.73m²") → SUPPORTED
   - Atomic claim: "GFR was 47 on 2024-12-12" → evidence found in lab_004.pdf p.1 ("eGFR 47") → SUPPORTED
   - Atomic claim: "Lisinopril prescribed" → evidence found in cardiologist.pdf p.2 ("Started Lisinopril 10mg daily") → SUPPORTED
   - Atomic claim: "ACE inhibitors contraindicated in CKD" → grounded in DDInter #12345 → MEDICAL_KNOWLEDGE
   - Atomic claim: "Patient has diabetes" → no evidence found → UNSUPPORTED (rejected)

5. **Step 5 (Render):**
```markdown
## ⚠️ Flagged Concern: Potential Contraindication

Lisinopril (ACE inhibitor) was prescribed on 2025-01-05 despite declining kidney function.

**GFR Trend (18 months):**
- 2024-03-15: 65 [📄 lab_001.pdf p.1]
- 2024-06-22: 58 [📄 lab_002.pdf p.1]
- 2024-09-30: 51 [📄 lab_003.pdf p.2]
- 2024-12-12: 47 [📄 lab_004.pdf p.1]

**Current Medications:**
- Lisinopril 10mg daily (started 2025-01-05 by cardiologist) [📄 cardiologist.pdf p.2]

**Contraindication:**
ACE inhibitors should be used with caution in CKD stage 3+. Close monitoring of renal function required. [💊 DDInter #12345]

**Recommendation:** Flag for cardiologist review at next appointment.
```

6. **Step 6:** Email sent to caregiver. Frontend shows briefing. Caregiver clicks citation chips to verify. Caregiver brings briefing to cardiologist.

### Success:
- The kidney function example works end-to-end ✓
- Every claim has a citation chip ✓
- The contraindication is grounded in DDInter (not "AI said so") ✓
- The caregiver can show this to a doctor without embarrassment ✓

---

## Cost Per Briefing (Honest Breakdown)

| Step | API | Cost |
|---|---|---|
| Layer 1 (vision, per PDF) | GPT-4o-mini vision | ~$0.005 per PDF |
| Layer 2 (Comprehend Medical, per PDF) | AWS Comprehend Medical | ~$0.01 per PDF |
| Layer 3 (reasoning) | Claude Haiku | ~$0.005 |
| Layer 5 (drug DBs) | RxNorm + DDInter | $0 (free) |
| Layer 4 (PaperTrail) | Claude Haiku (3 calls) | ~$0.03 |
| **Total per document processed** | | ~$0.015 |
| **Total per briefing generated** | | ~$0.035 |

For 10 caregivers × 5 PDFs/month × 2 briefings/month:
- Document processing: 50 PDFs × $0.015 = $0.75/month
- Briefing generation: 20 briefings × $0.035 = $0.70/month
- **Total AI API cost: ~$1.50/month for 10 caregivers**

(Plus AWS Comprehend Medical free tier covers the first ~1,000 docs/month — so effectively $0 for MVT scale)

---

## The Edge Function Structure

```
src/supabase/functions/
├── upload-document/
│   └── index.ts          # Receives PDF upload, saves to Storage, creates job
├── process-document/
│   └── index.ts          # Worker: picks up jobs, runs Pipeline 1
├── generate-briefing/
│   └── index.ts          # Receives briefing request, creates job
├── process-briefing/
│   └── index.ts          # Worker: picks up jobs, runs Pipeline 2
├── get-briefing/
│   └── index.ts          # Returns briefing data to frontend
└── _shared/
    ├── graphiti.ts       # HTTP client for Python Graphiti wrapper
    ├── comprehend.ts     # AWS Comprehend Medical client
    ├── vision.ts         # GPT-4o-mini vision client
    ├── claude.ts         # Claude Haiku client
    ├── papertrail.ts     # PaperTrail verification logic
    ├── drug-db.ts        # RxNorm + DDInter clients
    └── queue.ts          # Postgres SKIP LOCKED queue helpers
```

---

## Testing the Pipeline

### Unit tests:
- Test each layer in isolation with mock data
- Layer 1: mock PDF → verify text extraction
- Layer 2: mock text → verify entity extraction
- Layer 4 (PaperTrail): mock claims + evidence → verify matching
- Layer 5: mock drug names → verify DDInter query

### Integration tests:
- Use Synthea synthetic patient data
- Run full Pipeline 1 on 5-10 documents
- Run full Pipeline 2 to generate briefing
- Verify:
  - All facts stored in Graphiti with correct bi-temporal data
  - Briefing contains the kidney function example
  - All claims have citation chips
  - Contraindication is flagged with DDInter citation
  - No unsupported claims in the final briefing

### The MVT success test:
> "The kidney function example works end-to-end on 5-10 documents from one patient, with citation chips, and the caregiver can show it to a doctor without embarrassment."

If this passes, ship to real caregivers. If it fails, iterate.

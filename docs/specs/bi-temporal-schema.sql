-- Bi-Temporal Schema (REFERENCE ONLY)
-- 
-- IMPORTANT: Graphiti + FalkorDB handles bi-temporal storage.
-- This schema is for UNDERSTANDING what Graphiti does internally.
-- DO NOT implement this yourself — use Graphiti's API.
-- See docs/specs/graphiti-integration.md for the actual implementation.
--
-- This file exists so the coding agent understands the data model
-- that Graphiti manages, and can write correct queries against
-- Graphiti's API.

-- =============================================================================
-- REFERENCE SCHEMA (what Graphiti manages internally, conceptually)
-- =============================================================================

-- This is the conceptual data model. Graphiti's actual implementation
-- uses a graph structure (nodes + edges) in FalkorDB, but conceptually
-- each "fact" looks like this:

/*
CREATE TABLE facts (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,              -- which patient this fact belongs to
  
  -- What (the fact itself)
  entity_type TEXT NOT NULL,             -- 'medication', 'lab', 'condition', 'vital', 'allergy', 'procedure'
  entity_name TEXT NOT NULL,             -- 'Lisinopril', 'GFR', 'hypertension', 'weight'
  value TEXT,                            -- '10mg', '65', 'diagnosed', '180 lbs'
  unit TEXT,                             -- 'mg', 'mL/min/1.73m²', 'lbs' (optional)
  
  -- Bi-temporal: WHEN the fact was true in the real world
  valid_from DATE NOT NULL,              -- when the fact became true (e.g., date of lab draw)
  valid_to DATE,                         -- NULL = still current; set when invalidated (e.g., new lab value)
  
  -- Bi-temporal: WHEN the system learned the fact (provenance)
  observed DATE,                         -- when the source document was created (e.g., lab report date)
  recorded TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- when the system ingested this fact
  
  -- Provenance (where the fact came from)
  source_doc_id UUID NOT NULL,           -- which PDF produced this fact
  source_page INT,                       -- page number in the PDF
  source_quote TEXT,                     -- exact text from the source supporting this fact
  
  -- Invalidation chain
  invalidated_by UUID REFERENCES facts(id),  -- if invalidated, which fact superseded this one
  
  -- Metadata
  confidence REAL DEFAULT 1.0,           -- extraction confidence (0.0 to 1.0)
  extraction_method TEXT,                -- 'aws_comprehend_medical', 'llm_extraction', 'manual'
  
  -- Indexes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_facts_patient ON facts(patient_id);
CREATE INDEX idx_facts_entity ON facts(patient_id, entity_name);
CREATE INDEX idx_facts_valid ON facts(patient_id, entity_name, valid_from, valid_to);
CREATE INDEX idx_facts_current ON facts(patient_id, entity_name) WHERE valid_to IS NULL;
*/

-- =============================================================================
-- THE QUERIES GRAPHITI HANDLES (reference — call Graphiti's API instead)
-- =============================================================================

-- 1. "What was true for this patient on date X?"
-- Graphiti handles this. Conceptually:
/*
SELECT entity_name, value, valid_from, valid_to, source_doc_id, source_quote
FROM facts
WHERE patient_id = $1
  AND valid_from <= $2  -- $2 is the target date
  AND (valid_to IS NULL OR valid_to > $2)
ORDER BY entity_name, valid_from;
*/

-- 2. "What is the GFR trend over the last 18 months?"
-- Graphiti handles this. Conceptually:
/*
SELECT valid_from, value, source_doc_id, source_quote
FROM facts
WHERE patient_id = $1
  AND entity_name = 'GFR'
ORDER BY valid_from;
-- Result: [{valid_from: '2024-03-15', value: '65'}, {valid_from: '2024-06-22', value: '58'}, ...]
*/

-- 3. "Invalidate old fact when a new value arrives"
-- Graphiti handles this automatically. Conceptually:
/*
BEGIN;
UPDATE facts 
SET valid_to = $new_valid_from, invalidated_by = $new_fact_id
WHERE patient_id = $1 
  AND entity_name = $2 
  AND valid_to IS NULL;  -- only the currently-valid fact

INSERT INTO facts (patient_id, entity_name, value, valid_from, source_doc_id, source_quote)
VALUES ($1, $2, $3, $new_valid_from, $4, $5);
COMMIT;
*/

-- 4. "What changed in the last 30 days?" (for delta briefings)
-- Graphiti handles this. Conceptually:
/*
SELECT entity_name, value, valid_from, valid_to, source_doc_id
FROM facts
WHERE patient_id = $1
  AND recorded > NOW() - INTERVAL '30 days'
ORDER BY recorded DESC;
*/

-- 5. "Is this medication currently active?"
-- Graphiti handles this. Conceptually:
/*
SELECT value, valid_from, source_doc_id, source_quote
FROM facts
WHERE patient_id = $1
  AND entity_type = 'medication'
  AND entity_name = $2  -- e.g., 'Lisinopril'
  AND valid_to IS NULL;  -- currently active
*/

-- 6. "Detect conflicts" (e.g., two providers prescribe different doses)
-- Graphiti handles this via bi-temporal tracking. Conceptually:
/*
SELECT entity_name, value, valid_from, valid_to, source_doc_id
FROM facts
WHERE patient_id = $1
  AND entity_name = 'Lisinopril'
ORDER BY valid_from;
-- If values change over time, that's a "dose change" not a "conflict"
-- Graphiti's bi-temporal model treats this as state evolution, not contradiction
*/

-- =============================================================================
-- OPERATIONAL TABLES (these WE manage in Supabase Postgres)
-- =============================================================================

-- These tables are in Postgres (Supabase), NOT in Graphiti/FalkorDB.
-- Graphiti only handles the bi-temporal medical facts.
-- Everything else (users, files, briefings, audit) is in Postgres.

-- Caregivers (the users)
CREATE TABLE IF NOT EXISTS caregivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Supabase Auth integration
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Patients (the people being cared for — usually the caregiver's parent)
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id UUID NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  date_of_birth DATE,
  relationship TEXT,  -- 'mother', 'father', 'spouse', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Uploaded PDFs (metadata — the actual files are in Supabase Storage)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id UUID NOT NULL REFERENCES caregivers(id),
  
  -- File info
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,  -- Supabase Storage path
  file_size BIGINT,
  mime_type TEXT,
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'uploaded',  -- uploaded, processing, extracted, failed
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Extraction results
  extracted_text TEXT,  -- the text extracted by Layer 1 (vision)
  extracted_entities JSONB,  -- AWS Comprehend Medical entities (Layer 2)
  
  -- Document metadata
  document_date DATE,  -- when the document was created (for valid_from)
  document_type TEXT,  -- 'lab_result', 'visit_note', 'prescription', 'discharge_summary'
  provider_name TEXT,  -- e.g., 'Dr. Smith, Cardiology'
  
  -- Error handling
  error_message TEXT
);

-- Briefings (the output — what the caregiver sees)
CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id UUID NOT NULL REFERENCES caregivers(id),
  
  -- Status
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, processing, complete, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Input
  source_doc_ids UUID[] NOT NULL,  -- which documents were included
  
  -- Output (the briefing itself)
  briefing_text TEXT,  -- the rendered briefing (markdown)
  claims JSONB,  -- PaperTrail output (atomic claims with verification flags)
  flagged_concerns JSONB,  -- contraindications, trends, conflicts
  
  -- Audience (what kind of briefing)
  audience TEXT,  -- 'er_visit', 'specialist_appointment', 'second_opinion', 'general'
  
  -- Cost tracking
  total_cost_cents INT,  -- total API cost in cents
  error_message TEXT
);

-- Job queue (Postgres as queue via SKIP LOCKED — no separate queue service)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,  -- 'process_document', 'generate_briefing', 'add_facts_to_graphiti'
  
  -- Job payload
  payload JSONB NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'queued',  -- queued, processing, complete, failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Worker tracking
  worker_id TEXT,  -- which Edge Function instance is processing this
  
  -- Retry logic
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error_message TEXT,
  
  -- Result
  result JSONB
);

-- Index for the SKIP LOCKED queue query
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON jobs (status, created_at) 
  WHERE status = 'queued';

-- Audit log (for compliance and debugging)
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id UUID NOT NULL REFERENCES caregivers(id),
  patient_id UUID REFERENCES patients(id),
  
  action TEXT NOT NULL,  -- 'upload_document', 'generate_briefing', 'view_briefing', etc.
  entity_type TEXT,  -- 'document', 'briefing', 'patient'
  entity_id UUID,
  
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY (Supabase RLS)
-- Caregivers can only access their own patients' data
-- =============================================================================

ALTER TABLE caregivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Caregivers can only see their own row
CREATE POLICY "Caregivers see own row" ON caregivers
  FOR SELECT USING (auth_user_id = auth.uid());

-- Caregivers can only see patients they care for
CREATE POLICY "Caregivers see own patients" ON patients
  FOR ALL USING (caregiver_id IN (
    SELECT id FROM caregivers WHERE auth_user_id = auth.uid()
  ));

-- Caregivers can only see documents for their patients
CREATE POLICY "Caregivers see own documents" ON documents
  FOR ALL USING (patient_id IN (
    SELECT id FROM patients WHERE caregiver_id IN (
      SELECT id FROM caregivers WHERE auth_user_id = auth.uid()
    )
  ));

-- Caregivers can only see briefings for their patients
CREATE POLICY "Caregivers see own briefings" ON briefings
  FOR ALL USING (patient_id IN (
    SELECT id FROM patients WHERE caregiver_id IN (
      SELECT id FROM caregivers WHERE auth_user_id = auth.uid()
    )
  ));

-- Jobs are processed by Edge Functions (service role bypasses RLS)
-- But caregivers can view job status for their own documents
CREATE POLICY "Caregivers see own jobs" ON jobs
  FOR SELECT USING (
    payload->>'caregiver_id' IN (
      SELECT id::text FROM caregivers WHERE auth_user_id = auth.uid()
    )
  );

-- =============================================================================
-- THE SKIP LOCKED QUEUE PATTERN
-- This is how we use Postgres as a job queue (no QStash/Inngest needed)
-- =============================================================================

-- Worker claims the next job (Edge Function calls this):
/*
BEGIN;
SELECT id, job_type, payload FROM jobs
WHERE status = 'queued'
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;

-- If a job was found, mark it as processing
UPDATE jobs 
SET status = 'processing', started_at = NOW(), worker_id = $worker_id
WHERE id = $job_id;
COMMIT;
*/

-- Worker marks job complete:
/*
UPDATE jobs 
SET status = 'complete', completed_at = NOW(), result = $result
WHERE id = $job_id;
*/

-- Worker marks job failed (with retry):
/*
UPDATE jobs 
SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
    attempts = attempts + 1,
    error_message = $error
WHERE id = $job_id;
*/

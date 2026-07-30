// Auto-generated Supabase database types
// Replace `any` usage across the codebase with these typed interfaces

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Patient {
  id: string
  caregiver_id: string
  name: string
  date_of_birth: string
  relationship: string
  created_at: string
}

export interface Caregiver {
  id: string
  email: string
  name: string
  created_at: string
  auth_user_id: string
}

export interface Document {
  id: string
  patient_id: string
  caregiver_id: string
  filename: string
  storage_path?: string
  file_size?: number
  mime_type?: string
  status: 'uploaded' | 'processing' | 'extracted' | 'complete' | 'failed'
  uploaded_at: string
  extracted_text?: string
  extracted_entities?: ExtractedEntities
  document_date?: string | null
  document_type?: string
  provider_name?: string
  processed_at?: string
  error_message?: string
}

export interface ExtractedEntities {
  medications: Medication[]
  lab_values: LabValue[]
}

export interface Medication {
  name: string
  dose?: string
  frequency?: string
  [key: string]: unknown
}

export interface LabValue {
  name: string
  value: string
  unit?: string
  date?: string
  [key: string]: unknown
}

export interface Briefing {
  id: string
  patient_id: string
  caregiver_id: string
  audience: 'general' | 'er_visit' | 'specialist' | 'second_opinion'
  status: 'queued' | 'processing' | 'complete' | 'failed'
  created_at: string
  completed_at: string | null
  source_doc_ids: string[] | null
  briefing_text: string | null
  claims: Claim[] | null
  flagged_concerns: FlaggedConcern[] | null
  total_cost_cents?: number
  error_message?: string
}

export interface Claim {
  claim_text: string
  claim_type: 'source_document' | 'medical_knowledge' | 'reasoning'
  expected_source?: string
  expected_evidence?: string
  flag?: 'SUPPORTED' | 'PARTIALLY SUPPORTED' | 'UNSUPPORTED' | 'MEDICAL_KNOWLEDGE'
  evidence?: ClaimEvidence | null
  claim_id?: string
}

export interface ClaimEvidence {
  source_doc_id?: string
  source_page?: number
  source_quote?: string
  source?: string
  entry_text?: string
  match_type?: 'exact' | 'semantic' | 'medical_knowledge'
  confidence?: number
}

export interface FlaggedConcern {
  concern: string
  severity: 'high' | 'medium' | 'low'
  related_claims: string[]
}

export interface Job {
  id: string
  job_type: 'process_document' | 'generate_briefing'
  payload: JobPayload
  status: 'queued' | 'processing' | 'complete' | 'failed'
  created_at: string
  started_at: string | null
  completed_at: string | null
  worker_id: string | null
  attempts: number
  max_attempts: number
  error_message?: string
  result?: Json
  updated_at: string
}

export interface JobPayload {
  document_id?: string
  briefing_id?: string
  caregiver_id?: string
  [key: string]: string | undefined
}

export interface AuditLogEntry {
  id: string
  caregiver_id: string
  patient_id: string
  action: string
  entity_type: string
  entity_id: string
  details: Json
  ip_address: string
  user_agent: string
  created_at: string
}

export const TABLES = {
  PATIENTS: 'patients',
  CAREGIVERS: 'caregivers',
  DOCUMENTS: 'documents',
  BRIEFINGS: 'briefings',
  JOBS: 'jobs',
  AUDIT_LOG: 'audit_log',
} as const

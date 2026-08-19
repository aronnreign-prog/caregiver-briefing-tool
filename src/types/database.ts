// CareNote — database types (Supabase Postgres)

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
  /** uploaded -> processing -> extracted | failed */
  status: 'uploaded' | 'processing' | 'extracting' | 'extracted' | 'complete' | 'failed'
  uploaded_at: string
  extracted_entities?: ExtractedEntities | null
  document_date?: string | null
  document_type?: string | null
  error_message?: string | null
  processed_at?: string | null
}

export interface ExtractedEntities {
  medications: Medication[]
  lab_values: LabValue[]
  conditions: Condition[]
}

export interface Medication {
  name: string
  dose?: string
  frequency?: string
  prescribedDate?: string
}

export interface LabValue {
  name: string
  value: string
  unit?: string
  date?: string
}

export interface Condition {
  name: string
  status?: string
}

export interface Briefing {
  id: string
  patient_id: string
  caregiver_id: string
  audience: 'general' | 'er_visit' | 'specialist' | 'second_opinion' | 'gp' | 'family'
  status: 'queued' | 'processing' | 'complete' | 'failed'
  created_at: string
  completed_at: string | null
  source_doc_ids: string[] | null
  briefing_text: string | null
  claims: Claim[] | null
  flagged_concerns: FlaggedConcern[] | null
  error_message?: string | null
}

export interface Claim {
  claim_id?: string
  claim_text: string
  claim_type: 'source_document' | 'medical_knowledge' | 'reasoning'
  flag?: 'SUPPORTED' | 'PARTIALLY SUPPORTED' | 'UNSUPPORTED' | 'MEDICAL_KNOWLEDGE' | 'UNVERIFIED'
  evidence?: ClaimEvidence | null
}

export interface ClaimEvidence {
  source_doc_id?: string
  source_page?: number
  source_quote?: string
  entry_text?: string
  match_type?: 'exact' | 'semantic' | 'medical_knowledge'
  confidence?: number
}

export interface FlaggedConcern {
  concern: string
  description?: string
  severity: 'high' | 'medium' | 'low'
  related_claims: string[]
}

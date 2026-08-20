// Drizzle ORM

export interface Patient {
  id: string
  caregiver_id: string
  name: string
  date_of_birth: string
  relationship: string
  created_at: string | Date
}

export interface Document {
  id: string
  patient_id: string
  caregiver_id: string
  filename: string
  blob_url?: string
  file_size?: string
  mime_type?: string
  status: string
  uploaded_at: string | Date
  processed_at?: string | Date | null
  extracted_entities?: unknown
  document_date?: string | null
  document_type?: string | null
  error_message?: string | null
}

export interface Briefing {
  id: string
  patient_id: string
  caregiver_id: string
  audience: string
  status: string
  created_at: string | Date
  completed_at?: string | Date | null
  source_doc_ids?: unknown
  briefing_text?: string | null
  claims?: unknown
  flagged_concerns?: unknown
  error_message?: string | null
}

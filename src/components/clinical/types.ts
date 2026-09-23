export type EvidenceItem = {
  source_doc_id?: string
  source_page?: number
  source_quote?: string
  entry_text?: string
}

export type Claim = {
  claim_id?: string
  claim_text: string
  claim_type?: string
  flag?: string
  evidence?: EvidenceItem | EvidenceItem[] | null
}

export type FlaggedConcern = {
  severity: 'high' | 'medium' | 'low'
  description?: string
  concern?: string
}

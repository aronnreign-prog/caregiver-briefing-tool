import { z } from 'zod'

export const BriefingOutputSchema = z.object({
  briefing_text: z.string().describe('The clinical briefing markdown text. Embed inline claim markers like [claim:c1], [claim:c2] immediately after each fact, statement, or concern being asserted.'),
  claims: z.array(z.object({
    claim_id: z.string().describe('Matching identifier used in briefing_text, e.g. "c1", "c2".'),
    claim_text: z.string().describe('The specific factual assertion, trend, notable absence, or clinical statement.'),
    claim_type: z.enum(['source_document', 'medical_knowledge', 'reasoning', 'notable_absence']).describe('source_document for facts directly from records, medical_knowledge for general clinical pharmacology/pathology rules, reasoning for synthesized inferences, notable_absence when a critical expected test/medication/history is missing from the record.'),
    flag: z.enum(['SUPPORTED', 'PARTIALLY SUPPORTED', 'UNSUPPORTED', 'MEDICAL_KNOWLEDGE', 'UNVERIFIED', 'CONFLICTING']).optional().describe('SUPPORTED if backed by records; CONFLICTING if contradictory findings exist across visits/docs; MEDICAL_KNOWLEDGE if general medical science; UNVERIFIED if uncertain.'),
    evidence: z.array(z.object({
      source_doc_id: z.string().optional().describe('UUID of the source document from [doc_id: <uuid>] in context.'),
      source_page: z.number().optional().describe('1-indexed page number from [page: <number>] in context.'),
      source_quote: z.string().optional().describe('Verbatim quote or short excerpt from the source document.'),
      entry_text: z.string().optional().describe('Context or clinical rationale note.'),
    })).optional().describe('Array of citations supporting this claim. For multi-point trends or corroborating records, cite EVERY source document and page that supports the claim.'),
  })),
  flagged_concerns: z.array(z.object({
    concern: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
    related_claims: z.array(z.string()),
  })),
})

export const ClinicalQueryOutputSchema = z.object({
  answer: z.string().describe('The clinical answer in markdown with inline [claim:c1], [claim:c2] citations.'),
  claims: z.array(
    z.object({
      claim_id: z.string(),
      claim_text: z.string(),
      flag: z.enum([
        'SUPPORTED',
        'PARTIALLY SUPPORTED',
        'UNSUPPORTED',
        'MEDICAL_KNOWLEDGE',
        'UNVERIFIED',
        'CONFLICTING',
      ]),
      evidence: z.array(
        z.object({
          source_doc_id: z.string().optional(),
          source_page: z.number().optional(),
          source_quote: z.string().optional(),
          entry_text: z.string().optional(),
        })
      ).optional(),
    })
  ),
})

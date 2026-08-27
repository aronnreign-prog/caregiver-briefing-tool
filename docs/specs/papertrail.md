# PaperTrail: Claim-Evidence Verification Spec

> **Grounding & Traceability in the Pure TypeScript Architecture.**
> Structured output generation with claim decomposition and source citation.

---

## 1. Concept

PaperTrail guarantees that every clinical claim made in a briefing is grounded in the patient's records or verifiable medical knowledge.

Every synthesized briefing generates:
1. **Full Briefing Text** (Markdown summary structured for the chosen audience)
2. **Claims Array** (Individual clinical claims extracted and tagged with verification flags)
3. **Flagged Concerns** (Clinical flags for contraindications, deteriorating lab trends, or anomalies)

---

## 2. Schema Structure

```typescript
export const BriefingOutputSchema = z.object({
  briefing_text: z.string().describe('The clinical briefing markdown text with inline [claim:c1], [claim:c2] citations.'),
  claims: z.array(
    z.object({
      claim_id: z.string(),
      claim_text: z.string(),
      claim_type: z.enum(['source_document', 'medical_knowledge', 'reasoning', 'notable_absence']),
      flag: z.enum([
        'SUPPORTED',
        'PARTIALLY SUPPORTED',
        'UNSUPPORTED',
        'MEDICAL_KNOWLEDGE',
        'UNVERIFIED',
        'CONFLICTING'
      ]).optional(),
      evidence: z.array(z.object({
        source_doc_id: z.string().optional(),
        source_page: z.number().optional(),
        source_quote: z.string().optional(),
        entry_text: z.string().optional(),
      })).optional(),
    }),
  ),
  flagged_concerns: z.array(
    z.object({
      concern: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      related_claims: z.array(z.string()),
    }),
  ),
})
```

---

## 3. UI Citation Chips & Inline Display

In `PatientDetailClient.tsx`:
- The briefing text is parsed for inline `[claim:cN]` tokens.
- As paragraphs and list items render, matching `claim_id` instances automatically inject interactive `<CitationChip />` components.
- Distinct badges are rendered for:
  - `↗ Doc · p.N` (direct clickable source document citation with `#page=N` targeting in Vercel Blob)
  - `⚡ Conflicting` (amber badge for contradictory or superseded findings)
  - `∅ Not Documented` (purple badge for notable clinical absences)
  - `⚠ Med Knowledge` (warning badge for pharmacological/medical knowledge assertions)
- The PaperTrail header stats bar tracks total counts for supported, conflicting, not documented, partial, and unsupported claims.
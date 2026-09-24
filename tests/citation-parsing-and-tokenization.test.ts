import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

interface Claim {
  claim_id: string
  claim_text: string
  claim_type?: string
  flag?: string
  evidence?: Array<{
    source_doc_id?: string
    source_page?: number
    source_quote?: string
    entry_text?: string
  }>
}

interface Document {
  id: string
  document_type?: string | null
  document_date?: string | null
}

interface ParsedToken {
  type: 'text' | 'claim'
  content: string
  claimId?: string
  resolvedClaim?: Claim
  resolvedDoc?: Document
  chipType?: 'document' | 'conflicting' | 'absence' | 'medical_knowledge' | 'unverified'
}

// Pure tokenization logic matching PatientDetailClient.tsx renderContentWithClaims
function tokenizeAndResolveClaims(
  text: string,
  claimsMap: Record<string, Claim>,
  documents: Document[] = []
): ParsedToken[] {
  const parts = text.split(/(\[claim:[^\]]+\])/g)
  const results: ParsedToken[] = []

  for (const part of parts) {
    if (!part) continue
    const match = part.match(/^\[claim:([^\]]+)\]$/)
    if (match) {
      const rawContent = match[1]
      const idMatches = rawContent.match(/[a-zA-Z0-9_-]+/g) ?? []

      for (const rawId of idMatches) {
        const claimId = rawId.replace(/^claim:/, '')
        const claim = claimsMap[claimId]

        if (!claim) {
          results.push({
            type: 'claim',
            content: rawId,
            claimId,
            chipType: 'unverified',
          })
          continue
        }

        let chipType: ParsedToken['chipType'] = 'document'
        if (claim.flag === 'CONFLICTING') {
          chipType = 'conflicting'
        } else if (claim.claim_type === 'notable_absence') {
          chipType = 'absence'
        } else if (claim.flag === 'MEDICAL_KNOWLEDGE' || claim.claim_type === 'medical_knowledge') {
          chipType = 'medical_knowledge'
        } else {
          const evidenceList = claim.evidence || []
          if (evidenceList.length === 0) {
            chipType = 'unverified'
          } else {
            const firstEv = evidenceList[0]
            const doc = firstEv.source_doc_id ? documents.find((d) => d.id === firstEv.source_doc_id) : undefined
            if (!doc) {
              chipType = 'unverified'
            } else {
              chipType = 'document'
            }
          }
        }

        const evidenceDoc = claim.evidence?.[0]?.source_doc_id
          ? documents.find((d) => d.id === claim.evidence![0].source_doc_id)
          : undefined

        results.push({
          type: 'claim',
          content: part,
          claimId,
          resolvedClaim: claim,
          resolvedDoc: evidenceDoc,
          chipType,
        })
      }
    } else {
      results.push({
        type: 'text',
        content: part,
      })
    }
  }

  return results
}

describe('Citation Tokenization & Claim Resolution (PatientDetailClient)', () => {
  const mockDocuments: Document[] = [
    { id: 'doc-1', document_type: 'Discharge Summary', document_date: '2026-01-10' },
    { id: 'doc-2', document_type: 'Lab Report', document_date: '2026-02-14' },
  ]

  const mockClaims: Record<string, Claim> = {
    c1: {
      claim_id: 'c1',
      claim_text: 'Admitted for acute heart failure exacerbation',
      claim_type: 'source_document',
      flag: 'SUPPORTED',
      evidence: [{ source_doc_id: 'doc-1', source_page: 1 }],
    },
    c2: {
      claim_id: 'c2',
      claim_text: 'Conflicting allergy notes: penicillin noted as tolerated then allergic',
      claim_type: 'source_document',
      flag: 'CONFLICTING',
      evidence: [{ source_doc_id: 'doc-1', source_page: 3 }],
    },
    c3: {
      claim_id: 'c3',
      claim_text: 'Standard dosing guidance for ACE inhibitors',
      claim_type: 'medical_knowledge',
      flag: 'MEDICAL_KNOWLEDGE',
    },
    c4: {
      claim_id: 'c4',
      claim_text: 'No baseline echocardiogram found in file',
      claim_type: 'notable_absence',
    },
    c5: {
      claim_id: 'c5',
      claim_text: 'Claim citing deleted document',
      claim_type: 'source_document',
      flag: 'SUPPORTED',
      evidence: [{ source_doc_id: 'deleted-doc-uuid', source_page: 1 }],
    },
  }

  test('correctly parses plain text without claim tokens', () => {
    const text = 'Normal clinical text without any special annotations.'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    assert.equal(tokens.length, 1)
    assert.equal(tokens[0].type, 'text')
    assert.equal(tokens[0].content, text)
  })

  test('resolves single document-backed claim badge', () => {
    const text = 'Patient was admitted [claim:c1] for monitoring.'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    assert.equal(tokens.length, 3)
    assert.equal(tokens[0].type, 'text')
    assert.equal(tokens[1].type, 'claim')
    assert.equal(tokens[1].claimId, 'c1')
    assert.equal(tokens[1].chipType, 'document')
    assert.equal(tokens[1].resolvedDoc?.id, 'doc-1')
    assert.equal(tokens[2].type, 'text')
  })

  test('resolves multiple adjacent claim tokens [claim:c1][claim:c2]', () => {
    const text = 'Critical clinical trajectory assertion [claim:c1][claim:c2].'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    const claims = tokens.filter((t) => t.type === 'claim')
    assert.equal(claims.length, 2)
    assert.equal(claims[0].claimId, 'c1')
    assert.equal(claims[0].chipType, 'document')
    assert.equal(claims[1].claimId, 'c2')
    assert.equal(claims[1].chipType, 'conflicting')
  })

  test('handles medical knowledge and notable absence special badges', () => {
    const text = 'Guidance rule [claim:c3] and missing test [claim:c4].'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    const claims = tokens.filter((t) => t.type === 'claim')
    assert.equal(claims.length, 2)
    assert.equal(claims[0].claimId, 'c3')
    assert.equal(claims[0].chipType, 'medical_knowledge')
    assert.equal(claims[1].claimId, 'c4')
    assert.equal(claims[1].chipType, 'absence')
  })

  test('gracefully falls back to unverified chip when document is deleted or missing from file list', () => {
    const text = 'Fact from deleted file [claim:c5].'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    const claimToken = tokens.find((t) => t.type === 'claim')
    assert.ok(claimToken)
    assert.equal(claimToken?.chipType, 'unverified')
    assert.equal(claimToken?.resolvedDoc, undefined)
  })

  test('gracefully handles nonexistent claim ID without throwing unhandled exception', () => {
    const text = 'Phantom citation [claim:c999] in text.'
    const tokens = tokenizeAndResolveClaims(text, mockClaims, mockDocuments)
    const claimToken = tokens.find((t) => t.type === 'claim')
    assert.ok(claimToken)
    assert.equal(claimToken?.claimId, 'c999')
    assert.equal(claimToken?.chipType, 'unverified')
    assert.equal(claimToken?.resolvedClaim, undefined)
  })
})

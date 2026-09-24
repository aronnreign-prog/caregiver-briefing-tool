import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

interface MockBriefing {
  id: string
  caregiver_id: string
  patient_id: string
  briefing_text: string
  status: 'queued' | 'generating' | 'complete' | 'failed'
}

interface MockDocument {
  id: string
  caregiver_id: string
  patient_id: string
  blob_url: string
  status: 'uploaded' | 'extracted' | 'failed'
}

// Simulated query engine enforcing the 3-key invariant
class IsolationStore {
  briefings: MockBriefing[] = []
  documents: MockDocument[] = []

  // Invariant: updates must match id, patient_id, AND caregiver_id simultaneously
  updateBriefing(
    briefingId: string,
    patientId: string,
    caregiverId: string,
    patch: Partial<MockBriefing>
  ): { success: boolean; updatedCount: number } {
    const targets = this.briefings.filter(
      (b) => b.id === briefingId && b.patient_id === patientId && b.caregiver_id === caregiverId
    )

    if (targets.length === 0) {
      return { success: false, updatedCount: 0 }
    }

    for (const b of targets) {
      Object.assign(b, patch)
    }
    return { success: true, updatedCount: targets.length }
  }

  // Invariant: document deletion must match id, patient_id, AND caregiver_id
  deleteDocument(
    documentId: string,
    patientId: string,
    caregiverId: string
  ): { success: boolean; deletedCount: number } {
    const initialLen = this.documents.length
    this.documents = this.documents.filter(
      (d) => !(d.id === documentId && d.patient_id === patientId && d.caregiver_id === caregiverId)
    )
    const deletedCount = initialLen - this.documents.length
    return { success: deletedCount > 0, deletedCount }
  }
}

describe('Comprehensive Multi-Tenant & Intra-Tenant Isolation Invariants', () => {
  const caregiverA = 'cg-alice'
  const caregiverB = 'cg-bob'

  const patientA1 = 'pat-alice-1'
  const patientA2 = 'pat-alice-2'
  const patientB1 = 'pat-bob-1'

  let store: IsolationStore

  // Setup fixtures before tests
  const setupStore = () => {
    store = new IsolationStore()
    store.briefings.push({
      id: 'br-1',
      caregiver_id: caregiverA,
      patient_id: patientA1,
      briefing_text: 'Alice Patient 1 briefing text',
      status: 'queued',
    })
    store.briefings.push({
      id: 'br-2',
      caregiver_id: caregiverA,
      patient_id: patientA2,
      briefing_text: 'Alice Patient 2 briefing text',
      status: 'queued',
    })
    store.briefings.push({
      id: 'br-3',
      caregiver_id: caregiverB,
      patient_id: patientB1,
      briefing_text: 'Bob Patient 1 briefing text',
      status: 'queued',
    })

    store.documents.push({
      id: 'doc-1',
      caregiver_id: caregiverA,
      patient_id: patientA1,
      blob_url: 'https://blob.vercel-storage.com/doc1.pdf',
      status: 'extracted',
    })
    store.documents.push({
      id: 'doc-2',
      caregiver_id: caregiverB,
      patient_id: patientB1,
      blob_url: 'https://blob.vercel-storage.com/doc2.pdf',
      status: 'extracted',
    })
  }

  test('permits authorized briefing update matching all 3 dimensions', () => {
    setupStore()
    const res = store.updateBriefing('br-1', patientA1, caregiverA, {
      status: 'complete',
      briefing_text: 'Updated specialist briefing',
    })
    assert.equal(res.success, true)
    assert.equal(res.updatedCount, 1)

    const updated = store.briefings.find((b) => b.id === 'br-1')
    assert.equal(updated?.status, 'complete')
    assert.equal(updated?.briefing_text, 'Updated specialist briefing')
  })

  test('blocks cross-tenant update (Caregiver B targeting Caregiver A briefing)', () => {
    setupStore()
    const res = store.updateBriefing('br-1', patientA1, caregiverB, {
      status: 'failed',
    })
    assert.equal(res.success, false)
    assert.equal(res.updatedCount, 0)
    assert.equal(store.briefings.find((b) => b.id === 'br-1')?.status, 'queued')
  })

  test('blocks intra-tenant cross-patient overwrite (Caregiver A targeting Patient 2 briefing under Patient 1 context)', () => {
    setupStore()
    // Caregiver A owns both patients, but supplies patientA1 in the URL/action while passing br-2 (which belongs to patientA2)
    const res = store.updateBriefing('br-2', patientA1, caregiverA, {
      status: 'complete',
      briefing_text: 'Malicious intra-tenant overwrite',
    })
    assert.equal(res.success, false)
    assert.equal(res.updatedCount, 0)
    assert.equal(store.briefings.find((b) => b.id === 'br-2')?.status, 'queued')
    assert.equal(store.briefings.find((b) => b.id === 'br-2')?.briefing_text, 'Alice Patient 2 briefing text')
  })

  test('blocks cross-tenant document deletion', () => {
    setupStore()
    const res = store.deleteDocument('doc-1', patientA1, caregiverB)
    assert.equal(res.success, false)
    assert.equal(res.deletedCount, 0)
    assert.equal(store.documents.some((d) => d.id === 'doc-1'), true)
  })

  test('blocks intra-tenant document deletion with mismatched patient ID', () => {
    setupStore()
    const res = store.deleteDocument('doc-1', patientA2, caregiverA)
    assert.equal(res.success, false)
    assert.equal(res.deletedCount, 0)
    assert.equal(store.documents.some((d) => d.id === 'doc-1'), true)
  })

  test('handles adversarial ID inputs (SQL injection substrings, empty strings) safely', () => {
    setupStore()
    const maliciousInputs = [
      "br-1' OR '1'='1",
      'br-1; DROP TABLE briefings;',
      '',
      '   ',
      '../etc/passwd',
      'null',
      'undefined',
    ]

    for (const badId of maliciousInputs) {
      const res = store.updateBriefing(badId, patientA1, caregiverA, { status: 'failed' })
      assert.equal(res.success, false)
      assert.equal(res.updatedCount, 0)
    }
  })
})

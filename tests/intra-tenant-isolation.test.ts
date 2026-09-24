import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

interface BriefingRecord {
  id: string
  patient_id: string
  caregiver_id: string
  status: string
  briefing_text: string | null
}

function authorizeBriefingOperation(
  briefing: BriefingRecord | null,
  caregiverId: string,
  patientId: string,
  briefingId: string
): { authorized: boolean; reason?: string } {
  if (!briefing) {
    return { authorized: false, reason: 'Briefing not found' }
  }

  // Cross-tenant check (Caregiver boundary)
  if (briefing.caregiver_id !== caregiverId) {
    return { authorized: false, reason: 'Cross-tenant access forbidden' }
  }

  // Intra-tenant check (Patient boundary within caregiver workspace)
  if (briefing.patient_id !== patientId) {
    return { authorized: false, reason: 'Intra-tenant cross-patient access forbidden' }
  }

  if (briefing.id !== briefingId) {
    return { authorized: false, reason: 'Briefing ID mismatch' }
  }

  return { authorized: true }
}

describe('Intra-Tenant Multi-Patient Isolation', () => {
  const caregiver1 = 'caregiver-111'
  const caregiver2 = 'caregiver-222'

  const patientA = 'patient-aaa'
  const patientB = 'patient-bbb'

  const briefingA: BriefingRecord = {
    id: 'briefing-001',
    patient_id: patientA,
    caregiver_id: caregiver1,
    status: 'queued',
    briefing_text: null,
  }

  test('allows authorized operation on matching caregiver and patient', () => {
    const res = authorizeBriefingOperation(briefingA, caregiver1, patientA, 'briefing-001')
    assert.equal(res.authorized, true)
  })

  test('rejects cross-tenant operation (different caregiver)', () => {
    const res = authorizeBriefingOperation(briefingA, caregiver2, patientA, 'briefing-001')
    assert.equal(res.authorized, false)
    assert.equal(res.reason, 'Cross-tenant access forbidden')
  })

  test('rejects intra-tenant cross-patient overwrite attempt (same caregiver, wrong patient)', () => {
    // Caregiver 1 tries to operate on Briefing A (Patient A) under the route for Patient B
    const res = authorizeBriefingOperation(briefingA, caregiver1, patientB, 'briefing-001')
    assert.equal(res.authorized, false)
    assert.equal(res.reason, 'Intra-tenant cross-patient access forbidden')
  })

  test('rejects nonexistent briefing', () => {
    const res = authorizeBriefingOperation(null, caregiver1, patientA, 'briefing-001')
    assert.equal(res.authorized, false)
    assert.equal(res.reason, 'Briefing not found')
  })
})

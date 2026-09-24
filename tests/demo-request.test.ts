import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'

const DemoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  email: z.string().trim().email('Valid email address is required').max(255, 'Email must be 255 characters or less'),
  organization: z.string().trim().max(200, 'Organization must be 200 characters or less').optional(),
  role: z.string().trim().max(100, 'Role must be 100 characters or less').optional(),
  useCase: z.string().trim().max(2000, 'Use case must be 2000 characters or less').optional(),
})

import { CLINICAL_PERSONAS } from '../src/components/marketing/DemoRequestModal'

describe('Demo Request Validation & Payload Bounding', () => {
  test('accepts valid input within bounds', () => {
    const valid = {
      name: 'Dr. Jane Smith',
      email: 'jane.smith@hospital.org',
      organization: 'General Hospital',
      role: 'Chief Medical Officer',
      useCase: 'Longitudinal memory for neurology patients',
    }

    const res = DemoRequestSchema.safeParse(valid)
    assert.equal(res.success, true)
  })

  test('validates all clinical persona role IDs conform to schema bounds', () => {
    assert.ok(CLINICAL_PERSONAS.length >= 5)
    for (const persona of CLINICAL_PERSONAS) {
      assert.ok(persona.id.length > 0)
      assert.ok(persona.id.length <= 100, `Role ${persona.id} exceeds 100 chars`)
      const res = DemoRequestSchema.safeParse({
        name: 'Test Clinician',
        email: 'clinician@carenote.test',
        role: persona.id,
      })
      assert.equal(res.success, true)
    }
  })

  test('validates combined suggested scenario pills stay well within useCase character limits', () => {
    for (const persona of CLINICAL_PERSONAS) {
      const combinedPills = persona.suggestedPills.join('; ')
      assert.ok(combinedPills.length <= 2000)
      const res = DemoRequestSchema.safeParse({
        name: 'Advocate User',
        email: 'advocate@carenote.test',
        role: persona.id,
        useCase: combinedPills,
      })
      assert.equal(res.success, true)
    }
  })

  test('rejects oversized string payloads (memory exhaustion protection)', () => {
    const oversized = {
      name: 'Dr. Jane',
      email: 'jane@example.com',
      useCase: 'X'.repeat(5000), // Exceeds 2000 chars
    }

    const res = DemoRequestSchema.safeParse(oversized)
    assert.equal(res.success, false)
    if (!res.success) {
      assert.ok(res.error.issues.some((i) => i.message.includes('2000 characters or less')))
    }
  })

  test('rejects malformed email addresses', () => {
    const invalidEmail = {
      name: 'Dr. Jane',
      email: 'not-an-email',
    }

    const res = DemoRequestSchema.safeParse(invalidEmail)
    assert.equal(res.success, false)
    if (!res.success) {
      assert.ok(res.error.issues.some((i) => i.message.includes('Valid email address is required')))
    }
  })
})

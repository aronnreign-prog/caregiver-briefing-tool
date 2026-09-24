import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeAdminUserList } from '../src/app/admin/page.tsx'

describe('Admin User List Aggregation & Memory Bounding', () => {
  const mockAuthUsers = [
    {
      id: 'user-001',
      name: 'Alice Caregiver',
      email: 'alice@example.com',
      role: 'user',
      banned: false,
      banReason: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'user-002',
      name: 'Bob Admin',
      email: 'bob@example.com',
      role: 'admin',
      banned: false,
      banReason: null,
      createdAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'user-003',
      name: 'Charlie New',
      email: 'charlie@example.com',
      role: 'user',
      banned: false,
      banReason: null,
      createdAt: '2026-03-01T00:00:00.000Z',
    },
  ]

  const mockCaregivers = [
    { id: 'cg-001', user_id: 'user-001' },
    { id: 'cg-002', user_id: 'user-002' },
  ]

  const mockPatientCounts = [
    { caregiver_id: 'cg-001', count: 4 },
    { caregiver_id: 'cg-002', count: 1 },
  ]

  const mockDocumentCounts = [
    { caregiver_id: 'cg-001', count: 18 },
    { caregiver_id: 'cg-002', count: 0 },
  ]

  test('accurately maps aggregated patient and document counts to users', () => {
    const result = computeAdminUserList(
      mockAuthUsers,
      mockCaregivers,
      mockPatientCounts,
      mockDocumentCounts
    )

    assert.equal(result.length, 3)

    const alice = result.find((u) => u.id === 'user-001')
    assert.ok(alice)
    assert.equal(alice.name, 'Alice Caregiver')
    assert.equal(alice.patientCount, 4)
    assert.equal(alice.documentCount, 18)

    const bob = result.find((u) => u.id === 'user-002')
    assert.ok(bob)
    assert.equal(bob.name, 'Bob Admin')
    assert.equal(bob.patientCount, 1)
    assert.equal(bob.documentCount, 0)
  })

  test('gracefully handles users with no caregiver record (defaulting counts to 0)', () => {
    const result = computeAdminUserList(
      mockAuthUsers,
      mockCaregivers,
      mockPatientCounts,
      mockDocumentCounts
    )

    const charlie = result.find((u) => u.id === 'user-003')
    assert.ok(charlie)
    assert.equal(charlie.patientCount, 0)
    assert.equal(charlie.documentCount, 0)
  })

  test('gracefully handles empty inputs across all lists', () => {
    const result = computeAdminUserList([], [], [], [])
    assert.deepEqual(result, [])
  })

  test('handles numeric and string count representations from SQL aggregates', () => {
    const stringCounts = [
      { caregiver_id: 'cg-001', count: '12' },
    ]
    const stringDocCounts = [
      { caregiver_id: 'cg-001', count: '45' },
    ]

    const result = computeAdminUserList(
      [mockAuthUsers[0]],
      [mockCaregivers[0]],
      stringCounts,
      stringDocCounts
    )

    assert.equal(result[0].patientCount, 12)
    assert.equal(result[0].documentCount, 45)
  })
})

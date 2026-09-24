import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { isValidVercelBlobUrl } from '../src/app/api/documents/[id]/view/route.ts'

interface DocumentRecord {
  id: string
  caregiver_id: string
  blob_url: string
  filename: string
}

function authorizeDocumentView(
  sessionCaregiver: { id: string } | null,
  doc: DocumentRecord | null
): { status: number; error?: string } {
  if (!sessionCaregiver) {
    return { status: 401, error: 'Unauthorized: Authentication required.' }
  }

  if (!doc) {
    return { status: 404, error: 'Document not found.' }
  }

  if (doc.caregiver_id !== sessionCaregiver.id) {
    return { status: 404, error: 'Document not found or access denied.' }
  }

  if (!isValidVercelBlobUrl(doc.blob_url)) {
    return { status: 400, error: 'Invalid document storage URL.' }
  }

  return { status: 200 }
}

describe('Authenticated Document Streaming Proxy', () => {
  const caregiver1 = { id: 'caregiver-111' }
  const caregiver2 = { id: 'caregiver-222' }

  const validDoc: DocumentRecord = {
    id: 'doc-001',
    caregiver_id: 'caregiver-111',
    blob_url: 'https://hebbkx1anhila5yf.blob.vercel-storage.com/prescriptions/rx-123.pdf',
    filename: 'rx-123.pdf',
  }

  const ssrfDoc: DocumentRecord = {
    id: 'doc-002',
    caregiver_id: 'caregiver-111',
    blob_url: 'http://169.254.169.254/latest/meta-data/',
    filename: 'evil.pdf',
  }

  test('authorizes logged-in owner to stream valid document', () => {
    const res = authorizeDocumentView(caregiver1, validDoc)
    assert.equal(res.status, 200)
  })

  test('blocks unauthenticated access with 401', () => {
    const res = authorizeDocumentView(null, validDoc)
    assert.equal(res.status, 401)
    assert.equal(res.error, 'Unauthorized: Authentication required.')
  })

  test('blocks other caregivers from accessing another tenant document with 404', () => {
    const res = authorizeDocumentView(caregiver2, validDoc)
    assert.equal(res.status, 404)
    assert.equal(res.error, 'Document not found or access denied.')
  })

  test('rejects non-Vercel SSRF blob URLs with 400', () => {
    const res = authorizeDocumentView(caregiver1, ssrfDoc)
    assert.equal(res.status, 400)
    assert.equal(res.error, 'Invalid document storage URL.')
  })
})

describe('Vercel Blob URL Validation & SSRF Prevention', () => {
  test('accepts valid HTTPS Vercel Blob store URLs', () => {
    assert.equal(isValidVercelBlobUrl('https://hebbkx1anhila5yf.blob.vercel-storage.com/doc.pdf'), true)
    assert.equal(isValidVercelBlobUrl('https://blob.vercel-storage.com/my-patient-record.pdf'), true)
    assert.equal(isValidVercelBlobUrl('https://custom-prefix.12345.blob.vercel-storage.com/folder/file.pdf'), true)
  })

  test('rejects insecure HTTP Vercel Blob URLs', () => {
    assert.equal(isValidVercelBlobUrl('http://hebbkx1anhila5yf.blob.vercel-storage.com/doc.pdf'), false)
    assert.equal(isValidVercelBlobUrl('http://blob.vercel-storage.com/file.pdf'), false)
  })

  test('rejects domain suffix spoofing SSRF attempts', () => {
    assert.equal(isValidVercelBlobUrl('https://hebbkx1anhila5yf.blob.vercel-storage.com.attacker.com/leak.pdf'), false)
    assert.equal(isValidVercelBlobUrl('https://blob.vercel-storage.com.attacker.com/evil'), false)
    assert.equal(isValidVercelBlobUrl('https://fake-blob.vercel-storage.com.evil.org/test'), false)
  })

  test('rejects cloud metadata and internal network endpoints', () => {
    assert.equal(isValidVercelBlobUrl('http://169.254.169.254/latest/meta-data/'), false)
    assert.equal(isValidVercelBlobUrl('https://169.254.169.254/'), false)
    assert.equal(isValidVercelBlobUrl('http://127.0.0.1:3000/api/admin'), false)
    assert.equal(isValidVercelBlobUrl('http://localhost:5432'), false)
  })

  test('rejects non-HTTP protocols and malformed inputs', () => {
    assert.equal(isValidVercelBlobUrl('file:///etc/passwd'), false)
    assert.equal(isValidVercelBlobUrl('javascript:alert(document.cookie)'), false)
    assert.equal(isValidVercelBlobUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false)
    assert.equal(isValidVercelBlobUrl(''), false)
    assert.equal(isValidVercelBlobUrl('not-a-valid-url'), false)
  })
})

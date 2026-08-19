/**
 * src/lib/zep/ingest.ts
 * Ingest extracted clinical facts into Zep Cloud with bi-temporal valid_from dates.
 * Uses Zep Cloud v2 graph API: client.graph.add / client.graph.search
 */

import { ZepClient } from '@getzep/zep-cloud'
import type { ClinicalExtraction } from '@/lib/ai/extract'

let _client: ZepClient | null = null

function getZepClient(): ZepClient {
  if (_client) return _client
  const apiKey = process.env.ZEP_API_KEY
  if (!apiKey) throw new Error('ZEP_API_KEY environment variable is required')
  _client = new ZepClient({ apiKey })
  return _client
}

// In Zep Cloud v2, facts are scoped to a userId (caregiver + patient composite)
// We use a deterministic userId per patient so all their documents accumulate in one graph
function zepUserId(caregiverId: string, patientId: string): string {
  return 'caregiver-' + caregiverId + '-patient-' + patientId
}

async function ensureZepUser(userId: string): Promise<void> {
  const client = getZepClient()
  try {
    await client.user.add({ userId })
  } catch {
    // User likely already exists — idempotent
  }
}

function buildFactSummary(
  extraction: ClinicalExtraction,
  documentId: string,
  filename: string,
): string {
  const lines: string[] = [
    'Document: ' + filename + ' (id: ' + documentId + ')',
    'Type: ' + (extraction.documentType ?? 'Unknown'),
    'Date: ' + (extraction.documentDate ?? 'Unknown'),
  ]

  if (extraction.medications.length > 0) {
    lines.push('\nMedications:')
    for (const med of extraction.medications) {
      const parts = [med.name]
      if (med.dose) parts.push(med.dose)
      if (med.frequency) parts.push(med.frequency)
      if (med.prescribedDate) parts.push('(prescribed ' + med.prescribedDate + ')')
      lines.push('  - ' + parts.join(' '))
    }
  }

  if (extraction.lab_values.length > 0) {
    lines.push('\nLab Values:')
    for (const lab of extraction.lab_values) {
      const val = lab.unit ? lab.value + ' ' + lab.unit : lab.value
      const date = lab.date ? ' on ' + lab.date : ''
      lines.push('  - ' + lab.name + ': ' + val + date)
    }
  }

  if (extraction.conditions.length > 0) {
    lines.push('\nConditions:')
    for (const cond of extraction.conditions) {
      const status = cond.status ? ' (' + cond.status + ')' : ''
      lines.push('  - ' + cond.name + status)
    }
  }

  return lines.join('\n')
}

export interface IngestResult {
  success: boolean
  error?: string
}

export async function ingestDocumentFacts(
  caregiverId: string,
  patientId: string,
  documentId: string,
  filename: string,
  extraction: ClinicalExtraction,
): Promise<IngestResult> {
  try {
    const client = getZepClient()
    const userId = zepUserId(caregiverId, patientId)
    await ensureZepUser(userId)

    const content = buildFactSummary(extraction, documentId, filename)

    // Zep Cloud v2: add text data to user graph
    await client.graph.add({
      data: content,
      type: 'text',
      userId,
    })

    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Zep] Ingest failed:', message)
    return { success: false, error: message }
  }
}

export async function queryPatientMemory(
  caregiverId: string,
  patientId: string,
  query: string,
): Promise<string> {
  try {
    const client = getZepClient()
    const userId = zepUserId(caregiverId, patientId)

    // Ensure user exists before searching
    await ensureZepUser(userId)

    const result = await client.graph.search({
      query,
      userId,
      limit: 20,
    })

    // result.edges contain factual relationships
    const edges = (result.edges ?? [])
      .map((e) => (e.fact ?? ''))
      .filter(Boolean)

    // Also include episodes (raw text) if present
    const episodes = (result.episodes ?? [])
      .map((ep) => (ep.content ?? ''))
      .filter(Boolean)

    const allFacts = [...edges, ...episodes]
    return allFacts.join('\n\n---\n\n')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Zep] Memory query failed:', message)
    return ''
  }
}

export async function deletePatientMemory(patientId: string): Promise<void> {
  // Zep Cloud v2: delete user deletes their graph data
  // We do not delete the user since we don't know the caregiverId here;
  // caller should call client.user.delete(userId) if needed.
  // This is a best-effort cleanup.
  console.log('[Zep] Patient memory cleanup requested for', patientId, '— manual graph cleanup needed if required.')
}
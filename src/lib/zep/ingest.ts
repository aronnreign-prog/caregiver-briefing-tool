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
  const docDate = extraction.documentDate ?? 'date unknown'
  const lines: string[] = []

  // ── Document context header ───────────────────────────────────────────────
  lines.push(`CLINICAL DOCUMENT: ${filename}`)
  lines.push(`Document type: ${extraction.documentType ?? 'Unspecified'}`)
  lines.push(`Document date: ${docDate}`)
  if (extraction.provider) lines.push(`Provider: ${extraction.provider}`)
  if (extraction.specialty) lines.push(`Specialty: ${extraction.specialty}`)
  if (extraction.encounterContext) lines.push(`Encounter context: ${extraction.encounterContext}`)

  // ── Lab values ────────────────────────────────────────────────────────────
  if (extraction.lab_values.length > 0) {
    lines.push('\nLAB RESULTS:')
    for (const lab of extraction.lab_values) {
      const onDate = lab.date ? lab.date : docDate
      const val = lab.unit ? `${lab.value} ${lab.unit}` : lab.value
      const range = lab.referenceRange ? ` (ref: ${lab.referenceRange})` : ''
      const flag = lab.flag ? ` [${lab.flag}]` : ''
      lines.push(`  On ${onDate}, ${lab.name} was ${val}${range}${flag}.`)
    }
  }

  // ── Medications ───────────────────────────────────────────────────────────
  if (extraction.medications.length > 0) {
    lines.push('\nMEDICATIONS:')
    for (const med of extraction.medications) {
      const onDate = med.prescribedDate ? med.prescribedDate : docDate
      const parts: string[] = [med.name]
      if (med.dose) parts.push(med.dose)
      if (med.frequency) parts.push(med.frequency)
      if (med.route) parts.push(`(${med.route})`)
      lines.push(`  On ${onDate}, ${parts.join(' ')} documented as ${med.status}.`)
    }
  }

  // ── Conditions ────────────────────────────────────────────────────────────
  if (extraction.conditions.length > 0) {
    lines.push('\nCONDITIONS / DIAGNOSES:')
    for (const cond of extraction.conditions) {
      const onDate = cond.onsetDate ? cond.onsetDate : docDate
      const status = cond.status ? ` (${cond.status})` : ''
      lines.push(`  As of ${onDate}, ${cond.name}${status}.`)
    }
  }

  // ── Other clinical observations ───────────────────────────────────────────
  if (extraction.otherObservations.length > 0) {
    lines.push('\nCLINICAL NOTES:')
    for (const obs of extraction.otherObservations) {
      lines.push(`  ${obs}`)
    }
  }

  // ── Source provenance ─────────────────────────────────────────────────────
  lines.push(`\nSOURCE: ${filename} (document_id: ${documentId})`)

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

    // 1. Retrieve graph edges via search (limit 30)
    const searchResult = await client.graph.search({
      query,
      userId,
      limit: 30,
    })

    const rawEdges = searchResult.edges ?? []
    const edges = rawEdges.map((e) => (e.fact ?? '')).filter(Boolean)

    // 2. Retrieve chronological episodes/documents for this user
    let rawEpisodes: { content?: string; createdAt?: string }[] = []
    try {
      const episodeResponse = await client.graph.episode.getByUserId(userId, { lastn: 30 })
      rawEpisodes = episodeResponse.episodes ?? []
    } catch (epErr) {
      console.warn('[Zep] Could not fetch episodes via getByUserId:', epErr)
    }

    // Preserve chronological order (ascending by creation date)
    const sortedEpisodes = [...rawEpisodes].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return timeA - timeB
    })

    const episodesContent = sortedEpisodes
      .map((ep) => ep.content?.trim())
      .filter((c): c is string => Boolean(c && c.length > 0))

    // If both episodes and edges are completely absent, return empty string for self-heal detection
    if (episodesContent.length === 0 && edges.length === 0) {
      console.log('[Zep Retrieval] 0 episodes and 0 edges found for user:', userId)
      return ''
    }

    // 3. Build two clearly separated sections
    const episodeSection = episodesContent.length > 0
      ? `=== CHRONOLOGICAL CLINICAL EPISODES ===\n\n${episodesContent.join('\n\n---\n\n')}`
      : '=== CHRONOLOGICAL CLINICAL EPISODES ===\n\n(No document episodes found)'

    const graphSection = edges.length > 0
      ? `=== EXTRACTED GRAPH FACTS & RELATIONSHIPS ===\n\n${edges.map((e, idx) => `${idx + 1}. ${e}`).join('\n')}`
      : '=== EXTRACTED GRAPH FACTS & RELATIONSHIPS ===\n\n(No graph facts found)'

    const context = `${episodeSection}\n\n${graphSection}`

    // 4. Concise logging
    console.log('[Zep Retrieval] Episodes retrieved:', episodesContent.length)
    console.log('[Zep Retrieval] Graph edges retrieved:', edges.length)
    console.log('[Zep Retrieval] Final context character length:', context.length)

    return context
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
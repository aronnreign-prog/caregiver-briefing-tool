/**
 * src/lib/zep/ingest.ts
 * Ingest extracted clinical facts into Zep Cloud with bi-temporal valid_from dates.
 * Uses Zep Cloud V3 graph API: client.graph.add / client.graph.search
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

// In Zep Cloud V3, facts are scoped to a userId (caregiver + patient composite)
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
  const docDate = extraction.documentDate ?? 'Date unknown / not documented'
  const lines: string[] = []

  // ── Document context header ───────────────────────────────────────────────
  lines.push(`CLINICAL DOCUMENT: ${filename} (document_id: ${documentId})`)
  lines.push(`Document type: ${extraction.documentType ?? 'Unspecified'}`)
  lines.push(`Document date: ${docDate}`)
  if (extraction.provider) lines.push(`Provider: ${extraction.provider}`)
  if (extraction.specialty) lines.push(`Specialty: ${extraction.specialty}`)
  if (extraction.encounterContext) lines.push(`Encounter context: ${extraction.encounterContext}`)

  // ── Lab values ────────────────────────────────────────────────────────────
  if (extraction.lab_values.length > 0) {
    lines.push('\nLAB RESULTS:')
    for (const lab of extraction.lab_values) {
      const onDate = lab.date ? `On ${lab.date}` : (extraction.documentDate ? `On ${extraction.documentDate}` : 'Date unknown')
      const val = lab.unit ? `${lab.value} ${lab.unit}` : lab.value
      const range = lab.referenceRange ? ` (ref: ${lab.referenceRange})` : ''
      const flag = lab.flag ? ` [${lab.flag}]` : ''
      const page = lab.pageNumber ? ` [page: ${lab.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${lab.name} was ${val}${range}${flag}.${page} [doc_id: ${documentId}]`)
    }
  }

  // ── Medications ───────────────────────────────────────────────────────────
  if (extraction.medications.length > 0) {
    lines.push('\nMEDICATIONS:')
    for (const med of extraction.medications) {
      const onDate = med.prescribedDate ? `On ${med.prescribedDate}` : (extraction.documentDate ? `On ${extraction.documentDate}` : 'Date unknown')
      const parts: string[] = [med.name]
      if (med.dose) parts.push(med.dose)
      if (med.frequency) parts.push(med.frequency)
      if (med.route) parts.push(`(${med.route})`)
      const page = med.pageNumber ? ` [page: ${med.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${parts.join(' ')} documented as ${med.status}.${page} [doc_id: ${documentId}]`)
    }
  }

  // ── Conditions ────────────────────────────────────────────────────────────
  if (extraction.conditions.length > 0) {
    lines.push('\nCONDITIONS / DIAGNOSES:')
    for (const cond of extraction.conditions) {
      const onDate = cond.onsetDate ? `As of ${cond.onsetDate}` : (extraction.documentDate ? `As of ${extraction.documentDate}` : 'Date unknown')
      const status = cond.status ? ` (${cond.status})` : ''
      const page = cond.pageNumber ? ` [page: ${cond.pageNumber}]` : ''
      lines.push(`  ${onDate}, ${cond.name}${status}.${page} [doc_id: ${documentId}]`)
    }
  }

  // ── Other clinical observations ───────────────────────────────────────────
  if (extraction.otherObservations.length > 0) {
    lines.push('\nCLINICAL NOTES:')
    for (const obs of extraction.otherObservations) {
      lines.push(`  ${obs} [doc_id: ${documentId}]`)
    }
  }

  // ── Source provenance ─────────────────────────────────────────────────────
  lines.push(`\nSOURCE: ${filename} (document_id: ${documentId})`)

  return lines.join('\n')
}


function chunkDocumentEpisodes(
  fullContent: string,
  contextHeader: string,
  maxChunkSize = 7500,
): string[] {
  if (fullContent.length <= maxChunkSize) {
    return [fullContent]
  }

  const paragraphs = fullContent.split(/\n\n+/).filter((p) => p.trim().length > 0)
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentLength = 0

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkSize) {
      // Split large paragraph by lines
      const lines = paragraph.split('\n')
      for (const line of lines) {
        if (currentLength + line.length + 1 > maxChunkSize && currentChunk.length > 0) {
          const body = currentChunk.join('\n')
          chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
          currentChunk = []
          currentLength = 0
        }
        currentChunk.push(line)
        currentLength += line.length + 1
      }
    } else {
      if (currentLength + paragraph.length + 2 > maxChunkSize && currentChunk.length > 0) {
        const body = currentChunk.join('\n\n')
        chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
        currentChunk = []
        currentLength = 0
      }
      currentChunk.push(paragraph)
      currentLength += paragraph.length + 2
    }
  }

  if (currentChunk.length > 0) {
    const body = currentChunk.join('\n\n')
    chunks.push(chunks.length === 0 ? body : `${contextHeader}\n\n${body}`)
  }

  return chunks
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
    const docDate = extraction.documentDate ?? 'Date unknown / not documented'
    const contextHeader = `CLINICAL DOCUMENT (CONTINUATION): ${filename} (document_id: ${documentId}) | Date: ${docDate}`

    const chunks = chunkDocumentEpisodes(content, contextHeader, 7500)

    // Only supply created_at if an authentic, verified document date exists in ISO format.
    // If undated/missing, do NOT pass created_at or today's timestamp so it remains strictly undated.
    let createdAt: string | undefined = undefined
    if (extraction.documentDate && /^\d{4}-\d{2}-\d{2}/.test(extraction.documentDate)) {
      const parsedDate = new Date(extraction.documentDate)
      if (!isNaN(parsedDate.getTime())) {
        createdAt = parsedDate.toISOString()
      }
    }

    // Ingest each chunk sharing the same documentId and createdAt per Zep documentation
    for (const chunk of chunks) {
      await client.graph.add({
        data: chunk,
        type: 'text',
        userId,
        createdAt,
        metadata: { documentId },
      })
    }

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

    // Ensure user exists before querying
    await ensureZepUser(userId)

    // ── Concurrent Multi-Layer Retrieval ──
    const cleanQuery = query.trim().slice(0, 380) || 'longitudinal clinical trajectory medications lab trends'

    const [nodesRes, episodesRes, searchRes] = await Promise.allSettled([
      client.graph.node.getByUserId(userId, { limit: 50 }),
      client.graph.episode.getByUserId(userId, { lastn: 30 }),
      client.graph.search({
        userId,
        query: cleanQuery,
        scope: 'edges',
        limit: 45,
        reranker: 'mmr',
        mmrLambda: 0.6,
      }),
    ])

    // Layer 1: Entity Summaries
    let entitySummaries: string[] = []
    if (nodesRes.status === 'fulfilled' && Array.isArray(nodesRes.value)) {
      entitySummaries = nodesRes.value
        .filter((n) => n.summary && n.summary.trim().length > 0)
        .map((n) => {
          const labels = n.labels && n.labels.length > 0 ? ` (${n.labels.join(', ')})` : ''
          return `[Entity: ${n.name}${labels}] ${n.summary.trim()}`
        })
    } else if (nodesRes.status === 'rejected') {
      console.warn('[Zep] Entity node fetch skipped:', nodesRes.reason)
    }

    // Layer 2: Chronological Episodes
    let episodesContent: string[] = []
    if (episodesRes.status === 'fulfilled' && episodesRes.value?.episodes) {
      const sortedEpisodes = [...episodesRes.value.episodes].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return timeA - timeB
      })
      episodesContent = sortedEpisodes
        .map((ep) => ep.content?.trim())
        .filter((c): c is string => Boolean(c && c.length > 0))
    } else if (episodesRes.status === 'rejected') {
      console.warn('[Zep] Episodes fetch skipped:', episodesRes.reason)
    }

    // Layer 3: Temporal Edges
    const edgeList: string[] = []
    if (searchRes.status === 'fulfilled' && searchRes.value?.edges) {
      const edgeMap = new Map<string, string>()
      for (const e of searchRes.value.edges as any[]) {
        const fact = (e.fact ?? '').trim()
        if (!fact) continue
        const key = e.uuid || fact

        const rawValid = e.validAt ?? e.valid_at ?? e.attributes?.valid_at ?? e.attributes?.reference_time
        const rawInvalid = e.invalidAt ?? e.invalid_at ?? e.attributes?.invalid_at

        const validAt = rawValid ? String(rawValid).slice(0, 10) : 'date unknown'
        const invalidAt = rawInvalid ? String(rawInvalid).slice(0, 10) : 'present'
        const status = rawInvalid ? '[SUPERSEDED/INVALIDATED]' : '[ACTIVE]'

        const formattedFact = `- ${fact} (Date range: ${validAt} - ${invalidAt}) ${status}`
        if (!edgeMap.has(key)) {
          edgeMap.set(key, formattedFact)
        }
      }
      edgeList.push(...Array.from(edgeMap.values()))
    } else if (searchRes.status === 'rejected') {
      console.warn('[Zep] Edge search skipped:', searchRes.reason)
    }

    // If all layers are completely absent, return empty string for self-heal detection
    if (entitySummaries.length === 0 && episodesContent.length === 0 && edgeList.length === 0) {
      console.log('[Zep Retrieval] 0 entity nodes, 0 episodes, and 0 edges found for user:', userId)
      return ''
    }

    // ── Build clean XML Context Block following Zep Official Context Recipe ──
    const sections: string[] = []

    if (entitySummaries.length > 0) {
      sections.push(`<ENTITIES>\n# Key clinical entities and summaries:\n${entitySummaries.map((s) => `- ${s}`).join('\n')}\n</ENTITIES>`)
    }

    if (edgeList.length > 0) {
      sections.push(`<FACTS>\n# Longitudinal facts and valid date ranges (facts ending in "present" are currently active; past end dates are superseded):\n${edgeList.join('\n')}\n</FACTS>`)
    }

    if (episodesContent.length > 0) {
      sections.push(`<CHRONOLOGICAL_EVIDENCE>\n# Source clinical records with exact [doc_id: <uuid>] and [page: <number>] anchors for citations:\n${episodesContent.join('\n\n---\n\n')}\n</CHRONOLOGICAL_EVIDENCE>`)
    }

    const context = sections.join('\n\n')
    console.log('[Zep Retrieval] Context built — Entities:', entitySummaries.length, '| Facts:', edgeList.length, '| Episodes:', episodesContent.length, '| Chars:', context.length)
    return context
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Zep] Memory query failed:', message)
    return ''
  }
}

export async function deletePatientMemory(caregiverId: string, patientId: string): Promise<void> {
  try {
    const client = getZepClient()
    const userId = zepUserId(caregiverId, patientId)
    await client.user.delete(userId)
    console.log('[Zep] Successfully deleted patient memory graph for user:', userId)
  } catch (err) {
    console.warn('[Zep] Could not delete patient memory graph:', err)
  }
}
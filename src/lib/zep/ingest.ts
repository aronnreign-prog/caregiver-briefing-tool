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
      const onDate = lab.date ? lab.date : docDate
      const val = lab.unit ? `${lab.value} ${lab.unit}` : lab.value
      const range = lab.referenceRange ? ` (ref: ${lab.referenceRange})` : ''
      const flag = lab.flag ? ` [${lab.flag}]` : ''
      const page = lab.pageNumber ? ` [page: ${lab.pageNumber}]` : ''
      lines.push(`  On ${onDate}, ${lab.name} was ${val}${range}${flag}.${page} [doc_id: ${documentId}]`)
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
      const page = med.pageNumber ? ` [page: ${med.pageNumber}]` : ''
      lines.push(`  On ${onDate}, ${parts.join(' ')} documented as ${med.status}.${page} [doc_id: ${documentId}]`)
    }
  }

  // ── Conditions ────────────────────────────────────────────────────────────
  if (extraction.conditions.length > 0) {
    lines.push('\nCONDITIONS / DIAGNOSES:')
    for (const cond of extraction.conditions) {
      const onDate = cond.onsetDate ? cond.onsetDate : docDate
      const status = cond.status ? ` (${cond.status})` : ''
      const page = cond.pageNumber ? ` [page: ${cond.pageNumber}]` : ''
      lines.push(`  As of ${onDate}, ${cond.name}${status}.${page} [doc_id: ${documentId}]`)
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

    // Ensure user exists before querying
    await ensureZepUser(userId)

    // ── Layer 1: Longitudinal Entity Summaries (Uncapped holistic knowledge graph) ──
    let rawNodes: any[] = []
    let entitySummaries: string[] = []
    try {
      const nodes = await client.graph.node.getByUserId(userId, { limit: 50 })
      if (Array.isArray(nodes)) {
        rawNodes = nodes
        entitySummaries = nodes
          .filter((n) => n.summary && n.summary.trim().length > 0)
          .map((n) => {
            const labels = n.labels && n.labels.length > 0 ? ` (${n.labels.join(', ')})` : ''
            return `[Entity: ${n.name}${labels}] ${n.summary.trim()}`
          })
      }
    } catch (nodeErr) {
      console.warn('[Zep] Entity node summaries fetch skipped or unavailable:', nodeErr)
    }

    // ── Layer 2: Chronological Document Episodes (Citable ground truth with doc/page tags) ──
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

    // ── Layer 3: Multi-Domain Semantic Graph Search with Temporal Invalidation ──
    // Derive targeted clinical domains from entity nodes to avoid single-query budget starvation
    const detectedDomainQueries: string[] = []
    const entityText = rawNodes.map((n) => `${n.name} ${n.summary ?? ''}`).join(' ').toLowerCase()

    if (/renal|kidney|gfr|creatinine|bun|dialysis|nephro/.test(entityText)) {
      detectedDomainQueries.push('renal kidney function eGFR creatinine BUN urine lab trends')
    }
    if (/cardio|heart|bp|hypertension|blood pressure|cardiac|ecg|lisinopril|metoprolol|statin/.test(entityText)) {
      detectedDomainQueries.push('cardiovascular heart blood pressure hypertension cardiac medications')
    }
    if (/diabet|glucose|hba1c|sugar|insulin|metformin|endocrine/.test(entityText)) {
      detectedDomainQueries.push('diabetes glucose HbA1c endocrine metabolic medications')
    }
    if (/pulmon|lung|respiratory|dyspnea|sob|asthma|copd|oxygen/.test(entityText)) {
      detectedDomainQueries.push('respiratory lung pulmonary shortness of breath oxygen')
    }
    if (/liver|hepatic|alt|ast|bilirubin|cirrhosis/.test(entityText)) {
      detectedDomainQueries.push('liver hepatic function enzymes ALT AST bilirubin')
    }

    // Execute primary query + up to 2 detected domain queries in parallel
    const queriesToRun = [query, ...detectedDomainQueries.slice(0, 2)]
    const edgeMap = new Map<string, string>()

    for (const q of queriesToRun) {
      try {
        const searchResult = await client.graph.search({
          query: q,
          userId,
          limit: 35,
        })
        const rawEdges = searchResult.edges ?? []
        for (const e of rawEdges) {
          const fact = (e.fact ?? '').trim()
          if (!fact) continue
          const key = e.uuid || fact

          // Format temporal validity and superseding / invalidation dates
          const validPart = e.validAt ? ` [valid_from: ${e.validAt.slice(0, 10)}]` : ''
          const invalidPart = e.invalidAt ? ` [SUPERSEDED/INVALIDATED as of: ${e.invalidAt.slice(0, 10)}]` : ''
          const expiredPart = e.expiredAt ? ` [EXPIRED: ${e.expiredAt.slice(0, 10)}]` : ''
          const fullFact = `${fact}${validPart}${invalidPart}${expiredPart}`

          if (!edgeMap.has(key)) {
            edgeMap.set(key, fullFact)
          }
        }
      } catch (searchErr) {
        console.warn(`[Zep] Graph search failed for query "${q}":`, searchErr)
      }
    }

    const edges = Array.from(edgeMap.values())

    // If all layers are completely absent, return empty string for self-heal detection
    if (entitySummaries.length === 0 && episodesContent.length === 0 && edges.length === 0) {
      console.log('[Zep Retrieval] 0 entity nodes, 0 episodes, and 0 edges found for user:', userId)
      return ''
    }

    // ── Build 3 structured memory sections ──
    const sections: string[] = []

    if (entitySummaries.length > 0) {
      sections.push(`=== LONGITUDINAL PATIENT & ENTITY OVERVIEW (UNCONSTRAINED GRAPH MEMORY) ===\n\n${entitySummaries.join('\n\n')}`)
    }

    sections.push(
      episodesContent.length > 0
        ? `=== CHRONOLOGICAL CLINICAL EPISODES (EVIDENCE & CITATION SOURCE) ===\n\n${episodesContent.join('\n\n---\n\n')}`
        : '=== CHRONOLOGICAL CLINICAL EPISODES ===\n\n(No document episodes found)'
    )

    sections.push(
      edges.length > 0
        ? `=== EXTRACTED GRAPH FACTS & TEMPORAL RELATIONSHIPS ===\n\n${edges.map((e, idx) => `${idx + 1}. ${e}`).join('\n')}`
        : '=== EXTRACTED GRAPH FACTS & RELATIONSHIPS ===\n\n(No graph facts found)'
    )

    const context = sections.join('\n\n')

    // Logging metrics
    console.log('[Zep Retrieval] Entity node summaries retrieved:', entitySummaries.length)
    console.log('[Zep Retrieval] Chronological episodes retrieved:', episodesContent.length)
    console.log('[Zep Retrieval] Distinct graph edges retrieved (multi-query):', edges.length)
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
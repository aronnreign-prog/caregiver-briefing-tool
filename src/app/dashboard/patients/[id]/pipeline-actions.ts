'use server'

import { db } from '@/lib/db'
import { documents, briefings, patients } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { extractClinicalFacts } from '@/lib/ai/extract'
import { ingestDocumentFacts, queryPatientMemory } from '@/lib/zep/ingest'
import { getClinicalModel } from '@/lib/ai/model'
import { BriefingOutputSchema, ClinicalQueryOutputSchema } from '@/lib/ai/schemas'
import { generateObject } from 'ai'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { getCaregiver } from '@/lib/auth-session'

export async function createDocumentRecord(patientId: string, filename: string, blobUrl: string, fileSize: number, mimeType: string): Promise<{ id?: string; error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
    .limit(1)
  if (!patient) return { error: 'Patient not found or unauthorized' }
  
  try {
    const [inserted] = await db.insert(documents).values({
      patient_id: patientId,
      caregiver_id: caregiver.id,
      filename,
      blob_url: blobUrl,
      file_size: String(fileSize),
      mime_type: mimeType,
      status: 'uploaded',
    }).returning({ id: documents.id })
    return { id: inserted.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'DB insert failed' }
  }
}

export async function ingestDocument(documentId: string): Promise<{ error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.caregiver_id, caregiver.id)))
    .limit(1)
  if (!doc) return { error: 'Document not found or unauthorized' }
  if (!doc.blob_url) return { error: 'Document has no blob URL' }

  await db
    .update(documents)
    .set({ status: 'extracting' })
    .where(and(eq(documents.id, documentId), eq(documents.caregiver_id, caregiver.id)))

  try {
    const response = await fetch(doc.blob_url)
    if (!response.ok) throw new Error(`Failed to download blob: ${response.status}`)
    const arrayBuffer = await response.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    const extraction = await extractClinicalFacts(pdfBuffer, doc.filename)

    const ingestResult = await ingestDocumentFacts(
      caregiver.id,
      doc.patient_id,
      doc.id,
      doc.filename,
      extraction,
    )
    if (!ingestResult.success) console.error('[Pipeline] Zep ingest failed:', ingestResult.error)

    await db.update(documents).set({
      status: 'extracted',
      document_date: extraction.documentDate ?? null,
      document_type: extraction.documentType ?? null,
      processed_at: new Date(),
    }).where(and(eq(documents.id, documentId), eq(documents.caregiver_id, caregiver.id)))

    revalidatePath('/dashboard/patients/' + doc.patient_id)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Pipeline] Extraction failed:', message)
    await db.update(documents).set({ status: 'failed', error_message: message }).where(and(eq(documents.id, documentId), eq(documents.caregiver_id, caregiver.id)))
    return { error: message }
  }
}

export type ClinicalQueryResult = {
  answer?: string
  claims?: z.infer<typeof ClinicalQueryOutputSchema>['claims']
  error?: string
}

export type BriefingAudience = 'specialist' | 'general'

function buildZepQuery(): string {
  return 'comprehensive longitudinal clinical trajectory medications diagnoses lab results vitals and safety flags'
}

export async function createBriefingRecord(
  patientId: string,
  audience: string = 'specialist',
  sourceDocIds: string[] = [],
): Promise<{ id?: string; error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
    .limit(1)
  if (!patient) return { error: 'Patient not found or unauthorized' }

  try {
    const [inserted] = await db.insert(briefings).values({
      patient_id: patientId,
      caregiver_id: caregiver.id,
      audience,
      status: 'queued',
      source_doc_ids: sourceDocIds,
    }).returning({ id: briefings.id })
    return { id: inserted.id }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create briefing' }
  }
}

export async function generateBriefing(
  patientId: string,
  briefingId: string,
  audience: string = 'specialist',
): Promise<{ error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
    .limit(1)
  if (!patient) {
    await db
      .update(briefings)
      .set({ status: 'failed', error_message: 'Unauthorized or patient not found' })
      .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
    return { error: 'Unauthorized or patient not found' }
  }

  const [briefing] = await db
    .select()
    .from(briefings)
    .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
    .limit(1)
  if (!briefing) return { error: 'Briefing not found or unauthorized' }

  await db
    .update(briefings)
    .set({ status: 'processing' })
    .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))

  try {
    // 1. Query Zep with clinical intent query — the single source of truth for clinical memory
    const zepQuery = buildZepQuery()
    const context = await queryPatientMemory(caregiver.id, patientId, zepQuery)

    // 2. If memory is empty, fail with a clear message
    if (!context || context.trim().length === 0) {
      await db.update(briefings).set({
        status: 'failed',
        error_message: 'No clinical facts found in graph memory. Please ensure documents are extracted.',
      }).where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
      return { error: 'Clinical memory unavailable.' }
    }

    const patientHeader = `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`

    const model = getClinicalModel()

    // ── Diagnostics Context ────────────────────────────────────────────────
    console.log('=== [ZEP RETRIEVAL CONTEXT TO GEMINI] ===')
    console.log(patientHeader)
    console.log('--- context length: ' + context.length + ' chars ---')
    console.log('=== [END CONTEXT HEADER] ===')
    // ───────────────────────────────────────────────────────────────────────

    const SYSTEM_PROMPT = `You are a clinical AI assistant generating a structured specialist medical briefing.
Write for a medical specialist — include longitudinal trends, exact medication dosages, drug interactions, clinical reasoning, and notable absences.

Use ONLY the clinical facts provided in the context. Do not hallucinate or invent clinical findings.
For each claim, mark it:
- SUPPORTED: directly confirmed by records
- CONFLICTING: contradictory findings or superseded/invalidated diagnoses/allergies across records
- MEDICAL_KNOWLEDGE: based on standard pharmacology/clinical principles
- NOTABLE_ABSENCE (claim_type): an expected clinical test, monitoring baseline, or history is conspicuously missing
- UNVERIFIED: uncertain or unconfirmed

Clinical Narrative Structure:
1. Patient Demographics & Baseline Overview: Start with patient identity, DOB/age, and core history.
2. Longitudinal Clinical Trajectory: Synthesize the clinical history in chronological epochs (e.g. Initial Presentation & Diagnosis, Behavioral Management across years, Recent Trajectory). Write rich narrative prose rather than isolated bullet points.
3. Active Pharmacotherapy & Multi-System Baselines: Detail current active medications with exact dosages and active conditions. Note if prior medications were discontinued or superseded.
4. Flagged Safety Concerns & Discrepancies: Highlight acute contraindications, significant dosage fluctuations, abrupt discontinuations, or missing monitoring baselines.

PaperTrail Citation Requirement:
- Embed inline claim markers like [claim:c1], [claim:c2] immediately after each factual assertion, lab value, medication dose, or concern.
- Write individual claim tokens (e.g., [claim:c1][claim:c2]). Do NOT bundle multiple claim IDs inside a single comma-separated bracket.
- In each claim's evidence array, cite EVERY source document and page that supports the claim (extract source_doc_id from [doc_id: <uuid>] and source_page from [page: <number>] found inside <CHRONOLOGICAL_EVIDENCE>). For longitudinal trends spanning multiple dates/visits, include an evidence entry for each supporting document.`

    const { object } = await generateObject({
      model,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${patientHeader}\n\nExtracted clinical facts:\n\n${context}\n\nGenerate a comprehensive specialist briefing with inline [claim:cN] citations.`,
      }],
      schema: BriefingOutputSchema,
      abortSignal: AbortSignal.timeout(45000),
    })

    const cleanedBriefingText = object.briefing_text.replace(/^[0-9]+\s+/, '').trim()

    await db.update(briefings).set({
      status: 'complete',
      briefing_text: cleanedBriefingText,
      claims: object.claims,
      flagged_concerns: object.flagged_concerns,
      completed_at: new Date(),
    }).where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))

    revalidatePath('/dashboard/patients/' + patientId)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Briefing] Generation failed:', message)
    await db.update(briefings).set({ status: 'failed', error_message: message }).where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
    return { error: message }
  }
}

export async function askPatientClinicalQuery(
  patientId: string,
  question: string,
  previousTurn?: { question: string; answer: string },
): Promise<ClinicalQueryResult> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
    .limit(1)
  if (!patient) return { error: 'Patient not found or unauthorized' }

  const trimmedQuestion = question.trim()
  if (!trimmedQuestion) return { error: 'Please enter a clinical question.' }

  try {
    // 1. Query Zep graph memory: if a previous turn exists, combine prior question context for anaphoric resolution
    const retrievalQuery = previousTurn?.question
      ? `${previousTurn.question} ${trimmedQuestion}`
      : trimmedQuestion

    let context = await queryPatientMemory(caregiver.id, patientId, retrievalQuery)

    // If Zep is empty, fallback to self-heal rebuild from PDF docs
    if (!context || context.trim().length === 0) {
      console.log('[Clinical Query] Zep memory empty — attempting rebuild from Blob PDFs...')
      const patientDocs = await db
        .select()
        .from(documents)
        .where(and(eq(documents.patient_id, patientId), eq(documents.caregiver_id, caregiver.id), eq(documents.status, 'extracted')))

      for (const doc of patientDocs) {
        if (doc.blob_url) {
          try {
            const res = await fetch(doc.blob_url)
            if (res.ok) {
              const buffer = Buffer.from(await res.arrayBuffer())
              const extraction = await extractClinicalFacts(buffer, doc.filename)
              await ingestDocumentFacts(caregiver.id, patientId, doc.id, doc.filename, extraction)
            }
          } catch (rebuildErr) {
            console.warn('[Clinical Query Rebuild] Failed to reprocess doc:', doc.filename, rebuildErr)
          }
        }
      }
      context = await queryPatientMemory(caregiver.id, patientId, retrievalQuery)
    }

    if (!context || context.trim().length === 0) {
      return { error: 'No clinical facts available in records. Please upload at least one document first.' }
    }

    const patientHeader = `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`
    const model = getClinicalModel()

    const conversationContext = previousTurn
      ? `Prior Conversation Turn:\nUser asked: "${previousTurn.question}"\nAssistant answered: "${previousTurn.answer}"\n\n`
      : ''

    const SYSTEM_PROMPT = `You are a clinical AI assistant answering a specific clinical question about patient ${patient.name} based ONLY on their uploaded medical records and knowledge graph.

${conversationContext}Current Question to answer: "${trimmedQuestion}"

Guidelines:
1. Provide a direct, factual, and concise answer formatted cleanly in Markdown (with bullet points or bold text where appropriate).
2. If this is a follow-up question (e.g., "and what about now?", "why was that stopped?"), resolve pronouns and temporal references against the prior conversation turn, but strictly ground all facts in the provided medical records.
3. Ground every single claim strictly in the provided clinical facts and episodes. Never hallucinate.
4. If an aspect of the question is not documented in the records, explicitly state that it is not documented in the available records.
5. For every specific fact, medication, date, lab value, or observation asserted, embed an inline token like [claim:c1], [claim:c2].
6. For each claim in the schema:
   - Mark flag: 'SUPPORTED', 'CONFLICTING', or 'MEDICAL_KNOWLEDGE'.
   - In the evidence array, extract source_doc_id from [doc_id: <uuid>] and source_page from [page: <number>].
   - If citing multiple documents or chronological changes, include an evidence item for each supporting document.`

    const { object } = await generateObject({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${patientHeader}\n\nClinical Record & Graph Memory Context:\n\n${context}\n\nQuestion to answer: ${trimmedQuestion}`,
        },
      ],
      schema: ClinicalQueryOutputSchema,
      abortSignal: AbortSignal.timeout(45000),
    })

    return {
      answer: object.answer,
      claims: object.claims,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Clinical Query] Failed:', message)
    return { error: message }
  }
}
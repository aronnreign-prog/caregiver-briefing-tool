'use server'

import { db } from '@/lib/db'
import { documents, briefings, patients } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { extractClinicalFacts } from '@/lib/ai/extract'
import { ingestDocumentFacts, queryPatientMemory } from '@/lib/zep/ingest'
import { google } from '@ai-sdk/google'
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

const BriefingOutputSchema = z.object({
  briefing_text: z.string().describe('The clinical briefing markdown text. Embed inline claim markers like [claim:c1], [claim:c2] immediately after each fact, statement, or concern being asserted.'),
  claims: z.array(z.object({
    claim_id: z.string().describe('Matching identifier used in briefing_text, e.g. "c1", "c2".'),
    claim_text: z.string().describe('The specific factual assertion, trend, notable absence, or clinical statement.'),
    claim_type: z.enum(['source_document', 'medical_knowledge', 'reasoning', 'notable_absence']).describe('source_document for facts directly from records, medical_knowledge for general clinical pharmacology/pathology rules, reasoning for synthesized inferences, notable_absence when a critical expected test/medication/history is missing from the record.'),
    flag: z.enum(['SUPPORTED', 'PARTIALLY SUPPORTED', 'UNSUPPORTED', 'MEDICAL_KNOWLEDGE', 'UNVERIFIED', 'CONFLICTING']).optional().describe('SUPPORTED if backed by records; CONFLICTING if contradictory findings exist across visits/docs; MEDICAL_KNOWLEDGE if general medical science; UNVERIFIED if uncertain.'),
    evidence: z.array(z.object({
      source_doc_id: z.string().optional().describe('UUID of the source document from [doc_id: <uuid>] in context.'),
      source_page: z.number().optional().describe('1-indexed page number from [page: <number>] in context.'),
      source_quote: z.string().optional().describe('Verbatim quote or short excerpt from the source document.'),
      entry_text: z.string().optional().describe('Context or clinical rationale note.'),
    })).optional().describe('Array of citations supporting this claim. For multi-point trends or corroborating records, cite EVERY source document and page that supports the claim.'),
  })),
  flagged_concerns: z.array(z.object({
    concern: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
    related_claims: z.array(z.string()),
  })),
})

export const ClinicalQueryOutputSchema = z.object({
  answer: z.string().describe('The clinical answer in markdown with inline [claim:c1], [claim:c2] citations.'),
  claims: z.array(
    z.object({
      claim_id: z.string(),
      claim_text: z.string(),
      flag: z.enum([
        'SUPPORTED',
        'PARTIALLY SUPPORTED',
        'UNSUPPORTED',
        'MEDICAL_KNOWLEDGE',
        'UNVERIFIED',
        'CONFLICTING',
      ]).optional(),
      evidence: z.array(
        z.object({
          source_doc_id: z.string().optional(),
          source_page: z.number().optional(),
          source_quote: z.string().optional(),
          entry_text: z.string().optional(),
        }),
      ).optional(),
    }),
  ),
})

export type ClinicalQueryResult = {
  answer?: string
  claims?: z.infer<typeof ClinicalQueryOutputSchema>['claims']
  error?: string
}

export type BriefingAudience = 'specialist' | 'gp' | 'family' | 'general' | 'er_visit' | 'second_opinion'

function buildZepQuery(audience?: string): string {
  return 'longitudinal lab trends kidney renal cardiovascular metabolic psychiatric medications exact values drug interactions contraindications'
}

function audienceInstruction(audience?: string): string {
  return 'Write for a specialist — include lab trends, exact values, drug interactions, clinical reasoning.'
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
  audience: BriefingAudience,
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
    // 1. Query Zep with audience-dynamic query — the single source of truth for clinical memory
    const zepQuery = buildZepQuery(audience)
    let context = await queryPatientMemory(caregiver.id, patientId, zepQuery)

    // 2. If Zep is empty (deleted, never ingested, or any other reason),
    //    rebuild from Vercel Blob PDFs — regardless of Neon document status.
    //    Neon only holds metadata; Zep is the memory.
    if (!context || context.trim().length === 0) {
      console.log('[Briefing] Zep memory empty — rebuilding from Blob PDFs...')

      const patientDocs = await db
        .select()
        .from(documents)
        .where(and(eq(documents.patient_id, patientId), eq(documents.caregiver_id, caregiver.id)))

      const docsWithBlob = patientDocs.filter((d) => d.blob_url)

      if (docsWithBlob.length === 0) {
        await db.update(briefings).set({
          status: 'failed',
          error_message: 'No documents uploaded for this patient yet.',
        }).where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
        return { error: 'No documents found.' }
      }

      for (const doc of docsWithBlob) {
        try {
          console.log('[Briefing] Rebuilding Zep from:', doc.filename)
          const response = await fetch(doc.blob_url!)
          if (!response.ok) throw new Error(`Blob fetch failed: ${response.status}`)
          const buf = Buffer.from(await response.arrayBuffer())
          const extraction = await extractClinicalFacts(buf, doc.filename)
          await ingestDocumentFacts(caregiver.id, patientId, doc.id, doc.filename, extraction)
          await db.update(documents).set({
            status: 'extracted',
            document_date: extraction.documentDate ?? null,
            document_type: extraction.documentType ?? null,
            processed_at: new Date(),
            error_message: null,
          }).where(and(eq(documents.id, doc.id), eq(documents.caregiver_id, caregiver.id)))
        } catch (e) {
          console.error('[Briefing] Rebuild error for doc:', doc.id, e)
        }
      }

      // Re-query Zep after rebuild
      context = await queryPatientMemory(caregiver.id, patientId, zepQuery)
    }

    // 3. If still empty after rebuild attempt, fail with a clear message
    if (!context || context.trim().length === 0) {
      await db.update(briefings).set({
        status: 'failed',
        error_message: 'Could not retrieve clinical memory even after rebuilding from documents. Check document contents.',
      }).where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
      return { error: 'Clinical memory unavailable.' }
    }

    const patientHeader = `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`

    const model = google(process.env.AI_MODEL || 'gemini-2.5-flash')

    // ── Diagnostics Context ────────────────────────────────────────────────
    console.log('=== [ZEP RETRIEVAL CONTEXT TO GEMINI] ===')
    console.log(patientHeader)
    console.log('--- context length: ' + context.length + ' chars ---')
    console.log('=== [END CONTEXT HEADER] ===')
    // ───────────────────────────────────────────────────────────────────────

    const SYSTEM_PROMPT = `You are a clinical AI assistant generating a structured medical briefing.
${audienceInstruction(audience)}

Use only the clinical facts provided in the context. Do not hallucinate or invent clinical findings.
For each claim, mark it:
- SUPPORTED: directly confirmed by records
- CONFLICTING: contradictory findings or superseded/invalidated diagnoses/allergies across records
- MEDICAL_KNOWLEDGE: based on standard pharmacology/clinical principles
- NOTABLE_ABSENCE (claim_type): an expected clinical test, monitoring baseline, or history is conspicuously missing
- UNVERIFIED: uncertain or unconfirmed

Clinical Triage & Synthesis Hierarchy:
1. CRITICAL & URGENT SAFETY:
   - Identify and flag any drug-drug interactions, contraindications, or lab values outside safe therapeutic ranges as flagged_concerns.
2. ACTIVE MEDICATIONS & CURRENT DIAGNOSES:
   - Detail current active medications with exact dosages, schedules, and start/change dates.
   - Note if prior medications were discontinued or superseded (check temporal tags like [SUPERSEDED/INVALIDATED as of: ...]).
   - Summarize active medical conditions and chief complaints.
3. LONGITUDINAL TRAJECTORY & MULTI-SYSTEM TRENDS:
   - For every organ system with recorded lab tests (e.g. renal, cardiovascular, metabolic, hepatic, hematologic), track values chronologically over time.
   - If multiple historical values exist, explicitly show the chronological progression (e.g., "eGFR: 65 (Jun 2022) → 58 (Dec 2022) → 47 (Dec 2023) - consistent decline").
   - Synthesize multiple concurrent trends across different organ systems rather than focusing on only one.
4. NOTABLE ABSENCES & CONFLICTING DATA:
   - If a vital test, follow-up monitor, or clinical history is conspicuously missing for a patient with these conditions, record a claim with claim_type: "notable_absence".
   - If records disagree or a diagnosis/allergy was superseded, flag the claim as "CONFLICTING".
5. STABLE BASELINE ACKNOWLEDGEMENT:
   - If a patient or specific clinical parameter is stable with no adverse changes, drug interactions, or concerning drifts, state this clearly (e.g., "Patient maintains a stable clinical baseline with no acute safety flags"). Do not invent non-existent trends.
6. SCALE DEPTH TO RECORD VOLUME:
   - Synthesize a comprehensive briefing that covers all key clinical systems without unnecessary brevity when longitudinal records are provided.

PaperTrail Citation Requirement:
- Embed inline claim markers like [claim:c1], [claim:c2] in the briefing_text immediately after each factual statement, lab value, medication, or concern being asserted.
- Every [claim:cN] in the text must have a corresponding entry in the 'claims' array with matching claim_id ("cN").
- In each claim's evidence array, cite EVERY source document and page that supports the claim (extract source_doc_id from [doc_id: <uuid>] and source_page from [page: <number>]). For longitudinal trends spanning multiple dates/visits, include an evidence entry for each supporting document.`

    const { object } = await generateObject({
      model,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `${patientHeader}\n\nExtracted clinical facts:\n\n${context}\n\nGenerate a comprehensive ${audience} briefing with inline [claim:cN] citations.`,
      }],
      schema: BriefingOutputSchema,
    })

    await db.update(briefings).set({
      status: 'complete',
      briefing_text: object.briefing_text,
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
    // 1. Query Zep graph memory directly with the on-demand user question
    let context = await queryPatientMemory(caregiver.id, patientId, trimmedQuestion)

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
      context = await queryPatientMemory(caregiver.id, patientId, trimmedQuestion)
    }

    if (!context || context.trim().length === 0) {
      return { error: 'No clinical facts available in records. Please upload at least one document first.' }
    }

    const patientHeader = `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`
    const model = google(process.env.AI_MODEL || 'gemini-2.5-flash')

    const SYSTEM_PROMPT = `You are a clinical AI assistant answering a specific clinical question about patient ${patient.name} based ONLY on their uploaded medical records and knowledge graph.

Question: "${trimmedQuestion}"

Guidelines:
1. Provide a direct, factual, and concise answer formatted cleanly in Markdown (with bullet points or bold text where appropriate).
2. Ground every single claim strictly in the provided clinical facts and episodes. Never hallucinate.
3. If an aspect of the question is not documented in the records, explicitly state that it is not documented in the available records.
4. For every specific fact, medication, date, lab value, or observation asserted, embed an inline token like [claim:c1], [claim:c2].
5. For each claim in the schema:
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
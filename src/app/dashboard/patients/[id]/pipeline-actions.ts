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
    claim_text: z.string().describe('The specific factual assertion or clinical statement.'),
    claim_type: z.enum(['source_document', 'medical_knowledge', 'reasoning']),
    flag: z.enum(['SUPPORTED', 'PARTIALLY SUPPORTED', 'UNSUPPORTED', 'MEDICAL_KNOWLEDGE', 'UNVERIFIED']).optional(),
    evidence: z.object({
      source_doc_id: z.string().optional().describe('UUID of the source document from [doc_id: <uuid>] in context.'),
      source_page: z.number().optional().describe('1-indexed page number from [page: <n>] in context.'),
      source_quote: z.string().optional(),
      entry_text: z.string().optional(),
    }).optional(),
  })),
  flagged_concerns: z.array(z.object({
    concern: z.string(),
    severity: z.enum(['high', 'medium', 'low']),
    related_claims: z.array(z.string()),
  })),
})

type BriefingAudience = 'specialist' | 'gp' | 'family' | 'general' | 'er_visit' | 'second_opinion'

function audienceInstruction(audience: BriefingAudience): string {
  if (audience === 'specialist') return 'Write for a specialist — include lab trends, exact values, drug interactions, clinical reasoning.'
  if (audience === 'gp') return 'Write for a GP — clinical detail with practical management recommendations.'
  if (audience === 'family') return 'Write for a family caregiver — plain language, no jargon, focus on what to watch for.'
  if (audience === 'er_visit') return 'Write as an ER admission summary — critical flags first, current medications, allergies, recent labs.'
  if (audience === 'second_opinion') return 'Write for a second-opinion consult — comprehensive history, all diagnoses, full medication list.'
  return 'Write a clear, well-structured clinical summary.'
}

export async function createBriefingRecord(
  patientId: string,
  audience: string,
  sourceDocIds: string[],
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
    // 1. Query Zep — the single source of truth for clinical memory
    let context = await queryPatientMemory(caregiver.id, patientId, 'medications lab values conditions diagnoses vital signs allergies observations')

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
      context = await queryPatientMemory(caregiver.id, patientId, 'medications lab values conditions diagnoses vital signs allergies observations')
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

    const model = google('gemini-2.5-flash')

    // ── [TEMP DIAGNOSTICS] Context sent to Gemini ──────────────────────────
    console.log('=== [ZEP RETRIEVAL CONTEXT TO GEMINI] ===')
    console.log(patientHeader)
    console.log('--- context ---')
    console.log(context)
    console.log('=== [END CONTEXT] ===')
    // ───────────────────────────────────────────────────────────────────────

    const SYSTEM_PROMPT = `You are a clinical AI assistant generating a structured medical briefing.
${audienceInstruction(audience)}

Use only the clinical facts provided. Do not hallucinate.
For each claim, mark it SUPPORTED if backed by source context, or UNVERIFIED if uncertain.
Flag drug-drug interactions, contraindications, or concerning trends as flagged_concerns.

PaperTrail Citation Requirement:
- Embed inline claim markers like [claim:c1], [claim:c2] in the briefing_text immediately after the factual statement, lab value, medication, or concern being asserted.
- Every [claim:cN] in the text must have a corresponding entry in the 'claims' array with matching claim_id ("cN").
- In each claim's evidence, extract source_doc_id from the [doc_id: <uuid>] tag and source_page from the [page: <number>] tag in the context.`

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
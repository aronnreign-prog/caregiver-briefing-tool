'use server'

import { db } from '@/lib/db'
import { documents, briefings, patients } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
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

  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  if (!doc) return { error: 'Document not found' }
  if (!doc.blob_url) return { error: 'Document has no blob URL' }

  await db.update(documents).set({ status: 'extracting' }).where(eq(documents.id, documentId))

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
      extracted_entities: {
        medications: extraction.medications,
        lab_values: extraction.lab_values,
        conditions: extraction.conditions,
      },
      processed_at: new Date(),
    }).where(eq(documents.id, documentId))

    revalidatePath('/dashboard/patients/' + doc.patient_id)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Pipeline] Extraction failed:', message)
    await db.update(documents).set({ status: 'failed', error_message: message }).where(eq(documents.id, documentId))
    return { error: message }
  }
}

const BriefingOutputSchema = z.object({
  briefing_text: z.string(),
  claims: z.array(z.object({
    claim_id: z.string(),
    claim_text: z.string(),
    claim_type: z.enum(['source_document', 'medical_knowledge', 'reasoning']),
    flag: z.enum(['SUPPORTED', 'PARTIALLY SUPPORTED', 'UNSUPPORTED', 'MEDICAL_KNOWLEDGE', 'UNVERIFIED']).optional(),
    evidence: z.object({
      source_doc_id: z.string().optional(),
      source_page: z.number().optional(),
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
  caregiverId: string,
): Promise<{ error?: string }> {
  await db.update(briefings).set({ status: 'processing' }).where(eq(briefings.id, briefingId))

  try {
    // 1. Ensure all documents for this patient are extracted first
    const patientDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.patient_id, patientId))

    for (const doc of patientDocs) {
      if (doc.status !== 'extracted' && doc.blob_url) {
        try {
          const response = await fetch(doc.blob_url)
          if (response.ok) {
            const buf = Buffer.from(await response.arrayBuffer())
            const extraction = await extractClinicalFacts(buf, doc.filename)
            await ingestDocumentFacts(caregiverId, patientId, doc.id, doc.filename, extraction).catch(() => {})
            await db.update(documents).set({
              status: 'extracted',
              document_date: extraction.documentDate ?? null,
              document_type: extraction.documentType ?? null,
              extracted_entities: {
                medications: extraction.medications,
                lab_values: extraction.lab_values,
                conditions: extraction.conditions,
              },
              processed_at: new Date(),
            }).where(eq(documents.id, doc.id))
          }
        } catch (e) {
          console.error('[Briefing] Auto-extraction error for doc:', doc.id, e)
        }
      }
    }

    // 2. Query clinical memory from Zep
    let context = await queryPatientMemory(caregiverId, patientId, 'medications lab values conditions diagnoses vital signs allergies')

    // 3. Fallback: If Zep memory returns empty, build clinical context directly from extracted DB entities
    if (!context || context.trim().length === 0) {
      const refreshedDocs = await db
        .select()
        .from(documents)
        .where(eq(documents.patient_id, patientId))
      
      const factBlocks = refreshedDocs
        .filter(d => d.status === 'extracted' && d.extracted_entities)
        .map(doc => {
          const entities = doc.extracted_entities as { medications?: { name: string; dose?: string; frequency?: string }[]; lab_values?: { name: string; value: string; unit?: string; date?: string }[]; conditions?: { name: string; status?: string }[] } | null
          if (!entities) return ''
          const meds = (entities.medications || []).map(m => `Medication: ${m.name} ${m.dose || ''} ${m.frequency || ''}`.trim())
          const labs = (entities.lab_values || []).map(l => `Lab: ${l.name} = ${l.value} ${l.unit || ''} (Date: ${l.date || doc.document_date || 'unknown'})`.trim())
          const conds = (entities.conditions || []).map(c => `Condition: ${c.name} (${c.status || 'active'})`.trim())
          return `Document: ${doc.filename} (Date: ${doc.document_date || 'unknown'}, Type: ${doc.document_type || 'Record'})\n${[...meds, ...labs, ...conds].join('\n')}`
        })
        .filter(Boolean)

      if (factBlocks.length > 0) {
        context = factBlocks.join('\n\n---\n\n')
      }
    }

    if (!context || context.trim().length === 0) {
      await db.update(briefings).set({
        status: 'failed',
        error_message: 'No clinical memory found. Upload and ingest at least one document first.',
      }).where(eq(briefings.id, briefingId))
      return { error: 'No clinical context found in memory.' }
    }

    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1)
    const patientHeader = patient
      ? `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`
      : `Patient ID: ${patientId}`

    const model = google('gemini-2.5-flash')
    const { object } = await generateObject({
      model,
      system: `You are a clinical AI assistant generating a structured medical briefing.\n${audienceInstruction(audience)}\n\nUse only the clinical facts provided. Do not hallucinate.\nFor each claim, mark it SUPPORTED if backed by source context, or UNVERIFIED if uncertain.\nFlag drug-drug interactions, contraindications, or concerning trends as flagged_concerns.`,
      messages: [{
        role: 'user',
        content: `${patientHeader}\n\nExtracted clinical facts:\n\n${context}\n\nGenerate a comprehensive ${audience} briefing.`,
      }],
      schema: BriefingOutputSchema,
    })

    await db.update(briefings).set({
      status: 'complete',
      briefing_text: object.briefing_text,
      claims: object.claims,
      flagged_concerns: object.flagged_concerns,
      completed_at: new Date(),
    }).where(eq(briefings.id, briefingId))

    revalidatePath('/dashboard/patients/' + patientId)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Briefing] Generation failed:', message)
    await db.update(briefings).set({ status: 'failed', error_message: message }).where(eq(briefings.id, briefingId))
    return { error: message }
  }
}
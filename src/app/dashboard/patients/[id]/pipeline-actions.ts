'use server'

import { createClient } from '@/lib/supabase/server'
import { extractClinicalFacts } from '@/lib/ai/extract'
import { ingestDocumentFacts, queryPatientMemory } from '@/lib/zep/ingest'
import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

export async function ingestDocument(documentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized' }

  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!caregiver) return { error: 'Caregiver not found' }

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, patient_id, caregiver_id, filename, storage_path, status')
    .eq('id', documentId)
    .single()

  if (docErr || !doc) return { error: docErr?.message ?? 'Document not found' }
  if (!doc.storage_path) return { error: 'Document has no storage path' }

  await supabase.from('documents').update({ status: 'extracting' }).eq('id', documentId)

  try {
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('medical_records')
      .download(doc.storage_path)

    if (downloadErr || !fileData) {
      throw new Error(downloadErr?.message ?? 'Failed to download file')
    }

    const arrayBuffer = await fileData.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    const extraction = await extractClinicalFacts(pdfBuffer, doc.filename)

    const ingestResult = await ingestDocumentFacts(
      caregiver.id,
      doc.patient_id,
      doc.id,
      doc.filename,
      extraction,
    )

    if (!ingestResult.success) {
      console.error('[Pipeline] Zep ingest failed:', ingestResult.error)
    }

    await supabase.from('documents').update({
      status: 'extracted',
      document_date: extraction.documentDate ?? null,
      document_type: extraction.documentType ?? null,
      extracted_entities: {
        medications: extraction.medications,
        lab_values: extraction.lab_values,
        conditions: extraction.conditions,
      },
      processed_at: new Date().toISOString(),
    }).eq('id', documentId)

    revalidatePath('/dashboard/patients/' + doc.patient_id)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Pipeline] Extraction failed:', message)
    await supabase.from('documents').update({
      status: 'failed',
      error_message: message,
    }).eq('id', documentId)
    return { error: message }
  }
}

const BriefingOutputSchema = z.object({
  briefing_text: z.string(),
  claims: z.array(
    z.object({
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
    }),
  ),
  flagged_concerns: z.array(
    z.object({
      concern: z.string(),
      severity: z.enum(['high', 'medium', 'low']),
      related_claims: z.array(z.string()),
    }),
  ),
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

export async function generateBriefing(
  patientId: string,
  briefingId: string,
  audience: BriefingAudience,
  caregiverId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()

  await supabase.from('briefings').update({ status: 'processing' }).eq('id', briefingId)

  try {
    const context = await queryPatientMemory(
      caregiverId,
      patientId,
      'medications lab values conditions diagnoses vital signs allergies',
    )

    if (!context || context.trim().length === 0) {
      await supabase.from('briefings').update({
        status: 'failed',
        error_message: 'No clinical memory found. Upload and ingest at least one document first.',
      }).eq('id', briefingId)
      return { error: 'No clinical context found in memory.' }
    }

    const { data: patient } = await supabase
      .from('patients')
      .select('name, date_of_birth, relationship')
      .eq('id', patientId)
      .single()

    const patientHeader = patient
      ? 'Patient: ' + patient.name + ', DOB: ' + patient.date_of_birth + ', Relationship: ' + patient.relationship
      : 'Patient ID: ' + patientId

    const model = google('gemini-2.0-flash')

    const { object } = await generateObject({
      model,
      system: 'You are a clinical AI assistant generating a structured medical briefing.\n' + audienceInstruction(audience) + '\n\nUse only the clinical facts provided. Do not hallucinate.\nFor each claim, mark it SUPPORTED if backed by source context, or UNVERIFIED if uncertain.\nFlag drug-drug interactions, contraindications, or concerning trends as flagged_concerns.',
      messages: [
        {
          role: 'user',
          content: patientHeader + '\n\nExtracted clinical facts:\n\n' + context + '\n\nGenerate a comprehensive ' + audience + ' briefing.',
        },
      ],
      schema: BriefingOutputSchema,
    })

    await supabase.from('briefings').update({
      status: 'complete',
      briefing_text: object.briefing_text,
      claims: object.claims,
      flagged_concerns: object.flagged_concerns,
      completed_at: new Date().toISOString(),
    }).eq('id', briefingId)

    revalidatePath('/dashboard/patients/' + patientId)
    return {}
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Briefing] Generation failed:', message)
    await supabase.from('briefings').update({
      status: 'failed',
      error_message: message,
    }).eq('id', briefingId)
    return { error: message }
  }
}
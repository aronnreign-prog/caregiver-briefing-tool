import { streamObject } from 'ai'
import { getClinicalModel } from '@/lib/ai/model'
import { BriefingOutputSchema } from '@/lib/ai/schemas'
import { queryPatientMemory } from '@/lib/zep/ingest'
import { db } from '@/lib/db'
import { briefings, patients } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCaregiver } from '@/lib/auth-session'
import { NextResponse } from 'next/server'

export const maxDuration = 300

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: patientId } = await params
    const caregiver = await getCaregiver()
    if (!caregiver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { briefingId } = await req.json()
    if (!briefingId) return NextResponse.json({ error: 'Missing briefingId' }, { status: 400 })

    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
      .limit(1)

    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

    await db
      .update(briefings)
      .set({ status: 'processing' })
      .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))

    const zepQuery = 'longitudinal clinical trajectory medications lab trends psychiatric management'
    const context = await queryPatientMemory(caregiver.id, patientId, zepQuery)

    if (!context || context.trim().length === 0) {
      await db
        .update(briefings)
        .set({
          status: 'failed',
          error_message: 'No clinical facts found in graph memory. Please ensure documents are extracted.',
        })
        .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))

      return NextResponse.json({ error: 'Clinical memory unavailable.' }, { status: 400 })
    }

    const patientHeader = `Patient: ${patient.name}, DOB: ${patient.date_of_birth}, Relationship: ${patient.relationship}`
    const model = getClinicalModel()

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

    const result = streamObject({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${patientHeader}\n\nExtracted clinical facts:\n\n${context}\n\nGenerate a comprehensive specialist briefing with inline [claim:cN] citations.`,
        },
      ],
      schema: BriefingOutputSchema,
      onError: async ({ error }) => {
        // Log full technical stack trace to server logs for developers
        const technicalError = error instanceof Error ? (error.stack || error.message) : String(error)
        console.error('[Briefing Stream Generation Error - Developer Log]:', technicalError)

        // Store clean, user-friendly message for the UI
        const userFacingMessage = 'Unable to complete briefing synthesis. Please retry in a moment.'
        try {
          await db
            .update(briefings)
            .set({
              status: 'failed',
              error_message: userFacingMessage,
            })
            .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
        } catch (dbErr) {
          console.error('[Briefing Stream DB Error on failure update]:', dbErr)
        }
      },
      onFinish: async ({ object }) => {
        if (object) {
          try {
            const cleanedBriefingText = object.briefing_text.replace(/^[0-9]+\s+/, '').trim()
            await db
              .update(briefings)
              .set({
                status: 'complete',
                briefing_text: cleanedBriefingText,
                claims: object.claims,
                flagged_concerns: object.flagged_concerns,
                completed_at: new Date(),
              })
              .where(and(eq(briefings.id, briefingId), eq(briefings.caregiver_id, caregiver.id)))
          } catch (dbErr) {
            console.error('[Briefing Stream DB Error on complete update]:', dbErr)
          }
        }
      },
    })

    return result.toTextStreamResponse({
      headers: {
        'Transfer-Encoding': 'chunked',
        'Connection': 'keep-alive',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[Briefing Stream API Error]:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

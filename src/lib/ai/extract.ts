/**
 * src/lib/ai/extract.ts
 * Multimodal PDF extraction using Google Gemini 2.5 Flash + Zod.
 *
 * Schema principle: Gemini captures what the document actually says.
 * No inference, no correction, no invented facts.
 * Temporal dates are captured per-entity so Zep can build time-aware graph edges.
 */

import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'

export const ClinicalExtractionSchema = z.object({
  // ── Document identity ──────────────────────────────────────────────────────
  documentDate: z
    .string()
    .optional()
    .describe('Primary date of this document (ISO 8601, e.g. 2024-03-14). Use encounter date, test date, or issue date — whichever best represents when this document was created.'),
  documentType: z
    .string()
    .optional()
    .describe('e.g. Lab Report, Discharge Summary, Outpatient Prescription, Clinic Note, Radiology Report, Referral Letter'),

  // ── Encounter context ──────────────────────────────────────────────────────
  provider: z
    .string()
    .optional()
    .describe('Name and/or credentials of the treating clinician exactly as written (e.g. "Dr. A. Sharma, MD").'),
  specialty: z
    .string()
    .optional()
    .describe('Clinical specialty or department as stated (e.g. Nephrology, Cardiology, General Medicine).'),
  encounterContext: z
    .string()
    .optional()
    .describe('1–3 sentence verbatim or closely paraphrased description of why the patient was seen: chief complaint, reason for visit, referral indication, or document purpose.'),

  // ── Medications ────────────────────────────────────────────────────────────
  medications: z
    .array(
      z.object({
        name: z.string().describe('Drug name as written (generic or brand).'),
        dose: z.string().optional().describe('Dose as written, e.g. "500 mg".'),
        frequency: z.string().optional().describe('Frequency as written, e.g. "twice daily", "OD", "BD".'),
        route: z.string().optional().describe('Route of administration, e.g. "oral", "IV", "topical".'),
        prescribedDate: z
          .string()
          .optional()
          .describe('ISO 8601 date this medication was prescribed or documented, if visible.'),
        status: z
          .enum(['active', 'discontinued', 'changed', 'historical'])
          .default('active')
          .describe('"active" = currently prescribed; "discontinued" = explicitly stopped; "changed" = dose or drug altered; "historical" = listed as prior medication.'),
        pageNumber: z.number().optional().describe('1-indexed page number where this medication appears in the PDF.'),
      }),
    )
    .default([]),

  // ── Lab values ─────────────────────────────────────────────────────────────
  lab_values: z
    .array(
      z.object({
        name: z.string().describe('Test name as written, e.g. "eGFR", "HbA1c", "Serum Creatinine".'),
        value: z.string().describe('Numeric or text result as written.'),
        unit: z.string().optional().describe('Unit as written, e.g. "mg/dL", "%".'),
        date: z
          .string()
          .optional()
          .describe('ISO 8601 date the sample was collected or result was reported, if visible.'),
        referenceRange: z.string().optional().describe('Normal range as printed on the report, e.g. "70–110 mg/dL".'),
        flag: z
          .enum(['NORMAL', 'HIGH', 'LOW', 'ABNORMAL'])
          .optional()
          .describe('Abnormality flag if physically printed next to the result (H, L, A, *). Only set if explicitly marked; do not infer from the value.'),
        pageNumber: z.number().optional().describe('1-indexed page number where this lab result appears in the PDF.'),
      }),
    )
    .default([]),

  // ── Conditions & diagnoses ─────────────────────────────────────────────────
  conditions: z
    .array(
      z.object({
        name: z.string().describe('Diagnosed or listed condition exactly as stated.'),
        status: z
          .enum(['active', 'resolved', 'suspected'])
          .optional()
          .describe('"active" = ongoing; "resolved" = documented as resolved; "suspected" = under investigation.'),
        onsetDate: z
          .string()
          .optional()
          .describe('ISO 8601 date of onset or first diagnosis if stated.'),
        pageNumber: z.number().optional().describe('1-indexed page number where this diagnosis appears in the PDF.'),
      }),
    )
    .default([]),

  // ── Other clinical observations ────────────────────────────────────────────
  otherObservations: z
    .array(z.string())
    .default([])
    .describe(
      'Clinically significant facts not covered above: vitals (BP, HR, weight, SpO2, temperature), allergies, surgical or procedure history, follow-up instructions, referral outcomes, imaging findings. Each entry should be a concise self-contained sentence with a date if visible, e.g. "Blood pressure 145/90 mmHg on 2024-03-14.", "Allergic to Penicillin (documented).", "Follow-up in 4 weeks."',
    ),
})

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>

const SYSTEM_PROMPT = `You are a precise medical document parser. Extract clinical facts faithfully from a patient medical PDF.

Rules:
1. Extract ONLY what is explicitly stated. Do not infer, correct, or supplement.
2. Capture dates on every entity and documentDate where visible. Use ISO 8601 (YYYY-MM-DD). If the date is ambiguous, partial, or the year is unclear or missing, leave the date field empty/undefined rather than guessing. Never hallucinate or guess missing years.
3. Capture 1-indexed pageNumber on each entity where visible.
4. Medication status: "continue"/"started"/"prescribed" → active. "Stopped"/"discontinued"/"withheld" → discontinued. "Increased"/"reduced"/"changed to" → changed. Listed in prior history → historical.
5. Lab flags: only set "flag" if the document physically prints a marker (H, L, A, *) next to the result. Do not infer from the numeric value.
6. encounterContext: quote or closely paraphrase the stated reason for visit, chief complaint, or referral indication. Keep it factual and brief.
7. otherObservations: capture vitals, allergies, surgical history, follow-up instructions, imaging findings not covered by structured fields. Include a date on each where visible.
8. Never hallucinate drug names, lab values, or diagnoses.`

export async function extractClinicalFacts(
  pdfBuffer: Buffer,
  filename: string,
): Promise<ClinicalExtraction> {
  const model = google(process.env.AI_MODEL || 'gemini-2.5-flash')

  const { object } = await generateObject({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Extract all clinical facts from this medical document (${filename}). Capture dates on every entity where visible.`,
          },
          {
            type: 'file',
            data: pdfBuffer,
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
    schema: ClinicalExtractionSchema,
  })

  return object
}
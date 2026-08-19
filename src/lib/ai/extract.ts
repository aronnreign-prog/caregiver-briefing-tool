/**
 * src/lib/ai/extract.ts
 * Multimodal PDF extraction using Google Gemini 2.0 Flash + Zod.
 */

import { google } from '@ai-sdk/google'
import { generateObject } from 'ai'
import { z } from 'zod'

export const ClinicalExtractionSchema = z.object({
  documentDate: z.string().optional().describe('Primary date of this document (ISO, e.g. 2024-03-14)'),
  documentType: z.string().optional().describe('e.g. Lab Report, Discharge Summary, Prescription, Clinic Note'),
  medications: z.array(z.object({
    name: z.string(),
    dose: z.string().optional(),
    frequency: z.string().optional(),
    prescribedDate: z.string().optional().describe('ISO date string'),
  })).default([]),
  lab_values: z.array(z.object({
    name: z.string().describe('e.g. eGFR, Creatinine, HbA1c'),
    value: z.string(),
    unit: z.string().optional(),
    date: z.string().optional().describe('ISO date string'),
  })).default([]),
  conditions: z.array(z.object({
    name: z.string().describe('Diagnosed condition, e.g. Type 2 Diabetes'),
    status: z.enum(['active', 'resolved', 'suspected']).optional(),
  })).default([]),
})

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>

const SYSTEM_PROMPT = `You are a precise medical document parser.
Extract ALL medications, lab values, and diagnosed conditions from the provided medical PDF.
For medications include dose and frequency if present.
For lab values include units and the date of the test if visible.
Identify the document type and its primary date.
Never hallucinate — only extract what is explicitly stated in the document.`

export async function extractClinicalFacts(
  pdfBuffer: Buffer,
  filename: string,
): Promise<ClinicalExtraction> {
  const model = google('gemini-2.0-flash')

  const { object } = await generateObject({
    model,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all clinical facts from this medical document (' + filename + ').',
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
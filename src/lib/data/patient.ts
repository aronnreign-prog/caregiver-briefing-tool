import { db } from '@/lib/db'
import { patients } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { Patient } from '@/types/database'

export interface PatientResult {
  success: boolean
  data: Patient | null
  errorMessage: string | null
}

export async function getPatientSafely(patientId: string): Promise<PatientResult> {
  if (!patientId || patientId === 'undefined' || patientId.trim() === '') {
    return { success: false, data: null, errorMessage: 'Invalid request parameters.' }
  }
  try {
    const [patient] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1)
    if (!patient) return { success: false, data: null, errorMessage: 'Patient not found' }
    return { success: true, data: patient as unknown as Patient, errorMessage: null }
  } catch (err) {
    return { success: false, data: null, errorMessage: err instanceof Error ? err.message : 'Unknown error' }
  }
}

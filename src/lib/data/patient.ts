import { db } from '@/lib/db'
import { patients } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCaregiver } from '@/lib/auth-session'
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

  const caregiver = await getCaregiver()
  if (!caregiver) {
    return { success: false, data: null, errorMessage: 'Unauthorized' }
  }

  try {
    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
      .limit(1)

    if (!patient) return { success: false, data: null, errorMessage: 'Patient not found' }
    return { success: true, data: patient as unknown as Patient, errorMessage: null }
  } catch (err) {
    return { success: false, data: null, errorMessage: err instanceof Error ? err.message : 'Unknown error' }
  }
}


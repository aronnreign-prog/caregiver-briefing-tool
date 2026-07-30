import { createClient } from '@/lib/supabase/server'
import type { Patient } from '@/types/database'

export interface PatientResult {
  success: boolean
  data: Patient | null
  errorMessage: string | null
}

export async function getPatientSafely(patientId: string): Promise<PatientResult> {
  if (!patientId || patientId === 'undefined' || patientId.trim() === '') {
    console.error('🚨 [DATA ACCESS GUARD]: Invalid or missing identifier provided:', patientId)
    return {
      success: false,
      data: null,
      errorMessage: 'Invalid request parameters.',
    }
  }

  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single()

    if (error) {
      console.error('🚨 [DB ERROR - Patient Fetch]:', error)
      return {
        success: false,
        data: null,
        errorMessage: error.message || 'Failed to fetch patient from database',
      }
    }

    return {
      success: true,
      data,
      errorMessage: null,
    }
  } catch (err) {
    console.error('🚨 [DB ERROR - Patient Fetch]:', err)
    return {
      success: false,
      data: null,
      errorMessage: err instanceof Error ? err.message : 'Unknown error loading patient',
    }
  }
}

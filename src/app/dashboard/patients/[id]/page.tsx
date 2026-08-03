import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPatientSafely } from '@/lib/data/patient'
import { isValidUUID } from '@/lib/validators'
import PatientDetailClient from './PatientDetailClient'
import type { Patient, Document, Briefing } from '@/types/database'

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { id } = await params
  const patientId = id

  // Validate UUID before any DB query
  if (!isValidUUID(patientId)) {
    redirect('/dashboard')
  }

  const result = await getPatientSafely(patientId)

  if (!result.success) {
    throw new Error(result.errorMessage || 'Failed to load patient')
  }

  const patient = result.data as Patient

  // Fetch initial documents for this patient
  const { data: documents } = await supabase
    .from('documents')
    .select('id, filename, status, uploaded_at, storage_path')
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false })

  // Fetch initial briefings for this patient
  const { data: briefings } = await supabase
    .from('briefings')
    .select('id, audience, status, created_at, completed_at, briefing_text, claims, flagged_concerns')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })

  return (
    <PatientDetailClient
      patient={patient}
      initialDocuments={(documents || []) as Document[]}
      initialBriefings={(briefings || []) as Briefing[]}
    />
  )
}

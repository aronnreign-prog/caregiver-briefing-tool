import { createClient } from '@/lib/supabase/server'
import { getPatientSafely } from '@/lib/data/patient'
import { isValidUUID } from '@/lib/validators'
import PatientDetailClient from './PatientDetailClient'
import { redirect } from 'next/navigation'
import type { Patient, Document, Briefing } from '@/types/database'

const DEMO_PATIENTS: Record<string, Patient> = {
  'demo-1': {
    id: 'demo-1',
    caregiver_id: 'demo',
    name: 'Margaret Thompson',
    relationship: 'Mother',
    date_of_birth: '1945-03-12',
    created_at: new Date().toISOString(),
  },
  'demo-2': {
    id: 'demo-2',
    caregiver_id: 'demo',
    name: 'Robert Chen',
    relationship: 'Father',
    date_of_birth: '1948-07-24',
    created_at: new Date().toISOString(),
  },
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patientId = id

  const supabase = await createClient()
  const user = supabase ? (await supabase.auth.getUser()).data.user : null
  const isGuest = !user

  let patient: Patient
  let documents: Document[] = []
  let briefings: Briefing[] = []

  // Handle demo patients for guests (non-UUID ids)
  if (!isValidUUID(patientId)) {
    const demoPatient = DEMO_PATIENTS[patientId]
    if (!demoPatient) {
      redirect('/dashboard')
    }
    patient = demoPatient
  } else {
    // Real UUID — if guest, redirect to dashboard
    if (isGuest) {
      redirect('/dashboard')
    }

    const result = await getPatientSafely(patientId)
    if (!result.success) {
      throw new Error(result.errorMessage || 'Failed to load patient')
    }
    patient = result.data as Patient

    const { data: docData } = await supabase!
      .from('documents')
      .select('id, filename, status, uploaded_at, storage_path')
      .eq('patient_id', patientId)
      .order('uploaded_at', { ascending: false })

    const { data: briefingData } = await supabase!
      .from('briefings')
      .select('id, audience, status, created_at, completed_at, briefing_text, claims, flagged_concerns')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })

    documents = (docData || []) as Document[]
    briefings = (briefingData || []) as Briefing[]
  }

  return (
    <PatientDetailClient
      patient={patient}
      initialDocuments={documents}
      initialBriefings={briefings}
    />
  )
}

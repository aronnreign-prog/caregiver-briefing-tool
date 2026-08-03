import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPatientSafely } from '@/lib/data/patient'
import { isValidUUID } from '@/lib/validators'
import PatientDetailClient from './PatientDetailClient'
import type { Patient, Document, Briefing } from '@/types/database'

// Demo patients for unauthenticated guests
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

  // Handle demo patients (non-UUID ids) — available to everyone
  if (!isValidUUID(patientId)) {
    const demoPatient = DEMO_PATIENTS[patientId]
    if (!demoPatient) {
      redirect('/dashboard')
    }
    patient = demoPatient
  } else {
    // Real UUID patient — must be authenticated
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
    <div className="min-h-screen bg-background flex flex-col">

      {/* Guest mode banner */}
      {isGuest && (
        <div className="shrink-0 border-b border-border bg-surface/80 flex items-center justify-between px-6 py-2.5">
          <p className="text-[12px] text-muted-foreground">
            Guest mode — this is a demo patient. Sign in to work with your own records.
          </p>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <Link href="/login" className="font-mono text-[11px] text-muted-foreground border border-border px-3 py-1 rounded hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="font-mono text-[11px] bg-accent text-background px-3 py-1 rounded hover:opacity-90 transition-opacity font-semibold">
              Create account
            </Link>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="shrink-0 px-8 pt-6 pb-4">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-4">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9.5 6H2.5M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Dashboard
        </Link>
        <h1 className="text-[26px] font-bold text-foreground tracking-tight">{patient.name}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          DOB: {new Date(patient.date_of_birth).toLocaleDateString()} • {patient.relationship}
        </p>
      </div>

      {/* Patient detail — two-pane */}
      <PatientDetailClient
        patient={patient}
        initialDocuments={documents}
        initialBriefings={briefings}
      />
    </div>
  )
}

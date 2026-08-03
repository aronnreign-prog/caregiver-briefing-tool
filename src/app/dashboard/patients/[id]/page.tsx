import { createClient } from '@/lib/supabase/server'
import { getPatientSafely } from '@/lib/data/patient'
import { isValidUUID } from '@/lib/validators'
import PatientDetailClient from './PatientDetailClient'
import { redirect } from 'next/navigation'
import Link from 'next/link'
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {isGuest && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
            <span>Guest mode — this is a demo patient. Sign in to work with your own records.</span>
            <div className="flex gap-2 ml-4 shrink-0 font-mono text-[11px]">
              <Link href="/login" className="border border-border px-3 py-1 rounded hover:text-foreground transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="bg-accent text-background px-3 py-1 rounded hover:opacity-90 font-semibold transition-opacity">
                Create account
              </Link>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-4 mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors">
            ← Back to Dashboard
          </Link>
        </div>

        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {patient.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            DOB: {new Date(patient.date_of_birth).toLocaleDateString()} • {patient.relationship}
          </p>
        </header>

        <PatientDetailClient
          patient={patient}
          initialDocuments={documents}
          initialBriefings={briefings}
        />
      </div>
    </div>
  )
}

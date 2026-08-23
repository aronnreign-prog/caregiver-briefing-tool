import { getPatientSafely } from '@/lib/data/patient'
import { isValidUUID } from '@/lib/validators'
import PatientDetailClient from './PatientDetailClient'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Patient, Document, Briefing } from '@/types/database'
import { db } from '@/lib/db'
import { documents as documentsTable, briefings as briefingsTable } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getSession, getCaregiver } from '@/lib/auth-session'

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

  const session = await getSession()
  const user = session?.user
  const isGuest = !user

  let patient: Patient
  let documents: Document[] = []
  let briefings: Briefing[] = []

  if (!isValidUUID(patientId)) {
    const demoPatient = DEMO_PATIENTS[patientId]
    if (!demoPatient) {
      redirect('/dashboard')
    }
    patient = demoPatient
  } else {
    if (isGuest) {
      redirect('/dashboard')
    }

    const caregiver = await getCaregiver()
    if (!caregiver) {
      redirect('/dashboard')
    }

    const result = await getPatientSafely(patientId)
    if (!result.success || !result.data) {
      redirect('/dashboard')
    }
    patient = result.data as Patient

    const docResult = await db.select({
      id: documentsTable.id,
      patient_id: documentsTable.patient_id,
      caregiver_id: documentsTable.caregiver_id,
      filename: documentsTable.filename,
      blob_url: documentsTable.blob_url,
      file_size: documentsTable.file_size,
      mime_type: documentsTable.mime_type,
      status: documentsTable.status,
      uploaded_at: documentsTable.uploaded_at,
      processed_at: documentsTable.processed_at,
      document_date: documentsTable.document_date,
      document_type: documentsTable.document_type,
    }).from(documentsTable)
      .where(and(eq(documentsTable.patient_id, patientId), eq(documentsTable.caregiver_id, caregiver.id)))
      .orderBy(documentsTable.uploaded_at)

    const briefingResult = await db.select({
      id: briefingsTable.id,
      patient_id: briefingsTable.patient_id,
      caregiver_id: briefingsTable.caregiver_id,
      audience: briefingsTable.audience,
      status: briefingsTable.status,
      created_at: briefingsTable.created_at,
      completed_at: briefingsTable.completed_at,
      briefing_text: briefingsTable.briefing_text,
      claims: briefingsTable.claims,
      flagged_concerns: briefingsTable.flagged_concerns,
    }).from(briefingsTable)
      .where(and(eq(briefingsTable.patient_id, patientId), eq(briefingsTable.caregiver_id, caregiver.id)))
      .orderBy(briefingsTable.created_at)

    documents = (docResult || []) as unknown as Document[]
    briefings = (briefingResult || []) as unknown as Briefing[]
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {isGuest && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
            <span>Guest mode - this is a demo patient. Sign in to work with your own records.</span>
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
            Back to Dashboard
          </Link>
        </div>

        <header>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {patient.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-mono">
            DOB: {new Date(patient.date_of_birth).toLocaleDateString()}   {patient.relationship}
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

export const maxDuration = 60

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

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const patientId = id

  const session = await getSession()
  const user = session?.user

  if (!user) {
    redirect('/login')
  }

  if (!isValidUUID(patientId)) {
    redirect('/dashboard')
  }

  const caregiver = await getCaregiver()
  if (!caregiver) {
    redirect('/login')
  }

  const result = await getPatientSafely(patientId)
  if (!result.success || !result.data) {
    redirect('/dashboard')
  }
  const patient = result.data as Patient

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
  }).from(documentsTable).where(
    and(
      eq(documentsTable.patient_id, patientId),
      eq(documentsTable.caregiver_id, caregiver.id)
    )
  ).orderBy(documentsTable.uploaded_at)

  const briefingResult = await db.select({
    id: briefingsTable.id,
    patient_id: briefingsTable.patient_id,
    caregiver_id: briefingsTable.caregiver_id,
    audience: briefingsTable.audience,
    status: briefingsTable.status,
    briefing_text: briefingsTable.briefing_text,
    claims: briefingsTable.claims,
    flagged_concerns: briefingsTable.flagged_concerns,
    source_doc_ids: briefingsTable.source_doc_ids,
    created_at: briefingsTable.created_at,
    completed_at: briefingsTable.completed_at,
  }).from(briefingsTable).where(
    and(
      eq(briefingsTable.patient_id, patientId),
      eq(briefingsTable.caregiver_id, caregiver.id)
    )
  ).orderBy(briefingsTable.created_at)

  const documents = (docResult || []) as unknown as Document[]
  const briefings = (briefingResult || []) as unknown as Briefing[]

  return (
    <div className="min-h-[100dvh] bg-background p-3 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center space-x-4 mb-2 sm:mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors">
            ← Back to Dashboard
          </Link>
        </div>

        <header>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {patient.name}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-mono">
            DOB: {new Date(patient.date_of_birth).toLocaleDateString()} · {patient.relationship}
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

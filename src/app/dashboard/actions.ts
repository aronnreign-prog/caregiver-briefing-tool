'use server'

import { db } from '@/lib/db'
import { patients, documents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { deletePatientMemory } from '@/lib/zep/ingest'
import { getCaregiver } from '@/lib/auth-session'
import { del } from '@vercel/blob'

export async function addPatient(formData: FormData): Promise<{ error?: string }> {
  try {
    const caregiver = await getCaregiver()
    if (!caregiver) return { error: 'Unauthorized' }

    const name = formData.get('name') as string
    const date_of_birth = formData.get('date_of_birth') as string
    const relationship = formData.get('relationship') as string

    await db.insert(patients).values({ caregiver_id: caregiver.id, name, date_of_birth, relationship })
    revalidatePath('/dashboard')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to add patient' }
  }
}

export async function deletePatient(patientId: string): Promise<{ error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  await db.delete(patients).where(and(eq(patients.id, patientId), eq(patients.caregiver_id, caregiver.id)))
  await deletePatientMemory(patientId)
  revalidatePath('/dashboard')
  return {}
}

export async function deleteDocument(patientId: string, documentId: string): Promise<{ error?: string }> {
  const caregiver = await getCaregiver()
  if (!caregiver) return { error: 'Unauthorized' }

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.patient_id, patientId), eq(documents.caregiver_id, caregiver.id)))
    .limit(1)
  if (!doc) return { error: 'Document not found or unauthorized' }

  await db
    .delete(documents)
    .where(and(eq(documents.id, documentId), eq(documents.caregiver_id, caregiver.id)))

  if (doc.blob_url) {
    await del(doc.blob_url).catch(() => {})
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  return {}
}

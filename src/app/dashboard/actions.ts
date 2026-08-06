'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const GRAPHITI_WRAPPER_URL = process.env.GRAPHITI_WRAPPER_URL || 'https://caregiver-briefing-tool.onrender.com'

export async function addPatient(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Unauthorized')

  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!caregiver) throw new Error('Caregiver not found')

  const name = formData.get('name') as string
  const date_of_birth = formData.get('date_of_birth') as string
  const relationship = formData.get('relationship') as string

  const { error } = await supabase.from('patients').insert({
    caregiver_id: caregiver.id,
    name,
    date_of_birth,
    relationship
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/dashboard')
}

export async function deletePatient(patientId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized' }

  // Resolve caregiver so RLS confirms ownership
  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!caregiver) return { error: 'Caregiver not found' }

  const { error } = await supabase
    .from('patients')
    .delete()
    .eq('id', patientId)
    .eq('caregiver_id', caregiver.id)   // ownership guard — cannot delete another user's patient

  if (error) return { error: error.message }

  // Purge FalkorDB graph nodes for this patient
  try {
    await fetch(`${GRAPHITI_WRAPPER_URL}/patient/${patientId}`, { method: 'DELETE' })
  } catch (err) {
    console.error('[Sync] FalkorDB purge failed for patient — graph may contain orphaned nodes. Manual cleanup required:', err)
  }

  revalidatePath('/dashboard')
  return {}
}

export async function deleteDocument(patientId: string, documentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { error: 'Unauthorized' }

  // Fetch document to get storage path and verify ownership
  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path, patient_id')
    .eq('id', documentId)
    .eq('patient_id', patientId)
    .single()

  if (!doc) return { error: 'Document not found' }

  // Delete document row from Supabase Postgres
  const { error: dbErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (dbErr) return { error: dbErr.message }

  // Delete file from Supabase Storage if present
  if (doc.storage_path) {
    await supabase.storage.from('medical_records').remove([doc.storage_path]).catch(() => {})
  }

  // Purge FalkorDB graph episode nodes for this document
  try {
    await fetch(`${GRAPHITI_WRAPPER_URL}/document/${patientId}/${documentId}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('[Sync] Failed to purge document graph in FalkorDB:', err)
  }

  revalidatePath(`/dashboard/patients/${patientId}`)
  return {}
}


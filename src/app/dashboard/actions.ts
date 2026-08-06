'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

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

  revalidatePath('/dashboard')
  return {}
}

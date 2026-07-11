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

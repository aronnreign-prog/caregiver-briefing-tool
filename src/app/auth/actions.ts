'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { caregivers } from '@/lib/db/schema'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  try {
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() })
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Login failed'
    return { error: msg }
  }
}

export async function signup() {
  return { error: 'Public registration is closed. Please register for demo access.' }
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() })
  redirect('/login')
}

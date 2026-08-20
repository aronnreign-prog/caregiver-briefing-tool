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

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = formData.get('name') as string

  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name },
      headers: await headers(),
    })

    if (!result?.user?.id) return { error: 'Signup failed: no user returned' }

    await db.insert(caregivers).values({
      user_id: result.user.id,
      email: result.user.email,
      name: name,
    })

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Signup failed'
    return { error: msg }
  }
}

export async function logout() {
  await auth.api.signOut({ headers: await headers() })
  redirect('/login')
}

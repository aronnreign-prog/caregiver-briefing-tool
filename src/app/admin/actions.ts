'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { caregivers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession, isAdmin } from '@/lib/auth-session'

/**
 * Official Better Auth Admin Plugin User Creation
 * Doc: https://better-auth.com/docs/plugins/admin.md#create-user
 */
export async function createDemoUser(formData: FormData) {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized: Admin privileges required.' }
  }

  const name = (formData.get('name') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const password = (formData.get('password') as string)?.trim()

  if (!name || !email || !password) {
    return { error: 'All fields (Name, Email, Password) are required.' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  try {
    // Official Better Auth Admin API
    const result = await auth.api.createUser({
      body: {
        name,
        email,
        password,
        role: 'user',
      },
      headers: await headers(),
    })

    if (!result?.user?.id) {
      return { error: 'Failed to create user in authentication system.' }
    }

    // Ensure caregiver profile exists in Neon for CareNote workspaces
    const existingCaregiver = await db
      .select({ id: caregivers.id })
      .from(caregivers)
      .where(eq(caregivers.user_id, result.user.id))
      .limit(1)

    if (existingCaregiver.length === 0) {
      await db.insert(caregivers).values({
        user_id: result.user.id,
        email: result.user.email,
        name: name,
      })
    }

    revalidatePath('/admin')
    return { success: true, email, password }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create user'
    return { error: msg }
  }
}

/**
 * Official Better Auth Admin Plugin User Removal
 * Doc: https://better-auth.com/docs/plugins/admin.md#delete-user
 */
export async function deleteDemoUser(userId: string) {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized: Admin privileges required.' }
  }

  const session = await getSession()
  if (session?.user?.id === userId) {
    return { error: 'Cannot delete your own active admin account.' }
  }

  try {
    // Official Better Auth Admin API: removeUser
    await auth.api.removeUser({
      body: { userId },
      headers: await headers(),
    })
    revalidatePath('/admin')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to delete user'
    return { error: msg }
  }
}

/**
 * Official Better Auth Admin Plugin Ban User
 * Doc: https://better-auth.com/docs/plugins/admin.md#ban-user
 */
export async function banDemoUser(userId: string, banReason = 'Demo expired') {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized: Admin privileges required.' }
  }

  try {
    await auth.api.banUser({
      body: { userId, banReason },
      headers: await headers(),
    })
    revalidatePath('/admin')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to ban user'
    return { error: msg }
  }
}

/**
 * Official Better Auth Admin Plugin Unban User
 * Doc: https://better-auth.com/docs/plugins/admin.md#unban-user
 */
export async function unbanDemoUser(userId: string) {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized: Admin privileges required.' }
  }

  try {
    await auth.api.unbanUser({
      body: { userId },
      headers: await headers(),
    })
    revalidatePath('/admin')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to unban user'
    return { error: msg }
  }
}

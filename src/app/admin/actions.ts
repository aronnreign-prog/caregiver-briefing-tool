'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { caregivers, demoRequests, patients, documents } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession, isAdmin } from '@/lib/auth-session'
import { randomBytes } from 'crypto'
import { del } from '@vercel/blob'
import { deletePatientMemory } from '@/lib/zep/ingest'

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
    // 1. Fetch caregiver record for this user
    const [caregiver] = await db
      .select()
      .from(caregivers)
      .where(eq(caregivers.user_id, userId))
      .limit(1)

    if (caregiver) {
      // 2. Fetch all patients for this caregiver
      const caregiverPatients = await db
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.caregiver_id, caregiver.id))

      // 3. Clean up external resources for each patient (Blobs and Zep graphs)
      for (const p of caregiverPatients) {
        const patientDocs = await db
          .select({ blob_url: documents.blob_url })
          .from(documents)
          .where(eq(documents.patient_id, p.id))

        const blobUrls = patientDocs.map((d) => d.blob_url).filter(Boolean) as string[]
        if (blobUrls.length > 0) {
          await del(blobUrls).catch((err) => console.warn('[Blob] Cleanup error on admin user delete:', err))
        }

        await deletePatientMemory(caregiver.id, p.id).catch((err) =>
          console.warn('[Zep] Memory cleanup error on admin user delete:', err)
        )
      }

      // 4. Delete caregiver record (which cascades to patients, documents, briefings in DB)
      await db.delete(caregivers).where(eq(caregivers.id, caregiver.id))
    }

    // 5. Official Better Auth Admin API: removeUser
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

function generateCleanTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(6)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length]
  }
  return `CareNote-${code}`
}

/**
 * Approve a demo request, create Better Auth user, link caregiver record, and update status.
 */
export async function approveDemoRequest(requestId: string) {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized' }
  }

  if (!requestId) {
    return { error: 'Request ID is required' }
  }

  try {
    const [req] = await db
      .select()
      .from(demoRequests)
      .where(eq(demoRequests.id, requestId))
      .limit(1)

    if (!req) {
      return { error: 'Demo request not found' }
    }

    if (req.status === 'approved') {
      return { error: 'Demo request is already approved' }
    }

    const tempPassword = generateCleanTempPassword()

    // Call Better Auth official Admin API: createUser
    const result = await auth.api.createUser({
      body: {
        name: req.name,
        email: req.email,
        password: tempPassword,
        role: 'user',
      },
      headers: await headers(),
    })

    if (!result?.user?.id) {
      return { error: 'Failed to create user in authentication system.' }
    }

    // Insert linked caregivers record in Neon
    const existingCaregiver = await db
      .select({ id: caregivers.id })
      .from(caregivers)
      .where(eq(caregivers.user_id, result.user.id))
      .limit(1)

    if (existingCaregiver.length === 0) {
      await db.insert(caregivers).values({
        user_id: result.user.id,
        email: result.user.email,
        name: req.name,
      })
    }

    // Update demoRequests table for this requestId
    await db
      .update(demoRequests)
      .set({
        status: 'approved',
        approved_at: new Date(),
        created_user_id: result.user.id,
      })
      .where(eq(demoRequests.id, requestId))

    revalidatePath('/admin')

    return {
      success: true,
      email: req.email,
      password: tempPassword,
      name: req.name,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to approve demo request'
    return { error: msg }
  }
}

/**
 * Reject a demo request and update status in Neon.
 */
export async function rejectDemoRequest(requestId: string) {
  const authorized = await isAdmin()
  if (!authorized) {
    return { error: 'Unauthorized' }
  }

  if (!requestId) {
    return { error: 'Request ID is required' }
  }

  try {
    const [req] = await db
      .select()
      .from(demoRequests)
      .where(eq(demoRequests.id, requestId))
      .limit(1)

    if (!req) {
      return { error: 'Demo request not found' }
    }

    await db
      .update(demoRequests)
      .set({
        status: 'rejected',
      })
      .where(eq(demoRequests.id, requestId))

    revalidatePath('/admin')

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reject demo request'
    return { error: msg }
  }
}

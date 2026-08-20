import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { caregivers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { cache } from 'react'

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})

export const getCaregiver = cache(async () => {
  const session = await getSession()
  if (!session?.user?.id) return null
  let [caregiver] = await db
    .select()
    .from(caregivers)
    .where(eq(caregivers.user_id, session.user.id))
    .limit(1)

  if (!caregiver) {
    const [created] = await db
      .insert(caregivers)
      .values({
        user_id: session.user.id,
        email: session.user.email,
        name: session.user.name || 'Caregiver',
      })
      .returning()
    caregiver = created
  }

  return caregiver ?? null
})

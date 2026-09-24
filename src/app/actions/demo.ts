'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { demoRequests } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const DemoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  email: z.string().trim().email('Valid email address is required').max(255, 'Email must be 255 characters or less'),
  organization: z.string().trim().max(200, 'Organization must be 200 characters or less').optional(),
  role: z.string().trim().max(100, 'Role must be 100 characters or less').optional(),
  useCase: z.string().trim().max(2000, 'Use case must be 2000 characters or less').optional(),
})

export async function submitDemoRequest(
  formData: FormData
): Promise<{ success: true } | { error: string }> {
  try {
    const getOptionalString = (value: FormDataEntryValue | null): string | undefined => {
      if (typeof value !== 'string') return undefined
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : undefined
    }

    const rawData = {
      name: typeof formData.get('name') === 'string' ? (formData.get('name') as string).trim() : '',
      email: typeof formData.get('email') === 'string' ? (formData.get('email') as string).trim() : '',
      organization: getOptionalString(formData.get('organization')),
      role: getOptionalString(formData.get('role')),
      useCase:
        getOptionalString(formData.get('useCase')) ||
        getOptionalString(formData.get('use_case')),
    }

    const parsed = DemoRequestSchema.safeParse(rawData)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return { error: issue?.message || 'Invalid demo request input.' }
    }

    const { name, email, organization, role, useCase } = parsed.data

    // Deduplicate pending requests for the same email address
    const [existing] = await db
      .select({ id: demoRequests.id })
      .from(demoRequests)
      .where(and(eq(demoRequests.email, email.toLowerCase()), eq(demoRequests.status, 'pending')))
      .limit(1)

    if (existing) {
      return { success: true }
    }

    await db.insert(demoRequests).values({
      name,
      email: email.toLowerCase(),
      organization: organization || null,
      role: role || null,
      use_case: useCase || null,
      status: 'pending',
    })

    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit demo request.'
    return { error: message }
  }
}

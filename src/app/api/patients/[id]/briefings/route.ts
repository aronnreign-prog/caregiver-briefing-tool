import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { briefings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCaregiver } from '@/lib/auth-session'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caregiver = await getCaregiver()
  if (!caregiver) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.select().from(briefings).where(eq(briefings.patient_id, id))
  return NextResponse.json({ briefings: rows })
}

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getSession, isAdmin } from '@/lib/auth-session'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  caregivers as caregiversTable,
  patients as patientsTable,
  documents as documentsTable,
  demoRequests as demoRequestsTable,
} from '@/lib/db/schema'
import { eq, desc, inArray, count } from 'drizzle-orm'
import { AdminClient } from './AdminClient'

export const dynamic = 'force-dynamic'

export function computeAdminUserList(
  authUsers: Array<{
    id: string
    name: string
    email: string
    role?: string | null
    banned?: boolean | null
    banReason?: string | null
    createdAt?: Date | string
  }>,
  caregivers: Array<{ id: string; user_id: string }>,
  patientCounts: Array<{ caregiver_id: string; count: number | string }>,
  documentCounts: Array<{ caregiver_id: string; count: number | string }>
) {
  const caregiverByUserId = new Map(caregivers.map((c) => [c.user_id, c.id]))
  const patientCountMap = new Map(patientCounts.map((p) => [p.caregiver_id, Number(p.count)]))
  const documentCountMap = new Map(documentCounts.map((d) => [d.caregiver_id, Number(d.count)]))

  return authUsers.map((u) => {
    const caregiverId = caregiverByUserId.get(u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role || 'user',
      banned: Boolean(u.banned),
      banReason: u.banReason || null,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      patientCount: caregiverId ? (patientCountMap.get(caregiverId) || 0) : 0,
      documentCount: caregiverId ? (documentCountMap.get(caregiverId) || 0) : 0,
    }
  })
}

export default async function AdminPage() {
  const session = await getSession()
  if (!session?.user) {
    redirect('/login')
  }

  const authorized = await isAdmin()
  if (!authorized) {
    redirect('/dashboard')
  }

  // 1. Fetch users natively using Better Auth official Admin API
  // Doc: https://better-auth.com/docs/plugins/admin.md#list-users
  const reqHeaders = await headers()
  const authResponse = await auth.api.listUsers({
    query: {
      limit: 100,
    },
    headers: reqHeaders,
  })

  const authUsers = authResponse?.users || []
  const userIds = authUsers.map((u) => u.id)

  // 2. Query workspace usage stats with bounded SQL queries and aggregation
  const [caregivers, pendingRequestsRaw] = await Promise.all([
    userIds.length > 0
      ? db
          .select({
            id: caregiversTable.id,
            user_id: caregiversTable.user_id,
          })
          .from(caregiversTable)
          .where(inArray(caregiversTable.user_id, userIds))
      : Promise.resolve([]),

    db
      .select()
      .from(demoRequestsTable)
      .where(eq(demoRequestsTable.status, 'pending'))
      .orderBy(desc(demoRequestsTable.created_at))
      .limit(100),
  ])

  const caregiverIds = caregivers.map((c) => c.id)

  const [patientCounts, documentCounts] = await Promise.all([
    caregiverIds.length > 0
      ? db
          .select({
            caregiver_id: patientsTable.caregiver_id,
            count: count(patientsTable.id),
          })
          .from(patientsTable)
          .where(inArray(patientsTable.caregiver_id, caregiverIds))
          .groupBy(patientsTable.caregiver_id)
      : Promise.resolve([]),

    caregiverIds.length > 0
      ? db
          .select({
            caregiver_id: documentsTable.caregiver_id,
            count: count(documentsTable.id),
          })
          .from(documentsTable)
          .where(inArray(documentsTable.caregiver_id, caregiverIds))
          .groupBy(documentsTable.caregiver_id)
      : Promise.resolve([]),
  ])

  const userList = computeAdminUserList(authUsers, caregivers, patientCounts, documentCounts)

  const pendingRequests = (pendingRequestsRaw || []).map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    organization: r.organization || null,
    role: r.role || null,
    useCase: r.use_case || null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
  }))

  return (
    <AdminClient
      currentUserEmail={session.user.email}
      users={userList}
      pendingRequests={pendingRequests}
    />
  )
}

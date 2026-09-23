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
import { eq, desc } from 'drizzle-orm'
import { AdminClient } from './AdminClient'

export const dynamic = 'force-dynamic'

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

  // 2. Query workspace usage stats and pending demo requests from Neon
  const [caregivers, patients, documents, pendingRequestsRaw] = await Promise.all([
    db
      .select({
        id: caregiversTable.id,
        user_id: caregiversTable.user_id,
      })
      .from(caregiversTable),

    db
      .select({
        id: patientsTable.id,
        caregiver_id: patientsTable.caregiver_id,
      })
      .from(patientsTable),

    db
      .select({
        id: documentsTable.id,
        caregiver_id: documentsTable.caregiver_id,
      })
      .from(documentsTable),

    db
      .select()
      .from(demoRequestsTable)
      .where(eq(demoRequestsTable.status, 'pending'))
      .orderBy(desc(demoRequestsTable.created_at)),
  ])

  const userList = authUsers.map((u) => {
    const caregiver = (caregivers || []).find((c) => c.user_id === u.id)
    const userPatients = caregiver
      ? (patients || []).filter((p) => p.caregiver_id === caregiver.id)
      : []
    const userDocs = caregiver
      ? (documents || []).filter((d) => d.caregiver_id === caregiver.id)
      : []

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role || 'user',
      banned: Boolean(u.banned),
      banReason: u.banReason || null,
      createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      patientCount: userPatients.length,
      documentCount: userDocs.length,
    }
  })

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

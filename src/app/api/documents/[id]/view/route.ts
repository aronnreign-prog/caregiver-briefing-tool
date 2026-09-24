import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { documents } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCaregiver } from '@/lib/auth-session'

export function isValidVercelBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.blob.vercel-storage.com') ||
        parsed.hostname === 'blob.vercel-storage.com')
    )
  } catch {
    return false
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const caregiver = await getCaregiver()
    if (!caregiver) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required.' }, { status: 401 })
    }

    const { id: docId } = await params
    if (!docId) {
      return NextResponse.json({ error: 'Missing document ID.' }, { status: 400 })
    }

    // Tenant-isolated query: document MUST belong to this caregiver
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.caregiver_id, caregiver.id)))
      .limit(1)

    if (!doc || !doc.blob_url) {
      return NextResponse.json({ error: 'Document not found or access denied.' }, { status: 404 })
    }

    if (!isValidVercelBlobUrl(doc.blob_url)) {
      return NextResponse.json({ error: 'Invalid document storage URL.' }, { status: 400 })
    }

    const blobRes = await fetch(doc.blob_url)
    if (!blobRes.ok || !blobRes.body) {
      return NextResponse.json({ error: 'Failed to retrieve document from storage.' }, { status: 502 })
    }

    return new Response(blobRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

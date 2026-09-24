import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

import { NextResponse, type NextRequest } from 'next/server'

const handlers = toNextJsHandler(auth)

export const GET = handlers.GET

export async function POST(request: NextRequest) {
  let pathname = request.nextUrl.pathname
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    // Keep raw pathname if decoding fails
  }
  const normalized = pathname.replace(/\/+/g, '/').toLowerCase()

  if (normalized.includes('/sign-up')) {
    return NextResponse.json(
      { error: 'Public registration is closed. Please register for demo access.' },
      { status: 403 }
    )
  }
  return handlers.POST(request)
}

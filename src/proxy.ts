import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Immediately block any attempt to sign up publicly
  if (pathname.startsWith('/api/auth/sign-up')) {
    return NextResponse.json(
      { error: 'Public registration is closed. Please register for demo access.' },
      { status: 403 }
    )
  }

  // 2. Redirect anyone navigating to /signup back to #demo
  if (pathname.startsWith('/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.hash = 'demo'
    return NextResponse.redirect(url)
  }

  const session = await auth.api.getSession({ headers: request.headers })
  const isLoginPage = pathname.startsWith('/login')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isAdminPage = pathname.startsWith('/admin')

  // If already logged in, redirect away from /login
  if (session?.user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Protect /dashboard and /admin from unauthenticated users
  if (!session?.user && (isDashboardPage || isAdminPage)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

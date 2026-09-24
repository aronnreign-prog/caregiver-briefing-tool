import { NextResponse, type NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export function normalizePath(rawPath: string): string {
  try {
    const decoded = decodeURIComponent(rawPath)
    return decoded.replace(/\/+/g, '/').toLowerCase()
  } catch {
    return rawPath.replace(/\/+/g, '/').toLowerCase()
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const normalizedPath = normalizePath(pathname)

  // 1. Immediately block any attempt to sign up publicly (including path evasion variants)
  if (normalizedPath.startsWith('/api/auth/sign-up') || normalizedPath.includes('/sign-up')) {
    return NextResponse.json(
      { error: 'Public registration is closed. Please register for demo access.' },
      { status: 403 }
    )
  }

  // 2. Redirect anyone navigating to /signup back to #demo
  if (normalizedPath.startsWith('/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.hash = 'demo'
    return NextResponse.redirect(url)
  }

  const session = await auth.api.getSession({ headers: request.headers })
  const isLoginPage = normalizedPath.startsWith('/login')
  const isDashboardPage = normalizedPath.startsWith('/dashboard')
  const isAdminPage = normalizedPath.startsWith('/admin')

  // If already logged in, redirect away from /login
  if (session?.user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Protect /admin: require authenticated session with admin privileges
  if (isAdminPage) {
    if (!session?.user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    const user = session.user as { role?: string; email?: string }
    const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
    const isUserAdmin = user.role === 'admin' || (adminEmail && user.email?.toLowerCase() === adminEmail)
    if (!isUserAdmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Protect /dashboard from unauthenticated users
  if (!session?.user && isDashboardPage) {
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

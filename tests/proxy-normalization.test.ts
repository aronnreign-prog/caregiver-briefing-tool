import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePath } from '../src/proxy.ts'

function isSignupBlocked(pathname: string): boolean {
  const normalized = normalizePath(pathname)
  return (
    normalized.startsWith('/api/auth/sign-up') ||
    normalized.startsWith('/signup') ||
    normalized.includes('/sign-up')
  )
}

function classifyRoute(pathname: string) {
  const normalizedPath = normalizePath(pathname)
  return {
    normalizedPath,
    isLoginPage: normalizedPath.startsWith('/login'),
    isDashboardPage: normalizedPath.startsWith('/dashboard'),
    isAdminPage: normalizedPath.startsWith('/admin'),
    isSignupBlocked: isSignupBlocked(pathname),
  }
}

describe('Proxy Path Normalization and Signup Blocker', () => {
  test('blocks standard signup route', () => {
    assert.equal(isSignupBlocked('/api/auth/sign-up/email'), true)
    assert.equal(isSignupBlocked('/signup'), true)
  })

  test('blocks double-slash bypass attempt', () => {
    assert.equal(isSignupBlocked('/api/auth//sign-up/email'), true)
    assert.equal(isSignupBlocked('//signup'), true)
    assert.equal(isSignupBlocked('/api//auth//sign-up//email'), true)
  })

  test('blocks URL encoded bypass attempt', () => {
    assert.equal(isSignupBlocked('/api/auth/%73ign-up/email'), true)
    assert.equal(isSignupBlocked('/%73ignup'), true)
  })

  test('blocks case variation bypass attempt', () => {
    assert.equal(isSignupBlocked('/api/auth/SIGN-UP/email'), true)
    assert.equal(isSignupBlocked('/SignUp'), true)
  })

  test('allows legitimate routes', () => {
    assert.equal(isSignupBlocked('/login'), false)
    assert.equal(isSignupBlocked('/dashboard'), false)
    assert.equal(isSignupBlocked('/api/auth/session'), false)
    assert.equal(isSignupBlocked('/api/auth/sign-in/email'), false)
  })
})

describe('Edge Proxy Canonical Path Gating', () => {
  test('correctly collapses redundant slashes and lowercases', () => {
    assert.equal(normalizePath('//admin'), '/admin')
    assert.equal(normalizePath('///admin///users'), '/admin/users')
    assert.equal(normalizePath('/ADMIN'), '/admin')
    assert.equal(normalizePath('//DASHBOARD//PATIENTS'), '/dashboard/patients')
  })

  test('correctly decodes percent-encoded path segments', () => {
    assert.equal(normalizePath('/%61dmin'), '/admin')
    assert.equal(normalizePath('/%64ashboard/%70atients'), '/dashboard/patients')
    assert.equal(normalizePath('/%6cogin'), '/login')
  })

  test('gracefully handles malformed URL-encoded input without throwing', () => {
    assert.equal(normalizePath('/%E0%A4%A'), '/%e0%a4%a')
    assert.equal(normalizePath('//%99/admin'), '/%99/admin')
  })

  test('detects admin routes through double-slash and case evasion', () => {
    const r1 = classifyRoute('//admin')
    assert.equal(r1.isAdminPage, true)

    const r2 = classifyRoute('/Admin')
    assert.equal(r2.isAdminPage, true)

    const r3 = classifyRoute('/%61dmin/settings')
    assert.equal(r3.isAdminPage, true)

    const r4 = classifyRoute('/admin/users')
    assert.equal(r4.isAdminPage, true)

    const r5 = classifyRoute('/not-admin')
    assert.equal(r5.isAdminPage, false)
  })

  test('detects login and dashboard routes through double-slash evasion', () => {
    const login = classifyRoute('//login')
    assert.equal(login.isLoginPage, true)

    const dashboard = classifyRoute('//dashboard/patients/123')
    assert.equal(dashboard.isDashboardPage, true)

    const mixed = classifyRoute('//Login')
    assert.equal(mixed.isLoginPage, true)
  })
})

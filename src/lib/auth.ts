import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

const authSecret = process.env.BETTER_AUTH_SECRET
if (!authSecret && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: BETTER_AUTH_SECRET environment variable is required in production.')
}

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://carenote.in' : 'http://localhost:3000'),
  trustedOrigins: [
    'https://carenote.in',
    'https://www.carenote.in',
    ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
  ],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
  ],
  secret: authSecret || 'dev-only-secret-for-local-testing-only',
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

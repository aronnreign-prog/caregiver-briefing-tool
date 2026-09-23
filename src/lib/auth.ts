import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { db } from '@/lib/db'
import * as schema from '@/lib/db/schema'

export const auth = betterAuth({
  baseURL:
    process.env.BETTER_AUTH_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://carenote.in' : 'http://localhost:3000'),
  trustedOrigins: [
    'https://carenote.in',
    'https://www.carenote.in',
    'http://localhost:3000',
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
  secret: process.env.BETTER_AUTH_SECRET || 'fallback-secret',
})

export type Session = typeof auth.$Infer.Session
export type User = typeof auth.$Infer.Session.user

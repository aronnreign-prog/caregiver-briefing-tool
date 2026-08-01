'use client'

import { useState } from 'react'
import { login } from '@/app/auth/actions'
import Link from 'next/link'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await login(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">

      {/* Left — branding panel */}
      <div className="hidden lg:flex w-96 shrink-0 flex-col justify-between border-r border-border bg-surface px-10 py-12">
        <div>
          <div className="flex items-center gap-2 mb-12">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase">CareNote</span>
          </div>

          <h1 className="text-2xl font-semibold text-foreground leading-snug text-pretty mb-4">
            Medical records your doctor can actually use.
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Upload your parent&apos;s documents. Get a verified briefing with every claim traced to its source.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-4 my-10">
          {[
            { label: 'Source-cited claims', desc: 'Every fact linked to an exact quote and page number.' },
            { label: 'Trend detection', desc: 'GFR 65 → 58 → 51 → 47 across 18 months, flagged automatically.' },
            { label: 'Contraindication alerts', desc: 'Checked against DDInter drug interaction database.' },
          ].map(({ label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div>
          <p className="font-mono text-[10px] text-muted-foreground">v0.1 &middot; Private beta</p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase">CareNote</span>
          </div>

          <h2 className="text-lg font-semibold text-foreground mb-1">Sign in</h2>
          <p className="text-sm text-muted-foreground mb-8">Access your caregiving dashboard.</p>

          <form action={handleSubmit} className="space-y-4">
            {error && (
              <div className="border border-alert/30 bg-alert-dim rounded px-3 py-2.5">
                <p className="font-mono text-[11px] text-alert-foreground">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full bg-surface border border-border rounded px-3 py-2.5 text-sm text-foreground font-sans placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full bg-surface border border-border rounded px-3 py-2.5 text-sm text-foreground font-sans placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-background font-mono text-xs py-2.5 rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity mt-2"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="font-mono text-[10px] text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="mt-6 space-y-3 text-center">
            <p className="text-xs text-muted-foreground">
              No account?{' '}
              <Link href="/signup" className="text-accent hover:underline">
                Create one free
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              Just browsing?{' '}
              <Link href="/dashboard" className="text-accent hover:underline">
                Try the demo
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { login } from '@/app/auth/actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await login(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      } else if (result?.success) {
        window.location.href = '/dashboard'
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">

      {/* Left panel */}
      <div className="hidden lg:flex w-[440px] shrink-0 flex-col bg-surface border-r border-border px-10 py-12">
        <div className="flex items-center gap-2.5 mb-16">
          <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-mono text-[11px] font-bold tracking-widest text-foreground uppercase">CareNote</span>
        </div>

        <div className="flex-1">
          <h1 className="text-[28px] font-semibold text-foreground leading-tight tracking-tight mb-4">
            Medical records<br />your doctor can<br />actually use.
          </h1>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-12">
            Upload your parent&apos;s documents. Get a verified briefing with every claim traced to its exact source — ready for any appointment.
          </p>

          <div className="space-y-6">
            {[
              {
                label: 'Source-cited claims',
                desc: 'Every fact linked to an exact quote and page number from the original document.',
                color: 'bg-accent',
              },
              {
                label: 'Trend detection',
                desc: 'GFR 65 → 58 → 51 → 47 across 18 months, flagged automatically across providers.',
                color: 'bg-warning',
              },
              {
                label: 'Contraindication alerts',
                desc: 'Drug interactions checked in real-time against the DDInter database.',
                color: 'bg-alert',
              },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${item.color} mt-1.5 shrink-0`} />
                <div>
                  <p className="text-[12px] font-semibold text-foreground mb-0.5">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <p className="font-mono text-[9px] text-muted-foreground tracking-widest">v0.1 · Private beta</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">

          {/* Mobile brand */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="font-mono text-[11px] font-bold tracking-widest text-foreground uppercase">CareNote</span>
          </div>

          <h2 className="text-[22px] font-semibold text-foreground mb-1">Sign in</h2>
          <p className="text-[12px] text-muted-foreground mb-8">Access your caregiving dashboard.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase block mb-1.5">Email</label>
              <input
                name="email" type="email" required autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div>
              <label className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase block mb-1.5">Password</label>
              <input
                name="password" type="password" required autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-surface border border-border rounded-md px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {error && (
              <div className="border border-alert/30 bg-alert-dim rounded-md px-4 py-3">
                <p className="text-[12px] text-alert">{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-accent text-background font-mono text-[12px] font-bold py-3 rounded-md hover:opacity-90 transition-opacity disabled:opacity-60 mt-2 cursor-pointer"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-[12px] text-muted-foreground">
              No account?{' '}
              <Link href="/signup" className="text-accent hover:underline">Create one free</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

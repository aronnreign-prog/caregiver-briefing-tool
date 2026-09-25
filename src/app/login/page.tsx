'use client'

import { useState } from 'react'
import Link from 'next/link'
import { authClient } from '@/lib/auth-client'
import { Logo } from '@/components/ui/Logo'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    try {
      const result = await authClient.signIn.email({
        email,
        password,
      })
      if (result?.error) {
        setError(result.error.message || 'Login failed')
        setLoading(false)
      } else {
        window.location.href = '/dashboard'
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-[#EDEDED] flex">

      {/* Left panel */}
      <div className="hidden lg:flex w-[440px] shrink-0 flex-col bg-[#0D1117] border-r border-[#1F2937] px-10 py-12">
        <Link href="/" className="flex items-center gap-2.5 mb-16 hover:opacity-90 transition-opacity">
          <Logo size={22} priority />
          <span className="text-[13px] font-semibold tracking-tight text-white">CareNote</span>
        </Link>

        <div className="flex-1">
          <h1 className="text-[28px] font-semibold text-white leading-tight tracking-tight mb-4">
            Medical prescriptions<br />and notes your doctor<br />can actually use.
          </h1>
          <p className="text-[13px] text-white/60 leading-relaxed mb-12">
            Upload your parent&apos;s medical prescriptions and notes. Get a verified briefing with every claim traced to its exact source, ready for any appointment.
          </p>

          <div className="space-y-6">
            {[
              {
                label: 'PaperTrail citations',
                desc: 'Every clinical assertion links directly to an exact quote and page number in the original PDF.',
                color: 'bg-accent',
              },
              {
                label: 'Persistent graph memory',
                desc: 'Entities connected across time to maintain true medication regimens and prevent RAG amnesia.',
                color: 'bg-warning',
              },
              {
                label: 'Contraindication alerts',
                desc: 'Drug interactions and contradictions flagged with verifiable pharmacological rationale.',
                color: 'bg-alert',
              },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${item.color} mt-1.5 shrink-0`} />
                <div>
                  <p className="text-[12px] font-semibold text-white mb-0.5">{item.label}</p>
                  <p className="text-[11px] text-white/50 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[#1F2937] pt-6 flex items-center justify-between">
          <span className="font-mono text-[10px] text-white/40 tracking-wider">Curated Access</span>
          <Link href="/" className="font-mono text-[10px] text-white/50 hover:text-white transition-colors">
            ← Product Overview
          </Link>
        </div>
      </div>

      {/* Right panel: form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12">
        <div className="w-full max-w-sm">

          {/* Mobile brand */}
          <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden hover:opacity-90 transition-opacity">
            <Logo size={20} />
            <span className="text-[13px] font-semibold tracking-tight text-white">CareNote</span>
          </Link>

          <div className="bg-[#0D1117] border border-[#1F2937] rounded-xl p-7 shadow-2xl">
            <h2 className="text-[20px] font-semibold text-white mb-1 tracking-tight">Sign in</h2>
            <p className="text-[12px] text-white/50 mb-6">Access your clinical caregiving workspace.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-medium text-white/70 block mb-1.5">Email address</label>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  inputMode="email"
                  placeholder="you@example.com"
                  className="w-full min-h-[42px] bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-colors"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-white/70 block mb-1.5">Password</label>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full min-h-[42px] bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-colors"
                />
              </div>

              {error && (
                <div aria-live="polite" className="border border-red-500/30 bg-red-500/10 rounded-lg px-3.5 py-2.5">
                  <p className="text-[12px] text-red-300">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] bg-white text-black font-medium text-[13px] py-2.5 rounded-lg hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60 outline-none transition-all disabled:opacity-50 cursor-pointer shadow-sm mt-2"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[#1F2937] text-center">
              <p className="text-[12px] text-white/50">
                Demo access only.{' '}
                <Link href="/#demo" className="text-white hover:underline font-medium">Request access →</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

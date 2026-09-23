'use client'

import React, { useState, useEffect, useCallback, useId } from 'react'
import { submitDemoRequest } from '@/app/actions/demo'
import { CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'

export interface DemoRequestModalProps {
  isOpen?: boolean
  onClose?: () => void
}

/**
 * Global helper to trigger the Demo Request Modal from anywhere
 */
export function openDemoModal() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('carenote:open-demo-modal'))
  }
}

/**
 * Clickable trigger button that opens the Demo Request Modal
 */
export function DemoRequestTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={() => openDemoModal()}
      className={className}
      {...props}
    >
      {children}
    </button>
  )
}

/**
 * Clinical Dark "Request Demo Access" Interactive Modal
 */
export function DemoRequestModal({
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
}: DemoRequestModalProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [organization, setOrganization] = useState('')
  const [useCase, setUseCase] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : internalOpen

  const titleId = useId()
  const descId = useId()

  const handleClose = useCallback(() => {
    if (isControlled) {
      controlledOnClose?.()
    } else {
      setInternalOpen(false)
    }
  }, [isControlled, controlledOnClose])

  const handleReset = useCallback(() => {
    setName('')
    setEmail('')
    setRole('')
    setOrganization('')
    setUseCase('')
    setError(null)
    setSuccess(false)
  }, [])

  // Listen to custom open event and hash updates
  useEffect(() => {
    const handleOpenEvent = () => {
      setInternalOpen(true)
    }

    const handleHash = () => {
      if (
        window.location.hash === '#demo' ||
        window.location.hash === '#demo-request'
      ) {
        setInternalOpen(true)
      }
    }

    window.addEventListener('carenote:open-demo-modal', handleOpenEvent)
    window.addEventListener('hashchange', handleHash)

    // Check if initial URL had demo hash
    if (window.location.hash === '#demo' || window.location.hash === '#demo-request') {
      setInternalOpen(true)
    }

    return () => {
      window.removeEventListener('carenote:open-demo-modal', handleOpenEvent)
      window.removeEventListener('hashchange', handleHash)
    }
  }, [])

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  // Prevent background scrolling when modal is active
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('email', email.trim())
      if (role.trim()) formData.append('role', role.trim())
      if (organization.trim()) formData.append('organization', organization.trim())
      if (useCase.trim()) formData.append('useCase', useCase.trim())

      const result = await submitDemoRequest(formData)

      if ('error' in result && result.error) {
        setError(result.error)
      } else if ('success' in result && result.success) {
        setSuccess(true)
      } else {
        setError('Failed to submit demo request. Please try again.')
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop overlay */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-[#0A0E14]/80 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-[#0D1117] border border-[#1F2937] rounded-xl shadow-2xl overflow-hidden my-auto text-[#EDEDED] z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Subtle clinical accent top border */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="p-6 sm:p-7">
          {/* Close button */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
            className="absolute top-5 right-5 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {success ? (
            /* Confirmation State */
            <div className="py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <h3
                id={titleId}
                className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
              >
                Demo Request Received
              </h3>

              <p
                id={descId}
                className="text-[13px] text-white/70 leading-relaxed max-w-md mx-auto mt-2.5 mb-6"
              >
                Access is provisioned in curated batches to protect compute quotas. We will review
                your clinical workspace request and deliver your credentials shortly.
              </p>

              <div className="bg-[#0A0E14] border border-[#1F2937] rounded-lg p-3.5 mb-6 text-left space-y-2 font-mono text-[12px]">
                <div className="flex items-center justify-between text-white/50">
                  <span>Workspace Account:</span>
                  <span className="text-white font-sans font-medium truncate max-w-[220px]">
                    {email}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/50">
                  <span>Batch Status:</span>
                  <span className="text-emerald-400 font-sans font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    In Review Queue
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  handleReset()
                  handleClose()
                }}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-white text-black font-medium text-[13px] hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60 outline-none transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : (
            /* Request Form State */
            <div>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono tracking-wider uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    Curated Preview Access
                  </span>
                </div>
                <h3
                  id={titleId}
                  className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
                >
                  Request Demo Access
                </h3>
                <p id={descId} className="text-[13px] text-white/60 leading-relaxed mt-1">
                  Experience persistent patient knowledge graphs and source-grounded clinical briefings with clickable PaperTrail citations.
                </p>
              </div>

              {/* Inline Error Alert Box */}
              {error && (
                <div
                  aria-live="polite"
                  className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-[12px] flex items-start gap-2.5 animate-in fade-in duration-150"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="demo-name"
                    className="block text-[12px] font-medium text-white/80 mb-1.5"
                  >
                    Full Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="demo-name"
                    type="text"
                    required
                    autoComplete="name"
                    autoCapitalize="words"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dr. Sarah Jenkins or David Miller"
                    className="w-full min-h-[42px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                  />
                </div>

                {/* Email Address */}
                <div>
                  <label
                    htmlFor="demo-email"
                    className="block text-[12px] font-medium text-white/80 mb-1.5"
                  >
                    Email Address <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    required
                    autoComplete="email"
                    spellCheck={false}
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@organization.com or personal email"
                    className="w-full min-h-[42px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                  />
                </div>

                {/* Grid for Role & Organization */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label
                      htmlFor="demo-role"
                      className="block text-[12px] font-medium text-white/80 mb-1.5"
                    >
                      Role <span className="text-white/40 text-[11px] font-normal">(Optional)</span>
                    </label>
                    <div className="relative">
                      <select
                        id="demo-role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full min-h-[42px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white outline-none transition-colors appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-[#0A0E14] text-white/50">
                          Select your role…
                        </option>
                        <option value="Family Caregiver" className="bg-[#0A0E14] text-white">
                          Family Caregiver
                        </option>
                        <option value="Geriatrician" className="bg-[#0A0E14] text-white">
                          Geriatrician
                        </option>
                        <option value="Clinical Coordinator" className="bg-[#0A0E14] text-white">
                          Clinical Coordinator
                        </option>
                        <option value="Primary Care Physician" className="bg-[#0A0E14] text-white">
                          Primary Care Physician
                        </option>
                        <option value="Health Tech Explorer" className="bg-[#0A0E14] text-white">
                          Health Tech Explorer
                        </option>
                        <option value="Other" className="bg-[#0A0E14] text-white">
                          Other Clinical Specialist
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-white/40">
                        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                          <path
                            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                            clipRule="evenodd"
                            fillRule="evenodd"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="demo-organization"
                      className="block text-[12px] font-medium text-white/80 mb-1.5"
                    >
                      Organization{' '}
                      <span className="text-white/40 text-[11px] font-normal">(Optional)</span>
                    </label>
                    <input
                      id="demo-organization"
                      type="text"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="e.g. Stanford Health Care"
                      className="w-full bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* Brief Use Case / Note */}
                <div>
                  <label
                    htmlFor="demo-usecase"
                    className="block text-[12px] font-medium text-white/80 mb-1.5"
                  >
                    Brief Use Case / Note{' '}
                    <span className="text-white/40 text-[11px] font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="demo-usecase"
                    rows={3}
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    placeholder="What records are you synthesizing? (e.g. multi-year cardiology labs, discharge summaries)"
                    className="w-full bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors resize-none leading-relaxed"
                  />
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-white text-black font-medium text-[13px] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-white/60 outline-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                        <span>Submitting Request…</span>
                      </>
                    ) : (
                      <span>Request Demo Access</span>
                    )}
                  </button>
                </div>

                {/* Privacy & Quota Note */}
                <p className="text-[11px] text-white/40 text-center leading-relaxed">
                  Access is provisioned in curated batches to protect compute quotas. Invitations are delivered via email.
                </p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

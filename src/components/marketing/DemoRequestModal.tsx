'use client'

import React, { useState, useEffect, useCallback, useId } from 'react'
import { submitDemoRequest } from '@/app/actions/demo'
import { Logo } from '@/components/ui/Logo'
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  HeartHandshake,
  Stethoscope,
  Compass,
  User,
  Building2,
  Sparkles,
} from 'lucide-react'

export interface DemoRequestModalProps {
  isOpen?: boolean
  onClose?: () => void
}

export interface PersonaConfig {
  id: string
  label: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  contextLabel: string
  contextPlaceholder: string
  suggestedPills: string[]
}

export const CLINICAL_PERSONAS: PersonaConfig[] = [
  {
    id: 'Family Caregiver',
    label: 'Family Caregiver',
    subtitle: 'Aging parents, dementia, polypharmacy, chronic conditions',
    icon: HeartHandshake,
    contextLabel: 'Care Recipient Context (Optional)',
    contextPlaceholder: 'e.g. Mother (82) with Vascular Dementia & Heart Failure',
    suggestedPills: [
      '10+ Medications & Regimen Shifts',
      'Multi-Specialist Consultation Packets',
      'Cognitive & Behavioral Trajectory',
    ],
  },
  {
    id: 'Care Manager / Advocate',
    label: 'Care Manager / Patient Advocate',
    subtitle: 'Private geriatric care, patient navigation, eldercare',
    icon: Compass,
    contextLabel: 'Practice or Agency Name (Optional)',
    contextPlaceholder: 'e.g. Beacon Aging Care Management',
    suggestedPills: [
      'Longitudinal Client Dossiers',
      'Post-Discharge Care Transitions',
      'Doctor-Ready Family Briefings',
    ],
  },
  {
    id: 'Specialist Clinician',
    label: 'Specialist Physician / Clinician',
    subtitle: 'Neurology, geriatrics, psychiatry, palliative care',
    icon: Stethoscope,
    contextLabel: 'Specialty & Clinical Setting (Optional)',
    contextPlaceholder: 'e.g. Memory Clinic, Academic Medical Center',
    suggestedPills: [
      'Outside PDF Synthesis (15-min Consults)',
      'Drug Interaction & Contraindication Flags',
      'PaperTrail Source-Anchored Verification',
    ],
  },
  {
    id: 'Self-Advocating Patient',
    label: 'Self-Advocating Patient',
    subtitle: 'Managing own multi-system or rare disease history',
    icon: User,
    contextLabel: 'Primary Clinic / Health System (Optional)',
    contextPlaceholder: 'e.g. Specialized Center of Excellence',
    suggestedPills: [
      'Unifying 5+ Specialist Portals',
      'Appointment Briefings for New Doctors',
      'Longitudinal Lab & Symptom Trends',
    ],
  },
  {
    id: 'Health System / Clinical AI Lead',
    label: 'Health System / Clinical AI Lead',
    subtitle: 'Health system innovation, payer, research pilot',
    icon: Building2,
    contextLabel: 'Organization & Team (Optional)',
    contextPlaceholder: 'e.g. Digital Health Innovation Lab',
    suggestedPills: [
      'Temporal Graph Memory vs Vector RAG',
      'Clinical Safety & Zero-Trust Citations',
      'Enterprise Pilot Evaluation',
    ],
  },
]

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
  const [role, setRole] = useState('Family Caregiver')
  const [isCustomRole, setIsCustomRole] = useState(false)
  const [customRoleText, setCustomRoleText] = useState('')
  const [organization, setOrganization] = useState('')
  const [useCase, setUseCase] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : internalOpen

  const titleId = useId()
  const descId = useId()

  const activePersona = CLINICAL_PERSONAS.find((p) => p.id === role) || CLINICAL_PERSONAS[0]

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
    setRole('Family Caregiver')
    setIsCustomRole(false)
    setCustomRoleText('')
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

  function handleSelectPersona(personaId: string) {
    setIsCustomRole(false)
    setRole(personaId)
  }

  function handleAddPillToUseCase(pillText: string) {
    setUseCase((prev) => {
      const trimmed = prev.trim()
      if (!trimmed) return pillText
      if (trimmed.includes(pillText)) return prev
      return `${trimmed}; ${pillText}`
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return

    setError(null)
    setLoading(true)

    try {
      const finalRole = isCustomRole ? customRoleText.trim() : role.trim()
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('email', email.trim())
      if (finalRole) formData.append('role', finalRole)
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
    >
      {/* Backdrop overlay */}
      <div
        onClick={handleClose}
        className="fixed inset-0 bg-[#0A0E14]/85 backdrop-blur-md transition-opacity"
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl bg-[#0D1117] border border-[#1F2937] rounded-xl shadow-2xl overflow-hidden my-auto text-[#EDEDED] z-10 animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Subtle clinical accent top border */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent shrink-0" />

        <div className="p-5 sm:p-7 overflow-y-auto">
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
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <h3
                id={titleId}
                className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
              >
                Demo Access Request Received
              </h3>

              <p
                id={descId}
                className="text-[13px] text-white/70 leading-relaxed max-w-md mx-auto mt-2.5 mb-6"
              >
                Access is provisioned in curated batches to protect compute quotas. We will review
                your clinical workspace request and deliver your credentials directly to your inbox.
              </p>

              <div className="bg-[#0A0E14] border border-[#1F2937] rounded-lg p-4 mb-6 text-left space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between text-white/50">
                  <span>Workspace Account:</span>
                  <span className="text-white font-medium truncate max-w-[220px]">
                    {email}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/50">
                  <span>Selected Perspective:</span>
                  <span className="text-emerald-400 font-medium">
                    {isCustomRole ? customRoleText || 'Custom' : role}
                  </span>
                </div>
                <div className="flex items-center justify-between text-white/50">
                  <span>Review Status:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Priority Review Queue
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
              <div className="mb-5">
                <div className="flex items-center gap-3">
                  <Logo size={24} priority />
                  <h3
                    id={titleId}
                    className="text-xl sm:text-2xl font-semibold text-white tracking-tight"
                  >
                    Request Demo Access
                  </h3>
                </div>
                <p id={descId} className="text-[13px] text-white/65 leading-relaxed mt-1.5">
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
                {/* 1. Identity Selection */}
                <div>
                  <label className="block text-[12px] font-medium text-white/85 mb-2">
                    Who are you managing records for? <span className="text-emerald-400">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CLINICAL_PERSONAS.map((persona) => {
                      const Icon = persona.icon
                      const isSelected = !isCustomRole && role === persona.id

                      return (
                        <button
                          key={persona.id}
                          type="button"
                          onClick={() => handleSelectPersona(persona.id)}
                          aria-pressed={isSelected}
                          className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer outline-none ${
                            isSelected
                              ? 'bg-emerald-950/25 border-emerald-500/50 ring-1 ring-emerald-500/30 text-white'
                              : 'bg-[#0A0E14] border-[#1F2937] text-white/70 hover:border-white/20 hover:bg-[#121720]'
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded shrink-0 mt-0.5 ${
                              isSelected
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-white/[0.04] text-white/50'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12px] font-medium tracking-tight text-white flex items-center justify-between">
                              <span>{persona.label}</span>
                              {isSelected && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ml-1.5" />
                              )}
                            </div>
                            <div className="text-[11px] text-white/50 leading-snug mt-0.5 line-clamp-2">
                              {persona.subtitle}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Option for custom role */}
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <button
                      type="button"
                      onClick={() => setIsCustomRole(!isCustomRole)}
                      className="text-white/50 hover:text-white transition-colors underline cursor-pointer"
                    >
                      {isCustomRole ? 'Back to suggested roles' : 'Other clinical or care role?'}
                    </button>
                  </div>

                  {isCustomRole && (
                    <div className="mt-2 animate-in fade-in duration-150">
                      <input
                        type="text"
                        maxLength={100}
                        value={customRoleText}
                        onChange={(e) => setCustomRoleText(e.target.value)}
                        placeholder="Describe your role (e.g. Hospice Nurse, Neuropsychologist)"
                        className="w-full min-h-[38px] bg-[#0A0E14] border border-[#1F2937] focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 rounded-lg px-3 py-1.5 text-[12px] text-white placeholder:text-white/30 outline-none transition-colors"
                      />
                    </div>
                  )}
                </div>

                {/* 2. Contact Credentials */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                      maxLength={100}
                      autoComplete="name"
                      autoCapitalize="words"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Dr. Sarah Jenkins or David Miller"
                      className="w-full min-h-[40px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                    />
                  </div>

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
                      maxLength={255}
                      autoComplete="email"
                      spellCheck={false}
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@organization.com or personal"
                      className="w-full min-h-[40px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                    />
                  </div>
                </div>

                {/* 3. Contextual Field (Adapts based on selected role) */}
                <div>
                  <label
                    htmlFor="demo-organization"
                    className="block text-[12px] font-medium text-white/80 mb-1.5"
                  >
                    {isCustomRole ? 'Organization / Practice (Optional)' : activePersona.contextLabel}
                  </label>
                  <input
                    id="demo-organization"
                    type="text"
                    maxLength={200}
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder={
                      isCustomRole
                        ? 'e.g. Health System, Private Practice, or Agency'
                        : activePersona.contextPlaceholder
                    }
                    className="w-full min-h-[40px] bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors"
                  />
                </div>

                {/* 4. Use Case with Quick Scenario Chips */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="demo-usecase"
                      className="block text-[12px] font-medium text-white/80"
                    >
                      Clinical Focus / Records to Synthesize{' '}
                      <span className="text-white/40 text-[11px] font-normal">(Optional)</span>
                    </label>
                  </div>

                  {/* Dynamic Persona Suggestion Chips */}
                  {!isCustomRole && activePersona.suggestedPills.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {activePersona.suggestedPills.map((pill) => (
                        <button
                          key={pill}
                          type="button"
                          onClick={() => handleAddPillToUseCase(pill)}
                          className="text-[11px] bg-white/[0.04] hover:bg-emerald-500/15 hover:border-emerald-500/40 border border-[#1F2937] text-white/70 hover:text-emerald-300 px-2.5 py-1 rounded-md transition-colors cursor-pointer text-left"
                        >
                          + {pill}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    id="demo-usecase"
                    rows={3}
                    maxLength={2000}
                    value={useCase}
                    onChange={(e) => setUseCase(e.target.value)}
                    placeholder="Tell us what patient records you are organizing (e.g. multi-year medication timelines, cardiology consult notes, neurology discharge summaries)..."
                    className="w-full bg-[#0A0E14] border border-[#1F2937] focus:border-white/40 focus:ring-1 focus:ring-white/30 rounded-lg px-3.5 py-2 text-[13px] text-white placeholder:text-white/30 outline-none transition-colors resize-none leading-relaxed"
                  />
                </div>

                {/* 5. Submit Button */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-lg bg-white text-black font-medium text-[13px] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-white/60 outline-none"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-black" />
                        <span>Submitting Request...</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span>Request Demo Access</span>
                        <Sparkles className="w-3.5 h-3.5 opacity-70" />
                      </span>
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

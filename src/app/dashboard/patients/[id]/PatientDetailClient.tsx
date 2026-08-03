'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'
import type { Patient, Document, Briefing } from '@/types/database'

// ─── Demo data (shown to guests / demo patients only) ─────────────────────────

const DEMO_DOCUMENTS: Document[] = [
  { id: 'd1', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Mar 2024.pdf', status: 'extracted', uploaded_at: '2024-03-14T10:00:00Z' },
  { id: 'd2', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Cardiology Visit Notes.pdf', status: 'extracted', uploaded_at: '2024-03-11T14:30:00Z' },
  { id: 'd3', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Sep 2023.pdf', status: 'extracted', uploaded_at: '2023-09-05T09:15:00Z' },
]

const DEMO_BRIEFING: Briefing = {
  id: 'b1',
  patient_id: 'demo-1',
  caregiver_id: 'demo',
  audience: 'specialist',
  status: 'complete',
  created_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  source_doc_ids: ['d1', 'd2', 'd3'],
  briefing_text: `## Patient Summary

Margaret Thompson (DOB 1945-03-12) presents with a documented 18-month decline in renal function across 6 lab draws sourced from 3 different providers. GFR has fallen from 65 to 47 over this period.

Her new cardiologist prescribed Lisinopril (10 mg daily) on 2024-03-14 — an ACE inhibitor that is contraindicated in the context of declining kidney function per DDInter interaction #4521.

## Current Medications

- Lisinopril 10 mg daily — NEW, prescribed 2024-03-14
- Atorvastatin 40 mg nightly — ongoing since 2022-06
- Metoprolol succinate 25 mg daily — ongoing since 2021-11

## Lab Trends

GFR: \`65\` (Jun 2022) → \`58\` (Dec 2022) → \`51\` (Jun 2023) → \`47\` (Dec 2023) — consistent decline across 18 months.

Creatinine: \`0.9\` (Jun 2022) → \`1.1\` (Dec 2022) → \`1.3\` (Jun 2023) → \`1.5\` (Dec 2023)

## Recommendation

Flag the Lisinopril prescription for review before the next appointment. Request a nephrology consult to assess trajectory. The rate of GFR decline (-18 points / 18 months) warrants specialist involvement.`,
  claims: [
    { claim_text: 'GFR has fallen from 65 to 47', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd1', source_quote: 'eGFR 47 mL/min/1.73m²', source_page: 1 } },
    { claim_text: 'Lisinopril 10 mg daily', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd2', source_quote: 'Lisinopril 10mg QD — new prescription', source_page: 2 } },
    { claim_text: 'contraindicated in the context of declining kidney function', claim_type: 'medical_knowledge', flag: 'MEDICAL_KNOWLEDGE', evidence: { entry_text: 'ACE inhibitors contraindicated in eGFR < 30, caution below 60' } },
  ],
  flagged_concerns: [
    { concern: 'ACE inhibitor (Lisinopril) prescribed despite 18-month declining GFR trend — contraindicated in declining kidney function.', severity: 'high', related_claims: ['c1'] },
  ],
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Claim = {
  claim_text: string
  claim_type: string
  flag?: string
  evidence?: {
    source_doc_id?: string
    source_page?: number
    source_quote?: string
    entry_text?: string
  } | null
  // PaperTrail v2 fields (future compatibility)
  source_type?: string
  source_id?: string
  source_excerpt?: string
  source_page?: number | null
  verification_status?: 'supported' | 'partial' | 'unsupported'
}

type FlaggedConcern = { severity: 'high' | 'medium' | 'low'; concern?: string; description?: string }

// ─── Citation chip ────────────────────────────────────────────────────────────

function CitationChip({ claim, onDocClick }: {
  claim: Claim
  onDocClick: (e: React.MouseEvent, id: string, page?: number) => void
}) {
  const isDrug = claim.flag === 'MEDICAL_KNOWLEDGE' || claim.source_type === 'drug_interaction'
  const docId = claim.evidence?.source_doc_id || claim.source_id
  const page = claim.evidence?.source_page ?? claim.source_page
  const label = isDrug ? 'DDInter' : `Doc · p.${page ?? '?'}`
  const title = claim.evidence?.source_quote || claim.evidence?.entry_text || claim.source_excerpt || ''

  return (
    <button
      onClick={(e) => !isDrug && docId ? onDocClick(e, docId, page ?? undefined) : undefined}
      className={`inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle transition-colors ${
        isDrug
          ? 'border-warning/40 text-warning bg-warning-dim cursor-default'
          : 'border-accent/40 text-accent bg-accent-dim hover:border-accent hover:bg-accent/10 cursor-pointer'
      }`}
      title={title}
    >
      {isDrug ? '⚠' : '↗'} {label}
    </button>
  )
}

// ─── Pipeline status bar ──────────────────────────────────────────────────────

const PIPELINE_STEPS = ['Uploaded', 'Extracting', 'Ready']

function pipelineStep(status: string): number {
  if (status === 'uploaded') return 0
  if (status === 'processing' || status === 'extracting') return 1
  if (status === 'extracted' || status === 'ready' || status === 'complete') return 2
  return 0
}

function PipelineBar({ status }: { status: string }) {
  const step = pipelineStep(status)
  const failed = status === 'failed'
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {PIPELINE_STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div className={`w-1 h-1 rounded-full ${
            failed && i === step ? 'bg-alert' :
            i < step ? 'bg-success' :
            i === step ? 'bg-accent' :
            'bg-border'
          }`} />
          <span className={`font-mono text-[9px] ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          {i < PIPELINE_STEPS.length - 1 && <span className="text-border text-[9px]">·</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  patient: Patient
  initialDocuments: Document[]
  initialBriefings: Briefing[]
}

export default function PatientDetailClient({ patient, initialDocuments, initialBriefings }: Props) {
  const isDemo = patient.id.startsWith('demo-')
  const supabase = createClient()
  const isGuest = !supabase || isDemo

  const [documents, setDocuments] = useState<Document[]>(isDemo ? DEMO_DOCUMENTS : initialDocuments)
  const [briefings, setBriefings] = useState<Briefing[]>(isDemo ? [DEMO_BRIEFING] : initialBriefings)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(
    isDemo ? DEMO_BRIEFING.id : (initialBriefings[0]?.id ?? null)
  )
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [audience, setAudience] = useState<'specialist' | 'gp' | 'family' | 'general' | 'er_visit' | 'second_opinion'>('specialist')

  const activeBriefing = briefings.find(b => b.id === activeBriefingId) ?? briefings[0] ?? null

  // ─── Realtime subscriptions (real patients only) ───────────────────────────
  useEffect(() => {
    if (isDemo) return
    const channel = supabase!.channel('patient-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `patient_id=eq.${patient.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setDocuments(prev => [payload.new as Document, ...prev])
        else if (payload.eventType === 'UPDATE') setDocuments(prev => prev.map(d => d.id === payload.new.id ? payload.new as Document : d))
        else if (payload.eventType === 'DELETE') setDocuments(prev => prev.filter(d => d.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings', filter: `patient_id=eq.${patient.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') { setBriefings(prev => [payload.new as Briefing, ...prev]); setActiveBriefingId(payload.new.id) }
        else if (payload.eventType === 'UPDATE') setBriefings(prev => prev.map(b => b.id === payload.new.id ? payload.new as Briefing : b))
        else if (payload.eventType === 'DELETE') setBriefings(prev => prev.filter(b => b.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase!.removeChannel(channel) }
  }, [patient.id, supabase, isDemo])

  // ─── Upload handler (real patients only — our full functional pipeline) ────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) { alert('Sign in to upload documents.'); return }
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be under 10MB.')
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${patient.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase!.storage.from('medical_records').upload(fileName, file)
    if (uploadError) {
      alert('Failed to upload file: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { user } } = await supabase!.auth.getUser()
    const { data: caregiver } = await supabase!.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) {
      alert('Caregiver profile not found')
      setUploading(false)
      return
    }

    const { data: docData, error: dbError } = await supabase!.from('documents').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      filename: file.name,
      storage_path: fileName,
      file_size: file.size,
      mime_type: file.type,
      status: 'uploaded'
    }).select().single()

    if (dbError || !docData?.id) {
      alert('Failed to save document metadata: ' + (dbError?.message || 'No document ID returned'))
      setUploading(false)
      return
    }

    const documentId = docData.id
    if (!documentId || typeof documentId !== 'string') {
      alert('Invalid document ID generated')
      setUploading(false)
      return
    }

    await supabase!.from('jobs').insert({
      job_type: 'process_document',
      payload: { document_id: documentId, caregiver_id: caregiver.id },
      status: 'queued'
    })

    setUploading(false)
    e.target.value = ''
  }

  // ─── Briefing generation (real patients only — our full functional pipeline)

  const generateBriefing = async () => {
    if (isGuest) { alert('Sign in to generate briefings.'); return }
    setGenerating(true)
    const { data: { user } } = await supabase!.auth.getUser()
    const { data: caregiver } = await supabase!.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) {
      alert('Caregiver profile not found')
      setGenerating(false)
      return
    }

    const { data: briefingData, error: briefingError } = await supabase!.from('briefings').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      audience: audience,
      status: 'queued',
      source_doc_ids: documents.map(d => d.id)
    }).select().single()

    if (briefingError || !briefingData?.id) {
      alert('Failed to start briefing: ' + (briefingError?.message || 'No briefing ID returned'))
      setGenerating(false)
      return
    }

    const briefingId = briefingData.id
    if (!briefingId || typeof briefingId !== 'string') {
      alert('Invalid briefing ID generated')
      setGenerating(false)
      return
    }

    await supabase!.from('jobs').insert({
      job_type: 'generate_briefing',
      payload: { briefing_id: briefingId, caregiver_id: caregiver.id },
      status: 'queued'
    })

    setGenerating(false)
  }

  const retryBriefing = async (briefingId: string) => {
    if (isGuest) return
    setGenerating(true)
    const { data: { user } } = await supabase!.auth.getUser()
    const { data: caregiver } = await supabase!.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) {
      alert('Caregiver profile not found')
      setGenerating(false)
      return
    }

    await supabase!.from('briefings').update({ status: 'queued', error_message: null }).eq('id', briefingId)

    await supabase!.from('jobs').insert({
      job_type: 'generate_briefing',
      payload: { briefing_id: briefingId, caregiver_id: caregiver.id },
      status: 'queued'
    })

    setGenerating(false)
  }

  const handleDocClick = async (e: React.MouseEvent, docId: string, page?: number) => {
    e.preventDefault()
    if (isDemo) return
    if (!supabase) { alert('Sign in to view documents.'); return }
    const doc = documents.find(d => d.id === docId)
    if (!doc?.storage_path) { alert('Document path not available.'); return }
    const { data, error } = await supabase.storage.from('medical_records').createSignedUrl(doc.storage_path, 60)
    if (error || !data?.signedUrl) { alert('Could not open document.'); return }
    const url = page ? `${data.signedUrl}#page=${page}` : data.signedUrl
    window.open(url, '_blank')
  }

  // ─── Derived data ─────────────────────────────────────────────────────────

  const concerns: FlaggedConcern[] = (activeBriefing?.flagged_concerns as FlaggedConcern[] | null) ?? []
  const claimsArray: Claim[] = (activeBriefing?.claims as Claim[] | null) ?? []

  const supportedCount = claimsArray.filter(c => c.flag === 'SUPPORTED' || c.verification_status === 'supported').length
  const partialCount = claimsArray.filter(c => c.flag === 'PARTIALLY SUPPORTED' || c.verification_status === 'partial').length
  const unsupportedCount = claimsArray.filter(c => c.flag === 'UNSUPPORTED' || c.verification_status === 'unsupported').length

  const age = Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top nav ── */}
      <header className="shrink-0 border-b border-border bg-surface flex items-center px-5 py-3 gap-4">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9.5 6H2.5M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-mono text-[10px]">Dashboard</span>
        </Link>
        <span className="text-border">/</span>
        <span className="font-mono text-[10px] text-foreground">{patient.name}</span>
        {concerns.length > 0 && (
          <div className="flex items-center gap-1.5 bg-alert-dim border border-alert/30 rounded px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-alert" />
            <span className="font-mono text-[10px] text-alert">{concerns.length} flag{concerns.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDemo && (
            <span className="font-mono text-[9px] border border-border text-muted-foreground px-2 py-1 rounded">DEMO RECORD</span>
          )}
          {isGuest && (
            <Link href="/signup" className="font-mono text-[10px] bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity">
              Create account to save
            </Link>
          )}
        </div>
      </header>

      {/* ── Flagged concerns band ── */}
      {concerns.length > 0 && (
        <div className="shrink-0 border-b border-alert/30 bg-alert-dim px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <span className="font-mono text-[9px] text-alert border border-alert/40 px-1.5 py-0.5 rounded tracking-widest">FLAGGED — RAISE WITH DOCTOR</span>
            </div>
            <div className="flex-1 space-y-1">
              {concerns.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                    c.severity === 'high' ? 'text-alert border-alert/40 bg-background/20' :
                    c.severity === 'medium' ? 'text-warning border-warning/40' : 'text-muted-foreground border-border'
                  }`}>{c.severity.toUpperCase()}</span>
                  <p className="text-[12px] text-foreground leading-relaxed">{c.concern || c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left pane — patient info + documents */}
        <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden">

          {/* Patient info */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent/20 flex items-center justify-center shrink-0 font-mono text-[14px] font-bold text-accent">
                {patient.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-[14px] font-semibold text-foreground leading-tight">{patient.name}</h1>
                <p className="font-mono text-[10px] text-muted-foreground">{patient.relationship} · {age}y · DOB {patient.date_of_birth}</p>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Documents</p>
              {!isGuest && (
                <label className="cursor-pointer">
                  <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  <span className="font-mono text-[10px] text-accent hover:text-foreground transition-colors">
                    {uploading ? 'Uploading…' : '+ Upload'}
                  </span>
                </label>
              )}
            </div>

            {documents.length === 0 ? (
              <div className="border border-dashed border-border rounded-md p-5 text-center">
                <p className="text-[11px] text-muted-foreground">No documents yet.</p>
                {!isGuest && (
                  <label className="cursor-pointer mt-2 block">
                    <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileUpload} />
                    <span className="font-mono text-[10px] text-accent hover:underline">Upload first document</span>
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id}
                    className={`border border-border rounded-md px-3 py-2.5 bg-surface-raised ${doc.storage_path && !isDemo ? 'hover:border-accent/40 cursor-pointer transition-colors' : ''}`}
                    onClick={(e) => doc.storage_path && !isDemo ? handleDocClick(e as unknown as React.MouseEvent, doc.id) : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <svg width="12" height="14" viewBox="0 0 12 14" fill="none" className="text-muted-foreground shrink-0 mt-0.5">
                        <path d="M2 1h6l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1"/>
                        <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1"/>
                      </svg>
                      <div className="min-w-0">
                        <p className="text-[11px] text-foreground font-mono truncate">{doc.filename}</p>
                        <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                          {new Date(doc.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <PipelineBar status={doc.status} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Generate briefing — only for authenticated real patients */}
          {!isGuest ? (
            <div className="border-t border-border p-4 shrink-0">
              <div className="flex items-center gap-2">
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as typeof audience)}
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground font-mono focus:outline-none focus:border-accent"
                >
                  <option value="specialist">Specialist</option>
                  <option value="gp">GP</option>
                  <option value="family">Family</option>
                  <option value="general">General</option>
                  <option value="er_visit">ER Visit</option>
                  <option value="second_opinion">2nd Opinion</option>
                </select>
                <button
                  onClick={generateBriefing}
                  disabled={generating || documents.length === 0}
                  className="flex-1 bg-accent text-background font-mono text-[11px] font-semibold py-1.5 px-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generating ? 'Generating…' : 'Generate briefing'}
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-border p-4 shrink-0">
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">Sign in to upload documents and generate briefings.</p>
              <Link href="/signup" className="flex items-center justify-center w-full bg-accent text-background font-mono text-[11px] font-semibold py-2 rounded hover:opacity-90 transition-opacity">
                Create free account
              </Link>
              <Link href="/login" className="flex items-center justify-center w-full border border-border text-muted-foreground font-mono text-[11px] py-2 rounded hover:border-accent hover:text-foreground transition-colors mt-2">
                Sign in
              </Link>
            </div>
          )}
        </aside>

        {/* Right pane — briefing */}
        <main className="flex-1 overflow-y-auto">

          {/* Briefing selector */}
          {briefings.length > 1 && (
            <div className="border-b border-border px-6 py-2 flex items-center gap-2 overflow-x-auto">
              {briefings.map(b => (
                <button
                  key={b.id}
                  onClick={() => setActiveBriefingId(b.id)}
                  className={`font-mono text-[10px] px-3 py-1.5 rounded border whitespace-nowrap transition-colors ${
                    b.id === activeBriefingId
                      ? 'bg-accent-dim border-accent/40 text-accent'
                      : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                  }`}
                >
                  {b.audience?.toUpperCase()} · {new Date(b.created_at).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}

          {activeBriefing ? (
            <div className="px-8 py-6 max-w-3xl">

              {/* Briefing header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-[16px] font-semibold text-foreground">
                    {activeBriefing.audience
                      ? activeBriefing.audience.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                      : 'Briefing'}
                  </h2>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">
                    Generated {new Date(activeBriefing.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeBriefing.status === 'failed' && !isGuest && (
                    <button
                      onClick={() => retryBriefing(activeBriefing.id)}
                      disabled={generating}
                      className="font-mono text-[10px] border border-alert/40 text-alert px-3 py-1.5 rounded hover:bg-alert-dim transition-colors disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                  <span className={`font-mono text-[9px] px-2 py-1 rounded border ${
                    activeBriefing.status === 'complete'
                      ? 'text-success border-success/30 bg-success-dim' :
                    activeBriefing.status === 'processing' || activeBriefing.status === 'queued'
                      ? 'text-accent border-accent/30 bg-accent-dim' :
                    activeBriefing.status === 'failed'
                      ? 'text-alert border-alert/30 bg-alert-dim' :
                    'text-muted-foreground border-border'
                  }`}>
                    {activeBriefing.status?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* PaperTrail verification strip */}
              {claimsArray.length > 0 && (
                <div className="border border-border rounded-md bg-surface-raised px-4 py-3 mb-6 flex items-center gap-6">
                  <div>
                    <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-0.5">PaperTrail</p>
                    <p className="font-mono text-[9px] text-muted-foreground">Every claim traced to source</p>
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    {supportedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="font-mono text-[10px] text-muted-foreground">{supportedCount} supported</span>
                      </div>
                    )}
                    {partialCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-warning" />
                        <span className="font-mono text-[10px] text-muted-foreground">{partialCount} partial</span>
                      </div>
                    )}
                    {unsupportedCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-alert" />
                        <span className="font-mono text-[10px] text-muted-foreground">{unsupportedCount} unsupported</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Processing state */}
              {(activeBriefing.status === 'processing' || activeBriefing.status === 'queued') && (
                <div className="border border-accent/20 bg-accent-dim rounded-md px-5 py-8 text-center mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.2s'}} />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.4s'}} />
                  </div>
                  <p className="font-mono text-[11px] text-accent">Analysing documents and building briefing…</p>
                  <p className="text-[11px] text-muted-foreground mt-1">This takes 30–90 seconds. Results appear automatically.</p>
                </div>
              )}

              {/* Briefing body */}
              {activeBriefing.briefing_text && (
                <div className="space-y-0">
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => (
                        <h2 className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mt-8 mb-3 pb-2 border-b border-border">
                          {children}
                        </h2>
                      ),
                      p: ({ children }) => {
                        const text = String(children ?? '')
                        const matched = claimsArray.filter(c => c.claim_text && text.includes(c.claim_text))
                        return (
                          <p className="text-[13px] text-foreground leading-relaxed mb-4">
                            {children}
                            {matched.map((c, i) => (
                              <CitationChip key={i} claim={c} onDocClick={handleDocClick} />
                            ))}
                          </p>
                        )
                      },
                      li: ({ children }) => {
                        const text = String(children ?? '')
                        const matched = claimsArray.filter(c => c.claim_text && text.includes(c.claim_text))
                        return (
                          <li className="flex items-baseline gap-2 text-[13px] text-foreground mb-2">
                            <span className="w-1 h-1 rounded-full bg-muted-foreground mt-2 shrink-0" />
                            <span>
                              {children}
                              {matched.map((c, i) => (
                                <CitationChip key={i} claim={c} onDocClick={handleDocClick} />
                              ))}
                            </span>
                          </li>
                        )
                      },
                      ul: ({ children }) => <ul className="list-none pl-0 my-3 space-y-0">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1 text-[13px] text-foreground">{children}</ol>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      code: ({ children }) => (
                        <code className="font-mono text-[11px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-accent">{children}</code>
                      ),
                    }}
                  >
                    {activeBriefing.briefing_text}
                  </ReactMarkdown>
                </div>
              )}

              {/* Failed state */}
              {activeBriefing.status === 'failed' && !activeBriefing.briefing_text && (
                <div className="border border-alert/30 bg-alert-dim rounded-md px-5 py-6 text-center">
                  <p className="text-[13px] text-alert mb-3">Briefing generation failed.</p>
                  {!isGuest && (
                    <button
                      onClick={() => retryBriefing(activeBriefing.id)}
                      disabled={generating}
                      className="font-mono text-[11px] border border-alert/40 text-alert px-4 py-2 rounded hover:bg-alert/10 transition-colors disabled:opacity-50"
                    >
                      {generating ? 'Retrying…' : 'Retry'}
                    </button>
                  )}
                </div>
              )}

              {/* Demo disclaimer */}
              {isDemo && (
                <div className="border-t border-border mt-8 pt-6">
                  <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">This is a demo briefing</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">
                    Real briefings are generated from your uploaded documents. Every claim above would link to an exact source quote, page number, and date.{' '}
                    <Link href="/signup" className="text-accent hover:underline">Create an account</Link> to get started.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-8 py-16">
              <div className="text-center max-w-sm">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-3">No briefing yet</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  Upload at least one document, then generate a briefing.
                </p>
                {!isGuest && documents.length > 0 && (
                  <button
                    onClick={generateBriefing}
                    disabled={generating}
                    className="bg-accent text-background font-mono text-[11px] font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {generating ? 'Generating…' : 'Generate briefing'}
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

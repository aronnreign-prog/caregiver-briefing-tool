'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'
import Link from 'next/link'

type Document = {
  id: string
  filename: string
  status: string
  uploaded_at: string
  storage_path?: string
}

type Briefing = {
  id: string
  audience: string
  status: string
  created_at: string
  completed_at: string | null
  briefing_text: string | null
  claims: any[] | null
  flagged_concerns: any[] | null
}

const DOC_PIPELINE = ['uploaded', 'processing', 'extracted'] as const

function PipelineSteps({ status }: { status: string }) {
  const steps = [
    { key: 'uploaded',   label: 'Uploaded' },
    { key: 'processing', label: 'Extracting' },
    { key: 'extracted',  label: 'Ready' },
  ]
  const currentIdx = steps.findIndex(s => s.key === status)
  const isFailed = status === 'failed'

  return (
    <div className="flex items-center gap-1 mt-1">
      {steps.map((step, i) => {
        const done  = !isFailed && i <= currentIdx
        const active = !isFailed && i === currentIdx
        return (
          <div key={step.key} className="flex items-center gap-1">
            <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
              isFailed    ? 'bg-alert' :
              done && active ? 'bg-accent' :
              done        ? 'bg-success' :
                            'bg-border'
            }`} />
            <span className={`font-mono text-[9px] ${
              done ? 'text-muted-foreground' : 'text-border'
            }`}>{step.label}</span>
            {i < steps.length - 1 && <span className="text-border text-[9px]">/</span>}
          </div>
        )
      })}
      {isFailed && <span className="font-mono text-[9px] text-alert">FAILED</span>}
    </div>
  )
}

function CitationChip({ claim, onDocClick }: { claim: any; onDocClick: (e: React.MouseEvent, id: string, page?: number) => void }) {
  if (!claim.evidence) return null

  if (claim.flag === 'MEDICAL_KNOWLEDGE') {
    const url = `https://mobius.nlm.nih.gov/RxNav/search?searchBy=String&searchTerm=${encodeURIComponent(claim.claim_text)}`
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-sm font-mono text-[10px] border border-warning/40 bg-warning-dim text-warning-foreground hover:border-warning/70 transition-colors"
        title={claim.evidence.entry_text || 'View on NIH RxNav'}
      >
        DDInter
      </a>
    )
  }

  const shortName = claim.evidence.source_doc_id
    ? (claim.evidence.source_doc_name || claim.evidence.source_doc_id).replace(/\.pdf$/i, '').slice(0, 18)
    : 'src'

  return (
    <a
      href="#"
      onClick={(e) => onDocClick(e, claim.evidence.source_doc_id, claim.evidence.source_page)}
      className="inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded-sm font-mono text-[10px] border border-accent/30 bg-accent-dim text-accent hover:border-accent/60 transition-colors"
      title={claim.evidence.source_quote}
    >
      {shortName}{claim.evidence.source_page ? ` p.${claim.evidence.source_page}` : ''}
    </a>
  )
}

const DEMO_BRIEFING = {
  id: 'demo-b1',
  audience: 'specialist',
  status: 'complete',
  created_at: new Date().toISOString(),
  completed_at: new Date().toISOString(),
  flagged_concerns: [
    { severity: 'high', concern: 'ACE inhibitor (Lisinopril) prescribed despite 18-month declining GFR trend — contraindicated in declining kidney function.' },
  ],
  claims: [
    { claim_text: 'GFR declining for 18 months', flag: 'SUPPORTED', evidence: { source_doc_id: 'demo-doc-1', source_doc_name: 'Lab Result Mar 2024', source_page: 2, source_quote: 'GFR 47 mL/min/1.73m²' } },
    { claim_text: 'ACE inhibitor contraindicated', flag: 'MEDICAL_KNOWLEDGE', evidence: { entry_text: 'Lisinopril — renal dose adjustment required' } },
  ],
  briefing_text: `**Patient Summary**

Your mother's GFR has been declining for 18 months across 6 lab draws from 3 different providers (65 → 58 → 51 → 47).

Her new cardiologist prescribed Lisinopril yesterday — an ACE inhibitor that is contraindicated in declining kidney function.

**Current Medications**

- Lisinopril 10 mg daily (NEW — prescribed 2024-03-14)
- Atorvastatin 40 mg nightly
- Metoprolol succinate 25 mg daily

**Lab Trends**

GFR: 65 (Jun 2022) → 58 (Dec 2022) → 51 (Jun 2023) → 47 (Dec 2023)

**Recommendation**

Flag the Lisinopril prescription for the cardiologist before the appointment. Request a nephrology consult given the trend.`,
}

export default function PatientDetailClient({
  patient,
  initialDocuments,
  initialBriefings,
}: {
  patient: any
  initialDocuments: Document[]
  initialBriefings: Briefing[]
}) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [briefings, setBriefings] = useState<Briefing[]>(initialBriefings)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [audience, setAudience] = useState('specialist')
  const [selectedBriefingId, setSelectedBriefingId] = useState<string | null>(null)

  const supabase = createClient()
  const isGuest = !supabase
  const isDemo = patient.id?.startsWith('demo-')

  // Use demo briefing for demo patients
  const effectiveBriefings: Briefing[] = isDemo ? [DEMO_BRIEFING as Briefing] : briefings
  const activeBriefing = effectiveBriefings.find(b => b.id === selectedBriefingId) ?? effectiveBriefings[0] ?? null
  const totalFlagged = effectiveBriefings.reduce((n, b) => n + (b.flagged_concerns?.length ?? 0), 0)

  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `patient_id=eq.${patient.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setDocuments(p => [payload.new as Document, ...p])
        else if (payload.eventType === 'UPDATE') setDocuments(p => p.map(d => d.id === payload.new.id ? payload.new as Document : d))
        else if (payload.eventType === 'DELETE') setDocuments(p => p.filter(d => d.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings', filter: `patient_id=eq.${patient.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') setBriefings(p => [payload.new as Briefing, ...p])
        else if (payload.eventType === 'UPDATE') setBriefings(p => p.map(b => b.id === payload.new.id ? payload.new as Briefing : b))
        else if (payload.eventType === 'DELETE') setBriefings(p => p.filter(b => b.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [patient.id, supabase])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!supabase) { alert('Sign in to upload documents.'); return }
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { alert('Only PDF files are allowed.'); return }
    if (file.size > 10 * 1024 * 1024) { alert('File size must be under 10MB.'); return }
    setUploading(true)
    const fileName = `${patient.id}/${Date.now()}.${file.name.split('.').pop()}`
    const { error: uploadError } = await supabase.storage.from('medical_records').upload(fileName, file)
    if (uploadError) { alert('Upload failed: ' + uploadError.message); setUploading(false); return }
    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) { alert('Caregiver profile not found'); setUploading(false); return }
    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      patient_id: patient.id, caregiver_id: caregiver.id, filename: file.name,
      storage_path: fileName, file_size: file.size, mime_type: file.type, status: 'uploaded'
    }).select().single()
    if (dbError || !docData?.id) { alert('Failed to save document: ' + (dbError?.message || 'Unknown')); setUploading(false); return }
    await supabase.from('jobs').insert({ job_type: 'process_document', payload: { document_id: docData.id, caregiver_id: caregiver.id }, status: 'queued' })
    setUploading(false)
    e.target.value = ''
  }

  const generateBriefing = async () => {
    if (!supabase) { alert('Sign in to generate briefings.'); return }
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) { alert('Caregiver profile not found'); setGenerating(false); return }
    const { data: bd, error: be } = await supabase.from('briefings').insert({
      patient_id: patient.id, caregiver_id: caregiver.id, audience,
      status: 'queued', source_doc_ids: documents.map(d => d.id)
    }).select().single()
    if (be || !bd?.id) { alert('Failed to start: ' + (be?.message || 'Unknown')); setGenerating(false); return }
    await supabase.from('jobs').insert({ job_type: 'generate_briefing', payload: { briefing_id: bd.id, caregiver_id: caregiver.id }, status: 'queued' })
    setGenerating(false)
  }

  const retryBriefing = async (briefingId: string) => {
    if (!supabase) { alert('Sign in to use this feature.'); return }
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) { alert('Caregiver profile not found'); setGenerating(false); return }
    await supabase.from('briefings').update({ status: 'queued', error_message: null }).eq('id', briefingId)
    await supabase.from('jobs').insert({ job_type: 'generate_briefing', payload: { briefing_id: briefingId, caregiver_id: caregiver.id }, status: 'queued' })
    setGenerating(false)
  }

  const handleDocClick = async (e: React.MouseEvent, docId: string, page?: number) => {
    e.preventDefault()
    if (!supabase) { alert('Sign in to view documents.'); return }
    const doc = documents.find(d => d.id === docId)
    if (!doc?.storage_path) { alert('Document not found'); return }
    const { data, error } = await supabase.storage.from('medical_records').createSignedUrl(doc.storage_path, 60)
    if (error || !data) { alert('Failed to open: ' + (error?.message || 'Unknown')); return }
    window.open(page ? `${data.signedUrl}#page=${page}` : data.signedUrl, '_blank')
  }

  const statusDot = (status: string) => {
    if (status === 'extracted' || status === 'complete') return 'bg-success'
    if (status === 'failed') return 'bg-alert'
    if (status === 'processing') return 'bg-accent animate-pulse'
    return 'bg-warning'
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Nav */}
      <header className="border-b border-border bg-surface flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors tracking-widest uppercase">
            &larr; CareNote
          </Link>
          <span className="text-border">/</span>
          <span className="font-mono text-[10px] text-foreground">{patient.name}</span>
          {totalFlagged > 0 && (
            <span className="flex items-center gap-1 font-mono text-[10px] border border-alert/40 bg-alert-dim text-alert-foreground px-2 py-0.5 rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-alert inline-block" />
              {totalFlagged} FLAG{totalFlagged > 1 ? 'S' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(isGuest || isDemo) && (
            <Link href="/signup" className="font-mono text-[10px] bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity">
              Create account to save
            </Link>
          )}
        </div>
      </header>

      {/* Flagged concerns band — only show when there are flags */}
      {activeBriefing?.flagged_concerns && activeBriefing.flagged_concerns.length > 0 && (
        <div className="border-b border-alert/30 bg-alert-dim px-6 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5">
              <div className="w-2 h-2 rounded-full bg-alert" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[10px] text-alert tracking-widest uppercase mb-1.5">Flagged concerns — raise with doctor</p>
              <div className="flex flex-col gap-1">
                {activeBriefing.flagged_concerns.map((c, i) => (
                  <p key={i} className="text-xs text-alert-foreground leading-relaxed">
                    <span className="font-mono text-[9px] border border-alert/40 text-alert px-1 py-0.5 rounded-sm mr-2 uppercase">{c.severity}</span>
                    {c.concern}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main two-pane layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Documents */}
        <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col overflow-y-auto">
          <div className="px-4 pt-5 pb-3 border-b border-border">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-1">Patient</p>
            <p className="text-sm font-medium text-foreground">{patient.name}</p>
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {patient.relationship} &middot; DOB {patient.date_of_birth}
            </p>
          </div>

          {/* Upload zone */}
          <div className="px-4 py-4 border-b border-border">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Documents</p>
            {isGuest || isDemo ? (
              <div className="border border-dashed border-border rounded px-3 py-4 text-center">
                <p className="text-xs text-muted-foreground">
                  <Link href="/signup" className="text-accent hover:underline">Sign in</Link> to upload records
                </p>
              </div>
            ) : (
              <>
                <input type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} className="hidden" id="pdf-upload" />
                <label
                  htmlFor="pdf-upload"
                  className="flex items-center justify-center gap-2 w-full border border-dashed border-border rounded px-3 py-3 cursor-pointer hover:border-accent/50 hover:bg-surface-raised transition-colors"
                >
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {uploading ? 'Uploading...' : 'Upload PDF'}
                  </span>
                </label>
              </>
            )}
          </div>

          {/* Document list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {(isDemo ? [] : documents).length === 0 && !isDemo ? (
              <p className="text-xs text-muted-foreground text-center py-6">No documents yet.</p>
            ) : isDemo ? (
              // Demo documents
              [
                { id: 'd1', filename: 'Lab Result Mar 2024.pdf', status: 'extracted', uploaded_at: '2024-03-14T00:00:00Z' },
                { id: 'd2', filename: 'Cardiology Visit Notes.pdf', status: 'extracted', uploaded_at: '2024-03-13T00:00:00Z' },
                { id: 'd3', filename: 'Lab Result Sep 2023.pdf', status: 'extracted', uploaded_at: '2023-09-05T00:00:00Z' },
              ].map(doc => (
                <div key={doc.id} className="border border-border rounded bg-surface-raised px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-foreground truncate">{doc.filename}</p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${statusDot(doc.status)}`} />
                  </div>
                  <PipelineSteps status={doc.status} />
                </div>
              ))
            ) : (
              documents.map(doc => (
                <div key={doc.id} className="border border-border rounded bg-surface-raised px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[11px] text-foreground truncate">{doc.filename}</p>
                      <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${statusDot(doc.status)}`} />
                  </div>
                  <PipelineSteps status={doc.status} />
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Right — Briefing */}
        <main className="flex-1 overflow-y-auto">

          {/* Briefing toolbar */}
          <div className="border-b border-border bg-surface px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">Briefing</p>
              {/* Briefing tabs */}
              {effectiveBriefings.length > 1 && (
                <div className="flex items-center gap-1">
                  {effectiveBriefings.map((b, i) => (
                    <button
                      key={b.id}
                      onClick={() => setSelectedBriefingId(b.id)}
                      className={`font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors ${
                        (activeBriefing?.id === b.id)
                          ? 'border-accent/50 bg-accent-dim text-accent'
                          : 'border-border text-muted-foreground hover:border-border hover:text-foreground'
                      }`}
                    >
                      {b.audience.replace('_', ' ')} &middot; {new Date(b.created_at).toLocaleDateString()}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isGuest && !isDemo && (
              <div className="flex items-center gap-2">
                <select
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  disabled={generating}
                  className="font-mono text-[10px] bg-surface-raised border border-border text-foreground rounded px-2 py-1.5 focus:outline-none focus:border-accent"
                >
                  <option value="general">General overview</option>
                  <option value="er_visit">ER visit</option>
                  <option value="specialist">Specialist appointment</option>
                  <option value="second_opinion">Second opinion</option>
                </select>
                <button
                  onClick={generateBriefing}
                  disabled={generating || documents.length === 0}
                  className="font-mono text-[10px] bg-accent text-background px-4 py-1.5 rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  {generating ? 'Starting...' : 'Generate briefing'}
                </button>
              </div>
            )}
          </div>

          {/* Briefing content */}
          <div className="max-w-3xl mx-auto px-8 py-8">
            {!activeBriefing ? (
              <div className="border border-dashed border-border rounded p-12 text-center">
                <p className="text-sm text-muted-foreground">No briefings yet.</p>
                {!isGuest && !isDemo && (
                  <p className="text-xs text-muted-foreground mt-2">Upload documents and click &ldquo;Generate briefing&rdquo; to start.</p>
                )}
              </div>
            ) : (
              <div>
                {/* Briefing header */}
                <div className="flex items-baseline justify-between mb-6">
                  <div>
                    <h1 className="text-base font-medium text-foreground capitalize">
                      {activeBriefing.audience.replace('_', ' ')} briefing
                    </h1>
                    <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                      Generated {new Date(activeBriefing.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusDot(activeBriefing.status)}`} />
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{activeBriefing.status}</span>
                  </div>
                </div>

                {/* Processing state */}
                {(activeBriefing.status === 'queued' || activeBriefing.status === 'processing') && (
                  <div className="border border-border rounded px-6 py-12 flex flex-col items-center gap-3">
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                      ))}
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {activeBriefing.status === 'queued' ? 'Queued — waiting for processor...' : 'AI is reading documents and building knowledge graph...'}
                    </p>
                  </div>
                )}

                {/* Failed */}
                {activeBriefing.status === 'failed' && (
                  <div className="border border-alert/30 bg-alert-dim rounded px-4 py-4 flex items-center justify-between">
                    <p className="text-xs text-alert-foreground">Briefing generation failed.</p>
                    <button
                      onClick={() => retryBriefing(activeBriefing.id)}
                      disabled={generating}
                      className="font-mono text-[10px] border border-alert/40 text-alert px-3 py-1.5 rounded hover:bg-alert/10 disabled:opacity-50 transition-colors"
                    >
                      {generating ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                )}

                {/* Complete briefing */}
                {activeBriefing.status === 'complete' && activeBriefing.briefing_text && (
                  <div className="space-y-6">
                    {/* PaperTrail verification strip */}
                    {activeBriefing.claims && activeBriefing.claims.length > 0 && (
                      <div className="border border-border rounded px-4 py-3 flex items-center gap-4">
                        <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase shrink-0">PaperTrail</p>
                        <div className="flex items-center gap-3 flex-wrap">
                          {(() => {
                            const supported = activeBriefing.claims.filter(c => c.flag === 'SUPPORTED').length
                            const partial   = activeBriefing.claims.filter(c => c.flag === 'PARTIAL').length
                            const unsupported = activeBriefing.claims.filter(c => c.flag === 'UNSUPPORTED').length
                            return (
                              <>
                                {supported > 0 && <span className="font-mono text-[10px] text-success">{supported} supported</span>}
                                {partial   > 0 && <span className="font-mono text-[10px] text-warning">{partial} partial</span>}
                                {unsupported > 0 && <span className="font-mono text-[10px] text-alert">{unsupported} unsupported</span>}
                              </>
                            )
                          })()}
                        </div>
                        <p className="font-mono text-[9px] text-muted-foreground ml-auto">Every claim traced to source</p>
                      </div>
                    )}

                    {/* Briefing body */}
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-sm font-semibold text-foreground mt-6 mb-2">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider mt-5 mb-2 font-mono">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-xs font-medium text-muted-foreground-strong mt-4 mb-1">{children}</h3>,
                          p: ({ children }) => {
                            const text = Array.isArray(children) ? children.join('') : String(children)
                            const matched = (activeBriefing.claims || []).filter(c =>
                              text.includes(c.claim_text) || c.claim_text.includes(text)
                            )
                            return (
                              <p className="text-sm text-foreground leading-relaxed mb-3">
                                {children}
                                {matched.map((c, i) => (
                                  <CitationChip key={i} claim={c} onDocClick={handleDocClick} />
                                ))}
                              </p>
                            )
                          },
                          li: ({ children }) => {
                            const text = Array.isArray(children) ? children.join('') : String(children)
                            const matched = (activeBriefing.claims || []).filter(c =>
                              text.includes(c.claim_text) || c.claim_text.includes(text)
                            )
                            return (
                              <li className="text-sm text-foreground mb-1">
                                {children}
                                {matched.map((c, i) => (
                                  <CitationChip key={i} claim={c} onDocClick={handleDocClick} />
                                ))}
                              </li>
                            )
                          },
                          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                          ul: ({ children }) => <ul className="list-none space-y-1 my-3 pl-0">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-3 text-sm text-foreground">{children}</ol>,
                          code: ({ children }) => <code className="font-mono text-[11px] bg-surface-raised border border-border px-1.5 py-0.5 rounded-sm text-accent">{children}</code>,
                        }}
                      >
                        {activeBriefing.briefing_text}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {isDemo && (
                  <div className="mt-8 border-t border-border pt-6">
                    <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-2">This is a demo briefing</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Real briefings are generated from your uploaded documents. Every claim above would be linked to an exact source quote.{' '}
                      <Link href="/signup" className="text-accent hover:underline">Create an account</Link> to get started.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

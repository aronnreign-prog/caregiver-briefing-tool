'use client'

import { useState, useEffect } from 'react'
import type { Patient, Document, Briefing } from '@/types/database'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import PatientRealtime from './PatientRealtime'
import DocumentList from './DocumentList'
import { PipelineBar } from './PipelineBar'
import { generateBriefing, createBriefingRecord } from './pipeline-actions'

// Demo data
const DEMO_DOCUMENTS: Document[] = [
  { id: 'd1', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Mar 2024.pdf', status: 'extracted', uploaded_at: '2024-03-14T10:00:00Z' },
  { id: 'd2', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Cardiology Visit Notes.pdf', status: 'extracted', uploaded_at: '2024-03-11T14:30:00Z' },
  { id: 'd3', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Sep 2023.pdf', status: 'extracted', uploaded_at: '2023-09-05T09:15:00Z' },
]

const DEMO_BRIEFING: Briefing = {
  id: 'b1', patient_id: 'demo-1', caregiver_id: 'demo', audience: 'specialist', status: 'complete',
  source_doc_ids: ['d1', 'd2', 'd3'], created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  briefing_text: "## Patient Summary\n\nMargaret Thompson (DOB 1945-03-12) presents with a documented 18-month decline in renal function across 6 lab draws sourced from 3 different providers. GFR has fallen from 65 to 47 over this period.\n\nHer new cardiologist prescribed Lisinopril (10 mg daily) on 2024-03-14 - an ACE inhibitor that is contraindicated in the context of declining kidney function.\n\n## Current Medications\n\n- Lisinopril 10 mg daily - NEW, prescribed 2024-03-14\n- Atorvastatin 40 mg nightly - ongoing since 2022-06\n- Metoprolol succinate 25 mg daily - ongoing since 2021-11\n\n## Lab Trends\n\nGFR: `65` (Jun 2022) → `58` (Dec 2022) → `51` (Jun 2023) → `47` (Dec 2023) - consistent decline.\n\n## Recommendation\n\nFlag the Lisinopril prescription for review. Request nephrology consult.",
  claims: [
    { claim_id: 'c1', claim_text: 'GFR has fallen from 65 to 47', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd1', source_quote: 'eGFR 47 mL/min/1.73m2', source_page: 1 } },
    { claim_id: 'c2', claim_text: 'Lisinopril 10 mg daily', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd2', source_quote: 'Lisinopril 10mg QD', source_page: 2 } },
  ],
  flagged_concerns: [{ concern: 'ACE inhibitor prescribed despite declining GFR trend.', severity: 'high', related_claims: ['c1'] }],
}

type Claim = {
  claim_id?: string; claim_text: string; claim_type?: string; flag?: string;
  evidence?: { source_doc_id?: string; source_page?: number; source_quote?: string; entry_text?: string } | null;
}

type FlaggedConcern = { severity: 'high' | 'medium' | 'low'; description?: string; concern?: string }

function CitationChip({ claim, onDocClick }: { claim: Claim; onDocClick: (e: React.MouseEvent, id: string, page?: number) => void }) {
  const isDrug = claim.flag === 'MEDICAL_KNOWLEDGE'
  const docId = claim.evidence?.source_doc_id
  const page = claim.evidence?.source_page
  const label = isDrug ? (claim.claim_text?.slice(0, 14) || 'Med Knowledge') : `Doc · p.${page ?? '?'}`
  const title = claim.evidence?.source_quote || claim.evidence?.entry_text || ''
  return (
    <button onClick={(e) => !isDrug && docId ? onDocClick(e, docId, page ?? undefined) : undefined}
      className={`inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle transition-colors ${isDrug ? 'border-warning/40 text-warning bg-warning-dim cursor-default' : 'border-accent/40 text-accent bg-accent-dim hover:border-accent hover:bg-accent/10 cursor-pointer'}`}
      title={title}>{isDrug ? '⚠' : '↗'} {label}</button>
  )
}

interface Props { patient: Patient; initialDocuments: Document[]; initialBriefings: Briefing[] }

export default function PatientDetailClient({ patient, initialDocuments, initialBriefings }: Props) {
  const isDemo = patient.id.startsWith('demo-')
  const router = useRouter()
  const isGuest = isDemo

  const [documents, setDocuments] = useState<Document[]>(isDemo ? DEMO_DOCUMENTS : initialDocuments)
  const [briefings, setBriefings] = useState<Briefing[]>(isDemo ? [DEMO_BRIEFING] : initialBriefings)
  const [activeBriefingId, setActiveBriefingId] = useState<string | null>(isDemo ? DEMO_BRIEFING.id : (initialBriefings[0]?.id ?? null))
  const [generating, setGenerating] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [audience, setAudience] = useState<'specialist' | 'gp' | 'family' | 'general' | 'er_visit' | 'second_opinion'>('specialist')

  const activeBriefing = briefings.find(b => b.id === activeBriefingId) ?? briefings[0] ?? null

  PatientRealtime({})

  // Adaptive polling for in-progress documents
  useEffect(() => {
    if (isDemo) return
    const hasPendingDoc = documents.some(d => ['uploaded', 'processing', 'extracting'].includes(d.status))
    const hasPendingBriefing = briefings.some(b => b.status === 'queued' || b.status === 'processing')
    if (!hasPendingBriefing && !hasPendingDoc) return

    let interval = 3000
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      if (document.visibilityState === 'hidden') { timer = setTimeout(poll, interval * 2); return }
      try {
        const [docsRes, briefRes] = await Promise.all([
          fetch(`/api/patients/${patient.id}/documents`).then(r => r.json()),
          fetch(`/api/patients/${patient.id}/briefings`).then(r => r.json()),
        ])
        const updatedDocs = docsRes.documents
        const updatedBriefings = briefRes.briefings

        if (updatedDocs) setDocuments(updatedDocs as Document[])
        if (updatedBriefings) setBriefings(updatedBriefings as Briefing[])
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stillPending = ((updatedDocs || []) as any[]).some((d: any) => ['uploaded', 'processing', 'extracting'].includes(d.status)) ||
                             // eslint-disable-next-line @typescript-eslint/no-explicit-any
                             ((updatedBriefings || []) as any[]).some((b: any) => b.status === 'queued' || b.status === 'processing')
        interval = stillPending ? Math.min(interval * 1.5, 30000) : 3000
      } catch (err) {
        console.error('Polling error', err)
      }
      timer = setTimeout(poll, interval)
    }
    timer = setTimeout(poll, interval)
    return () => clearTimeout(timer)
  }, [patient.id, isDemo, briefings, documents])

  const handleGenerateBriefing = async () => {
    if (isGuest) { alert('Sign in to generate briefings.'); return }
    setGenerating(true)
    try {
      const result = await createBriefingRecord(patient.id, audience, documents.map(d => d.id))
      if (result.error || !result.id) throw new Error(result.error ?? 'No briefing ID')
      
      const newBriefing = {
        id: result.id,
        patient_id: patient.id,
        caregiver_id: patient.caregiver_id,
        audience,
        status: 'queued',
        source_doc_ids: documents.map(d => d.id),
        created_at: new Date().toISOString()
      }
      
      setBriefings(prev => [newBriefing as Briefing, ...prev])
      setActiveBriefingId(result.id)

      generateBriefing(patient.id, result.id, audience)
        .then(res => {
          if (res?.error) console.error('[Briefing] Failed:', res.error)
          router.refresh()
        })
        .catch(err => console.error('[Briefing] Unexpected error:', err))
    } catch (err: unknown) {
      alert('Failed to start briefing: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setGenerating(false)
    }
  }

  const handleDocClick = async (e: React.MouseEvent, docId: string, page?: number) => {
    e.preventDefault()
    if (isDemo) return
    const doc = documents.find(d => d.id === docId)
    if (!doc?.blob_url) { alert('Document not available.'); return }
    const url = page ? `${doc.blob_url}#page=${page}` : doc.blob_url
    window.open(url, '_blank')
  }

  const handleRemoveDocument = (id: string) => setDocuments(prev => prev.filter(d => d.id !== id))
  const handleAddDocument = (doc: Document) => setDocuments(prev => [doc, ...prev])

  const concerns: FlaggedConcern[] = (activeBriefing?.flagged_concerns as FlaggedConcern[] | null) ?? []
  const claimsArray: Claim[] = (activeBriefing?.claims as Claim[] | null) ?? []
  const supported = claimsArray.filter(c => c.flag === 'SUPPORTED').length
  const partial = claimsArray.filter(c => c.flag === 'PARTIALLY SUPPORTED').length
  const unsupported = claimsArray.filter(c => c.flag === 'UNSUPPORTED').length
  const age = Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (1000 * 60 * 60 * 24 * 365.25))

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden flex flex-col min-h-[600px]">
      <header className="shrink-0 border-b border-border bg-surface flex items-center px-5 py-3 gap-4">
        <Link href="/dashboard" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M9.5 6H2.5M5 3L2 6l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span className="font-mono text-[10px]">Dashboard</span>
        </Link>
        <span className="text-border">/</span>
        <span className="font-mono text-[10px] text-foreground font-semibold">{patient.name}</span>
        {concerns.length > 0 && (
          <div className="flex items-center gap-1.5 bg-alert-dim border border-alert/30 rounded px-2 py-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-alert" />
            <span className="font-mono text-[10px] text-alert">{concerns.length} flag{concerns.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {isDemo && <span className="font-mono text-[9px] border border-border text-muted-foreground px-2 py-1 rounded">DEMO RECORD</span>}
          {(isGuest || isDemo) && (
            <Link href="/signup" className="font-mono text-[10px] bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity font-semibold">Create account to save</Link>
          )}
        </div>
      </header>

      {concerns.length > 0 && (
        <div className="shrink-0 border-b border-alert/30 bg-alert-dim px-5 py-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 mt-0.5"><span className="font-mono text-[9px] text-alert border border-alert/40 px-1.5 py-0.5 rounded tracking-widest">FLAGGED — RAISE WITH DOCTOR</span></div>
            <div className="flex-1 space-y-1">
              {concerns.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${c.severity === 'high' ? 'text-alert border-alert/40 bg-background/20' : c.severity === 'medium' ? 'text-warning border-warning/40' : 'text-muted-foreground border-border'}`}>{c.severity.toUpperCase()}</span>
                  <p className="text-[12px] text-foreground leading-relaxed">{c.description || c.concern}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden">
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

          <DocumentList
            patientId={patient.id} documents={documents} isDemo={isDemo} isGuest={isGuest}
            uploading={uploadingFile}
            onUploadStart={setUploadingFile}
            onDocumentAdded={handleAddDocument}
            onDocumentRemoved={handleRemoveDocument}
            onDocClick={handleDocClick}
          />

          {!isDemo && !isGuest && (
            <div className="border-t border-border p-4 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <select value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}
                  className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground font-mono focus:outline-none focus:border-accent">
                  <option value="specialist">Specialist</option><option value="gp">GP</option><option value="family">Family</option>
                  <option value="general">General</option><option value="er_visit">ER Visit</option><option value="second_opinion">2nd Opinion</option>
                </select>
                <button onClick={handleGenerateBriefing} disabled={generating || documents.length === 0}
                  className="flex-1 bg-accent text-background font-mono text-[11px] font-semibold py-1.5 px-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                  {generating ? 'Starting...' : 'Generate briefing'}
                </button>
              </div>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto">
          {briefings.length > 1 && (
            <div className="border-b border-border px-6 py-2 flex items-center gap-2 overflow-x-auto">
              {briefings.map(b => (
                <button key={b.id} onClick={() => setActiveBriefingId(b.id)}
                  className={`font-mono text-[10px] px-3 py-1.5 rounded border whitespace-nowrap transition-colors ${b.id === activeBriefingId ? 'bg-accent-dim border-accent/40 text-accent' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>
                  {b.audience?.toUpperCase()} · {new Date(b.created_at).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}

          {activeBriefing ? (
            <div className="px-8 py-6 max-w-3xl">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-[16px] font-semibold text-foreground">
                    {activeBriefing.audience ? activeBriefing.audience.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : 'Briefing'} Briefing
                  </h2>
                  <p className="font-mono text-[10px] text-muted-foreground mt-1">Generated {new Date(activeBriefing.created_at).toLocaleString()}</p>
                </div>
                <span className={`font-mono text-[9px] px-2 py-1 rounded border ${
                  activeBriefing.status === 'complete' ? 'text-success border-success/30 bg-success-dim' :
                  activeBriefing.status === 'processing' || activeBriefing.status === 'queued' ? 'text-accent border-accent/30 bg-accent-dim' :
                  activeBriefing.status === 'failed' ? 'text-alert border-alert/30 bg-alert-dim' : 'text-muted-foreground border-border'}`}>
                  {activeBriefing.status?.toUpperCase()}
                </span>
              </div>

              {claimsArray.length > 0 && (
                <div className="border border-border rounded-md bg-surface-raised px-4 py-3 mb-6 flex items-center gap-6">
                  <div>
                    <p className="font-mono text-[10px] text-accent tracking-widest uppercase mb-0.5">PaperTrail</p>
                    <p className="font-mono text-[9px] text-muted-foreground">Every claim traced to source</p>
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    {supported > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-success" /><span className="font-mono text-[10px] text-muted-foreground">{supported} supported</span></div>}
                    {partial > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-warning" /><span className="font-mono text-[10px] text-muted-foreground">{partial} partial</span></div>}
                    {unsupported > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-alert" /><span className="font-mono text-[10px] text-muted-foreground">{unsupported} unsupported</span></div>}
                  </div>
                </div>
              )}

              {(activeBriefing.status === 'processing' || activeBriefing.status === 'queued') && (
                <div className="border border-accent/20 bg-accent-dim rounded-md px-5 py-8 text-center mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.2s'}} />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{animationDelay: '0.4s'}} />
                  </div>
                  <p className="font-mono text-[11px] text-accent">Analysing documents and building briefing...</p>
                  <p className="text-[11px] text-muted-foreground mt-1">This takes 30–90 seconds. Results appear automatically.</p>
                </div>
              )}

              {activeBriefing.status === 'failed' && activeBriefing.error_message && (
                <div className="border border-alert/30 bg-alert-dim rounded-md px-4 py-3 mb-6">
                  <p className="font-mono text-[10px] text-alert mb-1">BRIEFING FAILED</p>
                  <p className="text-[12px] text-foreground">{activeBriefing.error_message}</p>
                </div>
              )}

              {activeBriefing.briefing_text && (
                <div className="space-y-0">
                  <ReactMarkdown components={{
                    h2: ({ children }) => <h2 className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mt-8 mb-3 pb-2 border-b border-border">{children}</h2>,
                    p: ({ children }) => {
                      const text = String(children ?? '')
                      const matched = claimsArray.filter(c => c.claim_text && text.includes(c.claim_text))
                      return <p className="text-[13px] text-foreground leading-relaxed mb-4">{children}{matched.map((c, i) => <CitationChip key={i} claim={c} onDocClick={handleDocClick} />)}</p>
                    },
                    li: ({ children }) => {
                      const text = String(children ?? '')
                      const matched = claimsArray.filter(c => c.claim_text && text.includes(c.claim_text))
                      return <li className="flex items-baseline gap-2 text-[13px] text-foreground mb-2"><span className="w-1 h-1 rounded-full bg-muted-foreground mt-2 shrink-0" /><span>{children}{matched.map((c, i) => <CitationChip key={i} claim={c} onDocClick={handleDocClick} />)}</span></li>
                    },
                    ul: ({ children }) => <ul className="list-none pl-0 my-3 space-y-0">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1 text-[13px] text-foreground">{children}</ol>,
                    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                    code: ({ children }) => <code className="font-mono text-[11px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-accent">{children}</code>,
                  }}>{activeBriefing.briefing_text}</ReactMarkdown>
                </div>
              )}

              {isDemo && (
                <div className="border-t border-border mt-8 pt-6">
                  <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">This is a demo briefing</p>
                  <p className="text-[12px] text-muted-foreground leading-relaxed">Real briefings are generated from your uploaded documents. Every claim above would link to an exact source quote, page number, and date. <Link href="/signup" className="text-accent hover:underline">Create an account</Link> to get started.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-8 py-16">
              <div className="text-center max-w-sm">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-3">No briefing yet</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">Upload at least one document, then generate a briefing.</p>
                {!isGuest && documents.length > 0 && (
                  <button onClick={handleGenerateBriefing} disabled={generating} className="bg-accent text-background font-mono text-[11px] font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50">
                    {generating ? 'Starting...' : 'Generate briefing'}
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

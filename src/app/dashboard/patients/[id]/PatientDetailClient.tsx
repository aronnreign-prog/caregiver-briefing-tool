'use client'

import React, { useState, useEffect } from 'react'
import type { Patient, Document, Briefing } from '@/types/database'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import DocumentList from './DocumentList'
import { PipelineBar } from './PipelineBar'
import { generateBriefing, createBriefingRecord, askPatientClinicalQuery } from './pipeline-actions'

// Demo data
const DEMO_DOCUMENTS: Document[] = [
  { id: 'd1', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Mar 2024.pdf', document_type: 'Lab Result', document_date: '2024-03-14', status: 'extracted', uploaded_at: '2024-03-14T10:00:00Z' },
  { id: 'd2', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Cardiology Visit Notes.pdf', document_type: 'Clinic Note', document_date: '2024-03-11', status: 'extracted', uploaded_at: '2024-03-11T14:30:00Z' },
  { id: 'd3', patient_id: 'demo-1', caregiver_id: 'demo', filename: 'Lab Result Sep 2023.pdf', document_type: 'Lab Result', document_date: '2023-09-05', status: 'extracted', uploaded_at: '2023-09-05T09:15:00Z' },
]

const DEMO_BRIEFING: Briefing = {
  id: 'b1', patient_id: 'demo-1', caregiver_id: 'demo', audience: 'specialist', status: 'complete',
  source_doc_ids: ['d1', 'd2', 'd3'], created_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  briefing_text: "## Patient Summary\n\nMargaret Thompson (DOB 1945-03-12) presents with a documented 18-month decline in renal function across 6 lab draws sourced from 3 different providers. GFR has fallen from 65 to 47 over this period [claim:c1].\n\nHer new cardiologist prescribed Lisinopril (10 mg daily) on 2024-03-14 [claim:c2] - an ACE inhibitor that is contraindicated in the context of declining kidney function [claim:c3].\n\n## Current Medications\n\n- Lisinopril 10 mg daily - NEW, prescribed 2024-03-14 [claim:c2]\n- Atorvastatin 40 mg nightly - ongoing since 2022-06 [claim:c4]\n- Metoprolol succinate 25 mg daily - ongoing since 2021-11 [claim:c5]\n\n## Lab Trends\n\nGFR: `65` (Jun 2022) → `58` (Dec 2022) → `51` (Jun 2023) → `47` (Dec 2023) - consistent decline [claim:c1].\n\n## Recommendation\n\nFlag the Lisinopril prescription for review. Request nephrology consult [claim:c3].",
  claims: [
    { claim_id: 'c1', claim_text: 'GFR has fallen from 65 to 47', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd1', source_quote: 'eGFR 47 mL/min/1.73m2', source_page: 1 } },
    { claim_id: 'c2', claim_text: 'Lisinopril 10 mg daily', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd2', source_quote: 'Lisinopril 10mg QD', source_page: 2 } },
    { claim_id: 'c3', claim_text: 'ACE inhibitor contraindicated in declining kidney function', claim_type: 'medical_knowledge', flag: 'MEDICAL_KNOWLEDGE', evidence: { entry_text: 'ACE inhibitors reduce renal perfusion pressure and can exacerbate acute renal decline.' } },
    { claim_id: 'c4', claim_text: 'Atorvastatin 40 mg nightly ongoing', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd2', source_quote: 'Atorvastatin 40mg', source_page: 1 } },
    { claim_id: 'c5', claim_text: 'Metoprolol succinate 25 mg daily ongoing', claim_type: 'source_document', flag: 'SUPPORTED', evidence: { source_doc_id: 'd2', source_quote: 'Metoprolol succinate 25mg', source_page: 1 } },
  ],
  flagged_concerns: [{ concern: 'ACE inhibitor prescribed despite declining GFR trend.', severity: 'high', related_claims: ['c1', 'c2', 'c3'] }],
}

type EvidenceItem = {
  source_doc_id?: string
  source_page?: number
  source_quote?: string
  entry_text?: string
}

type Claim = {
  claim_id?: string
  claim_text: string
  claim_type?: string
  flag?: string
  evidence?: EvidenceItem | EvidenceItem[] | null
}

type FlaggedConcern = { severity: 'high' | 'medium' | 'low'; description?: string; concern?: string }

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.trim() === '' || dateStr.toLowerCase() === 'null') return 'Undated'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
  } catch {
    return dateStr
  }
}

function CitationChip({
  claim,
  onDocClick,
  documents = [],
}: {
  claim: Claim
  onDocClick: (e: React.MouseEvent, id: string, page?: number) => void
  documents?: Document[]
}) {
  const isDrug = claim.flag === 'MEDICAL_KNOWLEDGE' || claim.claim_type === 'medical_knowledge'
  const isConflicting = claim.flag === 'CONFLICTING'
  const isAbsence = claim.claim_type === 'notable_absence'

  if (isConflicting) {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle border-amber-500/50 text-amber-400 bg-amber-500/10 cursor-help"
        title={claim.claim_text || 'Conflicting findings across records'}
      >
        ⚡ Conflicting
      </span>
    )
  }

  if (isAbsence) {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle border-purple-500/50 text-purple-300 bg-purple-500/10 cursor-help"
        title={claim.claim_text || 'Notable absence in medical documentation'}
      >
        ∅ Not Documented
      </span>
    )
  }

  if (isDrug) {
    const title = (Array.isArray(claim.evidence) ? claim.evidence[0]?.entry_text : claim.evidence?.entry_text) || claim.claim_text || ''
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle border-warning/40 text-warning bg-warning-dim cursor-default"
        title={title}
      >
        ⚠ Medical Knowledge
      </span>
    )
  }

  const evidenceList: EvidenceItem[] = Array.isArray(claim.evidence)
    ? claim.evidence
    : (claim.evidence ? [claim.evidence] : [])

  if (evidenceList.length === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1.5 align-middle border-muted text-muted-foreground bg-muted/20 cursor-default"
        title={claim.claim_text}
      >
        ? Unverified
      </span>
    )
  }

  return (
    <>
      {evidenceList.map((ev, idx) => {
        const docId = ev.source_doc_id
        const page = ev.source_page
        const doc = docId ? documents.find((d) => d.id === docId) : undefined

        // If docId is missing/invalid or doc is not in patient documents, show honest unverified badge rather than broken dead button
        if (!docId || !doc) {
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1 align-middle border-muted text-muted-foreground bg-muted/20 cursor-default"
              title={ev.source_quote || ev.entry_text || claim.claim_text || 'Source record not found in documents'}
            >
              ? Unverified
            </span>
          )
        }

        const typeLabel = doc.document_type || 'Doc'
        const dateLabel = doc.document_date ? formatShortDate(doc.document_date) : 'Undated'
        const pageLabel = page && page > 1 ? ` · p.${page}` : ''
        const label = `${typeLabel} · ${dateLabel}${pageLabel}`
        const title = ev.source_quote || ev.entry_text || claim.claim_text || ''

        return (
          <button
            key={idx}
            onClick={(e) => onDocClick(e, docId, page ?? 1)}
            className="inline-flex items-center gap-1 font-mono text-[9px] border rounded px-1.5 py-0.5 ml-1 align-middle transition-colors border-accent/40 text-accent bg-accent-dim hover:border-accent hover:bg-accent/20 cursor-pointer"
            title={title}
          >
            ↗ {label}
          </button>
        )
      })}
    </>
  )
}

function renderContentWithClaims(
  node: React.ReactNode,
  claimsMap: Record<string, Claim>,
  onDocClick: (e: React.MouseEvent, id: string, page?: number) => void,
  documents: Document[] = []
): React.ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(/(\[claim:[^\]]+\])/g)
    if (parts.length === 1) return node
    return parts.map((part, i) => {
      const match = part.match(/^\[claim:([^\]]+)\]$/)
      if (match) {
        const rawContent = match[1]
        const idMatches = rawContent.match(/[a-zA-Z0-9_-]+/g) ?? []
        const validChips: React.ReactNode[] = []

        idMatches.forEach((rawId, subIdx) => {
          const claimId = rawId.replace(/^claim:/, '')
          const claim = claimsMap[claimId]
          if (claim) {
            validChips.push(
              <CitationChip key={`${i}-${subIdx}`} claim={claim} onDocClick={onDocClick} documents={documents} />
            )
          }
        })

        if (validChips.length > 0) {
          return <React.Fragment key={i}>{validChips}</React.Fragment>
        }
        return null
      }
      return part
    })
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => (
      <React.Fragment key={i}>
        {renderContentWithClaims(child, claimsMap, onDocClick, documents)}
      </React.Fragment>
    ))
  }

  if (React.isValidElement(node)) {
    const element = node as React.ReactElement<{ children?: React.ReactNode }>
    if (element.props && element.props.children) {
      return React.cloneElement(
        element,
        element.props,
        renderContentWithClaims(element.props.children, claimsMap, onDocClick, documents)
      )
    }
  }

  return node
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
  const [activeView, setActiveView] = useState<'briefing' | 'query'>('briefing')

  // On-demand clinical query state
  const [queryInput, setQueryInput] = useState('')
  const [queryRunning, setQueryRunning] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryHistory, setQueryHistory] = useState<Array<{
    id: string
    question: string
    answer: string
    claims: Claim[]
    timestamp: string
  }>>([])

  const activeBriefing = briefings.find(b => b.id === activeBriefingId) ?? briefings[0] ?? null

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
      const result = await createBriefingRecord(patient.id, 'specialist', documents.map(d => d.id))
      if (result.error || !result.id) throw new Error(result.error ?? 'No briefing ID')
      
      const newBriefing = {
        id: result.id,
        patient_id: patient.id,
        caregiver_id: patient.caregiver_id,
        audience: 'specialist',
        status: 'queued',
        source_doc_ids: documents.map(d => d.id),
        created_at: new Date().toISOString()
      }
      
      setBriefings(prev => [newBriefing as Briefing, ...prev])
      setActiveBriefingId(result.id)

      fetch(`/api/patients/${patient.id}/briefings/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefingId: result.id }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            console.error('[Briefing Stream] Failed:', data.error)
          }
        })
        .catch(err => console.error('[Briefing Stream] Error:', err))
    } catch (err: unknown) {
      alert('Failed to start briefing: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setGenerating(false)
    }
  }

  const handleRunQuery = async (customQuestion?: string) => {
    const q = (customQuestion || queryInput).trim()
    if (!q) return
    if (isGuest) {
      alert('Sign in to run on-demand record queries.')
      return
    }
    if (documents.length === 0) {
      alert('Please upload at least one document before asking questions.')
      return
    }

    setQueryRunning(true)
    setQueryError(null)

    if (isDemo) {
      setTimeout(() => {
        const demoClaims: Claim[] = [
          { claim_id: 'c1', claim_text: 'GFR has fallen from 65 to 47', claim_type: 'source_document', flag: 'SUPPORTED', evidence: [{ source_doc_id: 'd1', source_quote: 'eGFR 47 mL/min/1.73m2', source_page: 1 }] },
          { claim_id: 'c2', claim_text: 'Lisinopril 10 mg daily prescribed 2024-03-14', claim_type: 'source_document', flag: 'SUPPORTED', evidence: [{ source_doc_id: 'd2', source_quote: 'Lisinopril 10 mg PO daily', source_page: 1 }] },
        ]
        setQueryHistory(prev => [
          {
            id: 'demo-q-' + Date.now(),
            question: q,
            answer: `Based on Margaret's records, eGFR shows a documented decline from 65 down to 47 across lab tests [claim:c1]. Lisinopril 10 mg daily was prescribed on 2024-03-14 [claim:c2].`,
            claims: demoClaims,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
          ...prev,
        ])
        setQueryInput('')
        setQueryRunning(false)
      }, 700)
      return
    }

    try {
      const lastTurn = queryHistory[0]
        ? { question: queryHistory[0].question, answer: queryHistory[0].answer }
        : undefined

      const res = await askPatientClinicalQuery(patient.id, q, lastTurn)
      if (res.error || !res.answer) {
        setQueryError(res.error || 'Failed to retrieve answer from records.')
      } else {
        setQueryHistory(prev => [
          {
            id: 'q-' + Date.now(),
            question: q,
            answer: res.answer!,
            claims: (res.claims as Claim[]) || [],
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
          ...prev,
        ])
        setQueryInput('')
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Unknown query error')
    } finally {
      setQueryRunning(false)
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
  const handleDocumentStatusUpdate = (id: string, status: Document['status']) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, status, error_message: null } : d))
  }

  const concerns: FlaggedConcern[] = (activeBriefing?.flagged_concerns as FlaggedConcern[] | null) ?? []
  const claimsArray: Claim[] = (activeBriefing?.claims as Claim[] | null) ?? []
  const supported = claimsArray.filter(c => c.flag === 'SUPPORTED').length
  const partial = claimsArray.filter(c => c.flag === 'PARTIALLY SUPPORTED').length
  const unsupported = claimsArray.filter(c => c.flag === 'UNSUPPORTED').length
  const conflicting = claimsArray.filter(c => c.flag === 'CONFLICTING').length
  const absences = claimsArray.filter(c => c.claim_type === 'notable_absence').length
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
            onDocumentStatusUpdate={handleDocumentStatusUpdate}
            onDocClick={handleDocClick}
          />

          {!isDemo && !isGuest && (
            <div className="border-t border-border p-4 shrink-0">
              <button
                onClick={handleGenerateBriefing}
                disabled={generating || documents.length === 0}
                className="w-full bg-accent text-background font-mono text-[11px] font-semibold py-2 px-3 rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {generating ? 'Generating briefing...' : 'Generate Specialist Briefing'}
              </button>
            </div>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Mode Switcher Bar */}
          <div className="border-b border-border px-8 py-2.5 flex items-center justify-between bg-surface sticky top-0 z-10 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveView('briefing')}
                className={`font-mono text-[11px] px-3.5 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                  activeView === 'briefing'
                    ? 'bg-accent text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-raised border border-border'
                }`}
              >
                <span>📋</span> Specialist Briefing
              </button>
              <button
                onClick={() => setActiveView('query')}
                className={`font-mono text-[11px] px-3.5 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5 ${
                  activeView === 'query'
                    ? 'bg-accent text-background'
                    : 'text-muted-foreground hover:text-foreground hover:bg-surface-raised border border-border'
                }`}
              >
                <span>🔍</span> On-Demand Record Query
                {queryHistory.length > 0 && (
                  <span className="ml-1 text-[9px] bg-background/20 px-1.5 py-0.2 rounded-full">
                    {queryHistory.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {activeView === 'query' ? (
            <div className="px-8 py-6 max-w-3xl flex-1">
              <div className="mb-6">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold text-foreground">On-Demand Clinical Query</h2>
                  <span className="font-mono text-[9px] border border-accent/40 text-accent bg-accent-dim px-2 py-0.5 rounded">ZEP GRAPH MEMORY</span>
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">
                  Ask any specific clinical question across {patient.name}&apos;s documents. Facts and numbers are grounded in Zep graph memory with interactive PaperTrail citations.
                </p>
              </div>

              {/* Query Input Box */}
              <div className="border border-border rounded-lg bg-surface-raised p-4 mb-6 shadow-sm">
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    handleRunQuery()
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="relative">
                    <input
                      type="text"
                      value={queryInput}
                      onChange={(e) => setQueryInput(e.target.value)}
                      placeholder={`Ask a question (e.g., "What was the Olanzapine dosage change in 2025?", "List all kidney lab values")`}
                      disabled={queryRunning}
                      className="w-full bg-background border border-border rounded-md px-3.5 py-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[9px] text-muted-foreground uppercase mr-1">Quick Prompts:</span>
                      {[
                        'Medication changes & timeline',
                        'Lab trends & biomarkers',
                        'Any seizure or allergy history?',
                        'Discontinued treatments & rationale',
                      ].map((promptText, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            setQueryInput(promptText)
                            handleRunQuery(promptText)
                          }}
                          disabled={queryRunning}
                          className="font-mono text-[9px] border border-border bg-surface px-2 py-1 rounded text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors disabled:opacity-50"
                        >
                          {promptText}
                        </button>
                      ))}
                    </div>

                    <button
                      type="submit"
                      disabled={queryRunning || !queryInput.trim()}
                      className="bg-accent text-background font-mono text-[11px] font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ml-auto flex items-center gap-1.5"
                    >
                      {queryRunning ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-background animate-pulse" />
                          Searching records...
                        </>
                      ) : (
                        'Ask Records ↗'
                      )}
                    </button>
                  </div>
                </form>

                {queryError && (
                  <div className="mt-3 border border-alert/30 bg-alert-dim rounded px-3 py-2 text-[12px] text-alert">
                    {queryError}
                  </div>
                )}
              </div>

              {/* Query Running Progress */}
              {queryRunning && (
                <div className="border border-accent/20 bg-accent-dim rounded-md px-5 py-6 text-center mb-6">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
                  </div>
                  <p className="font-mono text-[11px] text-accent">Querying Zep graph memory & verifying citations...</p>
                </div>
              )}

              {/* Query History Answers */}
              {queryHistory.length > 0 ? (
                <div className="space-y-6">
                  {queryHistory.map((item) => {
                    const claimsMap = item.claims.reduce<Record<string, Claim>>((acc, c) => {
                      if (c.claim_id) acc[c.claim_id] = c
                      return acc
                    }, {})

                    return (
                      <div key={item.id} className="border border-border rounded-lg bg-surface overflow-hidden">
                        <div className="bg-surface-raised px-4 py-2.5 border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-accent font-bold">Q:</span>
                            <span className="text-[13px] font-semibold text-foreground">{item.question}</span>
                          </div>
                          <span className="font-mono text-[9px] text-muted-foreground">{item.timestamp}</span>
                        </div>
                        <div className="p-4 text-[13px] text-foreground leading-relaxed">
                          <ReactMarkdown
                            components={{
                              h2: ({ children }) => (
                                <h2 className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mt-4 mb-2 pb-1 border-b border-border">
                                  {renderContentWithClaims(children, claimsMap, handleDocClick, documents)}
                                </h2>
                              ),
                              p: ({ children }) => (
                                <p className="text-[13px] text-foreground leading-relaxed mb-3">
                                  {renderContentWithClaims(children, claimsMap, handleDocClick, documents)}
                                </p>
                              ),
                              li: ({ children }) => (
                                <li className="flex items-baseline gap-2 text-[13px] text-foreground mb-1.5">
                                  <span className="w-1 h-1 rounded-full bg-muted-foreground mt-2 shrink-0" />
                                  <span>{renderContentWithClaims(children, claimsMap, handleDocClick, documents)}</span>
                                </li>
                              ),
                              ul: ({ children }) => <ul className="list-none pl-0 my-2 space-y-0">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-[13px] text-foreground">{children}</ol>,
                              strong: ({ children }) => (
                                <strong className="font-semibold text-foreground">
                                  {renderContentWithClaims(children, claimsMap, handleDocClick, documents)}
                                </strong>
                              ),
                              code: ({ children }) => (
                                <code className="font-mono text-[11px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-accent">
                                  {children}
                                </code>
                              ),
                            }}
                          >
                            {item.answer}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : !queryRunning && (
                <div className="border border-dashed border-border rounded-lg p-8 text-center">
                  <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase mb-2">No queries asked yet</p>
                  <p className="text-[12px] text-muted-foreground max-w-sm mx-auto">
                    Type any clinical question above or select a quick prompt to query {patient.name}&apos;s verified timeline and documents.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1">
              {briefings.length > 1 && (
                <div className="border-b border-border px-6 py-2 flex items-center gap-2 overflow-x-auto">
                  {briefings.map(b => (
                    <button key={b.id} onClick={() => setActiveBriefingId(b.id)}
                      className={`font-mono text-[10px] px-3 py-1.5 rounded border whitespace-nowrap transition-colors ${b.id === activeBriefingId ? 'bg-accent-dim border-accent/40 text-accent' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>
                      {b.audience?.toUpperCase() === 'SPECIALIST' ? 'SPECIALIST' : (b.audience?.toUpperCase() || 'BRIEFING')} · {new Date(b.created_at).toLocaleDateString()}
                    </button>
                  ))}
                </div>
              )}

              {activeBriefing ? (
                <div className="px-8 py-6 max-w-3xl">
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <h2 className="text-[16px] font-semibold text-foreground">
                        Specialist Briefing
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
                      <div className="flex items-center gap-4 ml-auto flex-wrap justify-end">
                        {supported > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-success" /><span className="font-mono text-[10px] text-muted-foreground">{supported} supported</span></div>}
                        {conflicting > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-amber-400" /><span className="font-mono text-[10px] text-muted-foreground">{conflicting} conflicting</span></div>}
                        {absences > 0 && <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-purple-400" /><span className="font-mono text-[10px] text-muted-foreground">{absences} not documented</span></div>}
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
                      {(() => {
                        const claimsMap = claimsArray.reduce<Record<string, Claim>>((acc, c) => {
                          if (c.claim_id) acc[c.claim_id] = c
                          return acc
                        }, {})

                        return (
                          <ReactMarkdown components={{
                            h2: ({ children }) => <h2 className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mt-8 mb-3 pb-2 border-b border-border">{renderContentWithClaims(children, claimsMap, handleDocClick, documents)}</h2>,
                            p: ({ children }) => <p className="text-[13px] text-foreground leading-relaxed mb-4">{renderContentWithClaims(children, claimsMap, handleDocClick, documents)}</p>,
                            li: ({ children }) => (
                              <li className="flex items-baseline gap-2 text-[13px] text-foreground mb-2">
                                <span className="w-1 h-1 rounded-full bg-muted-foreground mt-2 shrink-0" />
                                <span>{renderContentWithClaims(children, claimsMap, handleDocClick, documents)}</span>
                              </li>
                            ),
                            ul: ({ children }) => <ul className="list-none pl-0 my-3 space-y-0">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5 my-3 space-y-1 text-[13px] text-foreground">{children}</ol>,
                            strong: ({ children }) => <strong className="font-semibold text-foreground">{renderContentWithClaims(children, claimsMap, handleDocClick, documents)}</strong>,
                            code: ({ children }) => <code className="font-mono text-[11px] bg-surface-raised border border-border px-1.5 py-0.5 rounded text-accent">{children}</code>,
                          }}>{activeBriefing.briefing_text}</ReactMarkdown>
                        )
                      })()}
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
                        {generating ? 'Starting...' : 'Generate Specialist Briefing'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

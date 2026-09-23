'use client'

import React, { useState } from 'react'
import type { Document } from '@/types/database'
import type { Claim, FlaggedConcern } from './types'
import { FlaggedBanner } from './flagged-banner'

const MARGARET_DOCUMENTS: Document[] = [
  {
    id: 'd1',
    patient_id: 'demo-1',
    caregiver_id: 'demo',
    filename: 'Lab Result Mar 2024.pdf',
    document_type: 'Lab Result',
    document_date: '2024-03-14',
    status: 'extracted',
    uploaded_at: '2024-03-14T10:00:00Z',
  },
  {
    id: 'd2',
    patient_id: 'demo-1',
    caregiver_id: 'demo',
    filename: 'Cardiology Visit Notes.pdf',
    document_type: 'Clinic Note',
    document_date: '2024-03-11',
    status: 'extracted',
    uploaded_at: '2024-03-11T14:30:00Z',
  },
  {
    id: 'd3',
    patient_id: 'demo-1',
    caregiver_id: 'demo',
    filename: 'Lab Result Sep 2023.pdf',
    document_type: 'Lab Result',
    document_date: '2023-09-05',
    status: 'extracted',
    uploaded_at: '2023-09-05T09:15:00Z',
  },
]

const MARGARET_CLAIMS: Record<string, Claim> = {
  c1: {
    claim_id: 'c1',
    claim_text: 'GFR has fallen from 65 to 47 mL/min/1.73m2',
    claim_type: 'source_document',
    flag: 'SUPPORTED',
    evidence: {
      source_doc_id: 'd1',
      source_quote: 'eGFR 47 mL/min/1.73m2 [LOW] (ref: >60 mL/min)',
      source_page: 1,
    },
  },
  c2: {
    claim_id: 'c2',
    claim_text: 'Lisinopril 10 mg daily - NEW prescribed 2024-03-14',
    claim_type: 'source_document',
    flag: 'SUPPORTED',
    evidence: {
      source_doc_id: 'd2',
      source_quote: 'Rx: Lisinopril 10mg PO QD for blood pressure optimization',
      source_page: 2,
    },
  },
  c3: {
    claim_id: 'c3',
    claim_text: 'ACE inhibitors reduce renal perfusion pressure and exacerbate acute renal decline',
    claim_type: 'medical_knowledge',
    flag: 'MEDICAL_KNOWLEDGE',
    evidence: {
      entry_text:
        'Clinical pharmacology consensus: ACE inhibitors (Lisinopril) reduce glomerular efferent arteriolar tone, precipitating acute kidney injury when eGFR <50.',
    },
  },
  c4: {
    claim_id: 'c4',
    claim_text: 'Atorvastatin 40 mg nightly ongoing since 2022-06',
    claim_type: 'source_document',
    flag: 'SUPPORTED',
    evidence: {
      source_doc_id: 'd2',
      source_quote: 'Atorvastatin 40mg PO QHS - verified active home medication',
      source_page: 1,
    },
  },
  c5: {
    claim_id: 'c5',
    claim_text: 'Metoprolol succinate 25 mg daily ongoing since 2021-11',
    claim_type: 'source_document',
    flag: 'SUPPORTED',
    evidence: {
      source_doc_id: 'd2',
      source_quote: 'Metoprolol succinate 25mg PO QD - ongoing',
      source_page: 1,
    },
  },
}

const MARGARET_CONCERNS: FlaggedConcern[] = [
  {
    severity: 'high',
    concern: 'ACE inhibitor (Lisinopril) prescribed despite declining renal function (eGFR 47).',
  },
]

export function HeroClinicalProof() {
  const [selectedClaimId, setSelectedClaimId] = useState<string>('c2')

  const selectedClaim = MARGARET_CLAIMS[selectedClaimId] || MARGARET_CLAIMS.c2
  const evidence = Array.isArray(selectedClaim.evidence)
    ? selectedClaim.evidence[0]
    : selectedClaim.evidence
  const sourceDoc = evidence?.source_doc_id
    ? MARGARET_DOCUMENTS.find((d) => d.id === evidence.source_doc_id)
    : undefined

  const handleSelectClaim = (id: string) => {
    setSelectedClaimId(id)
  }

  return (
    <div className="border border-[#1F2937] rounded-xl bg-[#0D1117] shadow-2xl overflow-hidden text-left">
      {/* Dossier Bar */}
      <div className="border-b border-[#1F2937] bg-[#0A0E14] px-4 py-3 flex items-center justify-between text-[11px] text-slate-400 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-white/[0.06] border border-white/10 flex items-center justify-center font-mono text-[11px] font-semibold text-white">
            MT
          </div>
          <div>
            <span className="text-white font-semibold">Margaret Thompson</span>
            <span className="font-mono text-[10px] text-slate-400 ml-2">79y · DOB 1945-03-12 · 3 Prescriptions &amp; Notes Indexed</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-white/70 bg-white/[0.06] px-2.5 py-0.5 rounded border border-white/10 tracking-wider">
            INTERACTIVE CLINICAL PROOF
          </span>
        </div>
      </div>

      {/* Flagged Alert Banner (Extracted from real product) */}
      <FlaggedBanner concerns={MARGARET_CONCERNS} />

      {/* Main Verification Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#1F2937]">
        {/* Left Column: Briefing Narrative & Regimen */}
        <div className="lg:col-span-7 p-5 sm:p-6 space-y-6 bg-[#0D1117]">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
                Clinical Synthesis · Generated Briefing
              </h3>
              <span className="font-mono text-[9px] text-slate-500">
                Click any citation to verify
              </span>
            </div>

            <p className="text-[13px] text-slate-200 leading-relaxed mb-3">
              Margaret Thompson presents with active renal compromise documented across serial lab draws, with kidney filtration declining to{' '}
              <strong className="text-white font-medium">eGFR 47 mL/min</strong>{' '}
              <button
                type="button"
                onClick={() => handleSelectClaim('c1')}
                className={`inline-flex items-center gap-1 font-mono text-[10px] border rounded px-1.5 py-0.5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                  selectedClaimId === 'c1'
                    ? 'border-teal-400 text-teal-300 bg-teal-500/20 ring-1 ring-teal-400'
                    : 'border-teal-500/40 text-teal-400 bg-teal-500/10 hover:border-teal-400 hover:bg-teal-500/20'
                }`}
                title="Click to view lab report source"
              >
                ↗ Lab Result · 14 Mar 24 · p.1
              </button>
              .
            </p>

            <p className="text-[13px] text-slate-200 leading-relaxed">
              Her outpatient cardiologist initiated{' '}
              <strong className="text-white font-medium">Lisinopril 10 mg daily</strong>{' '}
              <button
                type="button"
                onClick={() => handleSelectClaim('c2')}
                className={`inline-flex items-center gap-1 font-mono text-[10px] border rounded px-1.5 py-0.5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                  selectedClaimId === 'c2'
                    ? 'border-teal-400 text-teal-300 bg-teal-500/20 ring-1 ring-teal-400'
                    : 'border-teal-500/40 text-teal-400 bg-teal-500/10 hover:border-teal-400 hover:bg-teal-500/20'
                }`}
                title="Click to view cardiology clinic note source"
              >
                ↗ Clinic Note · 11 Mar 24 · p.2
              </button>
              , an ACE inhibitor that is pharmacologically contraindicated in declining renal function{' '}
              <button
                type="button"
                onClick={() => handleSelectClaim('c3')}
                className={`inline-flex items-center gap-1 font-mono text-[10px] border rounded px-1.5 py-0.5 transition-all cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-amber-400 ${
                  selectedClaimId === 'c3'
                    ? 'border-amber-400 text-amber-300 bg-amber-500/20 ring-1 ring-amber-400'
                    : 'border-amber-500/40 text-amber-400 bg-amber-500/10 hover:border-amber-400 hover:bg-amber-500/20'
                }`}
                title="Click to view pharmacology rationale"
              >
                ⚠ Medical Knowledge
              </button>
              .
            </p>
          </div>

          {/* Active Medication Regimen (State Machine Display) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-mono text-[10px] tracking-widest text-slate-400 uppercase">
                Reconciled Active Regimen (State Machine)
              </h4>
              <span className="font-mono text-[9px] text-teal-400 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">Status Aware</span>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSelectClaim('c2')}
                className={`w-full text-left flex items-center justify-between p-2.5 rounded border transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                  selectedClaimId === 'c2'
                    ? 'bg-teal-500/10 border-teal-500/40'
                    : 'bg-[#0A0E14] border-[#1F2937] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
                    NEW
                  </span>
                  <span className="text-[12px] text-white truncate">Lisinopril 10 mg daily</span>
                </div>
                <span className="font-mono text-[10px] text-teal-400 shrink-0">
                  ↗ Clinic Note · p.2
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectClaim('c4')}
                className={`w-full text-left flex items-center justify-between p-2.5 rounded border transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                  selectedClaimId === 'c4'
                    ? 'bg-teal-500/10 border-teal-500/40'
                    : 'bg-[#0A0E14] border-[#1F2937] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 border border-white/10">
                    ONGOING
                  </span>
                  <span className="text-[12px] text-white truncate">Atorvastatin 40 mg nightly</span>
                </div>
                <span className="font-mono text-[10px] text-teal-400 shrink-0">
                  ↗ Clinic Note · p.1
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectClaim('c5')}
                className={`w-full text-left flex items-center justify-between p-2.5 rounded border transition-colors cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-teal-400 ${
                  selectedClaimId === 'c5'
                    ? 'bg-teal-500/10 border-teal-500/40'
                    : 'bg-[#0A0E14] border-[#1F2937] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-slate-400 border border-white/10">
                    ONGOING
                  </span>
                  <span className="text-[12px] text-white truncate">Metoprolol succinate 25 mg daily</span>
                </div>
                <span className="font-mono text-[10px] text-teal-400 shrink-0">
                  ↗ Clinic Note · p.1
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: The PaperTrail Inspector */}
        <div className="lg:col-span-5 p-5 sm:p-6 bg-[#0A0E14] flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#1F2937] mb-3.5">
              <div>
                <p className="font-mono text-[10px] tracking-widest text-teal-400 uppercase">
                  PaperTrail Inspector
                </p>
                <p className="font-mono text-[9px] text-slate-400">
                  Zero blind trust · Exact source anchor
                </p>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded border border-[#1F2937] bg-[#0D1117] text-slate-300">
                Claim #{selectedClaimId}
              </span>
            </div>

            {sourceDoc ? (
              <div className="border border-[#1F2937] rounded-lg bg-[#0D1117] p-4 space-y-3.5 shadow-sm">
                <div className="border-b border-[#1F2937] pb-2.5 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-white truncate">
                      {sourceDoc.filename}
                    </p>
                    <p className="font-mono text-[10px] text-slate-400">
                      {sourceDoc.document_type} · {sourceDoc.document_date}
                    </p>
                  </div>
                  {evidence?.source_page && (
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/30 shrink-0">
                      Page {evidence.source_page}
                    </span>
                  )}
                </div>

                <div>
                  <p className="font-mono text-[9px] text-slate-400 uppercase tracking-wider mb-1">
                    Verbatim Document Excerpt:
                  </p>
                  <blockquote className="p-3 rounded-md border border-teal-500/30 bg-teal-500/5 font-mono text-[11px] text-slate-200">
                    &ldquo;{evidence?.source_quote || selectedClaim.claim_text}&rdquo;
                  </blockquote>
                </div>

                <div className="pt-2 border-t border-[#1F2937] flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Verification Status:</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    SUPPORTED
                  </span>
                </div>
              </div>
            ) : (
              <div className="border border-amber-500/30 rounded-lg bg-[#0D1117] p-4 space-y-3 shadow-sm">
                <div className="border-b border-amber-500/20 pb-2">
                  <p className="text-[12px] font-semibold text-amber-300">
                    Pharmacological Principle
                  </p>
                  <p className="font-mono text-[10px] text-slate-400">
                    Cross-Reference Standard: Clinical Pharmacology
                  </p>
                </div>
                <blockquote className="p-3 rounded-md border border-amber-500/30 bg-amber-500/10 text-[12px] text-slate-200 leading-relaxed font-sans">
                  {evidence?.entry_text || selectedClaim.claim_text}
                </blockquote>
                <div className="pt-2 border-t border-amber-500/20 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-400">Classification:</span>
                  <span className="text-amber-300 font-medium">MEDICAL_KNOWLEDGE</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-lg border border-[#1F2937] bg-[#0D1117] text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-white">Why this matters:</span> In a standard vector database, an AI would match keywords and list Lisinopril without knowing whether it was active, stopped, or contraindicated by the lab test. The graph links the medication to the renal panel, and the PaperTrail proves it with a page number.
          </div>
        </div>
      </div>
    </div>
  )
}

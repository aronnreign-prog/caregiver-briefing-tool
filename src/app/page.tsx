import Link from 'next/link'
import type { Metadata } from 'next'
import { HeroClinicalProof } from '@/components/clinical'
import { DemoRequestModal, DemoRequestTrigger } from '@/components/marketing/DemoRequestModal'

export const metadata: Metadata = {
  title: 'CareNote — Graph Memory & Verifiable PaperTrail for Medical Records',
  description:
    'Medical records are an interconnected timeline, not disconnected text chunks. CareNote builds a persistent patient knowledge graph with an instant PaperTrail linking every claim to its original PDF page.',
}

function Logo({ size = 18 }: { size?: number }) {
  return (
    <div
      className="bg-white text-black rounded flex items-center justify-center shrink-0 font-bold"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 11 11" fill="none">
        <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-[#EDEDED] font-sans antialiased selection:bg-white/20 selection:text-white">
      {/* ━━━ Header ━━━ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0A0E14]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={18} />
            <span className="text-[13px] font-semibold tracking-tight text-white">
              CareNote
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <DemoRequestTrigger
              className="text-[12px] font-medium bg-white text-black px-3.5 py-1.5 rounded hover:bg-white/90 transition-colors cursor-pointer"
            >
              Register for Demo
            </DemoRequestTrigger>
          </div>
        </div>
      </header>

      {/* ━━━ Hero Section: The Two Real Bets ━━━ */}
      <section className="relative pt-20 pb-16">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-3xl mb-12">
            <h1 className="text-[38px] sm:text-[54px] font-semibold tracking-[-0.03em] leading-[1.1] text-white mb-5">
              Medical history isn&apos;t a text chunk. <br />
              <span className="text-white/45">It&apos;s an evolving graph.</span>
            </h1>

            <p className="text-[17px] sm:text-[19px] text-white/65 leading-relaxed max-w-2xl mb-8">
              Standard AI tools chop PDFs into isolated paragraphs and forget what happened last month. CareNote connects every lab, prescription, and specialist note into a persistent patient graph — with a clickable PaperTrail linking every claim to its source page.
            </p>

            <div className="flex items-center gap-3">
              <DemoRequestTrigger
                className="text-[13px] font-medium bg-white text-black px-5 py-2.5 rounded hover:bg-white/90 transition-colors cursor-pointer"
              >
                Register for Demo Access
              </DemoRequestTrigger>
              <a
                href="#proof"
                className="text-[13px] text-white/70 border border-white/[0.12] bg-white/[0.02] px-5 py-2.5 rounded hover:text-white hover:border-white/30 transition-colors"
              >
                Explore Live Proof ↓
              </a>
            </div>
          </div>

          {/* ━━━ Product Proof: Grounded Clinical Briefing + PaperTrail Inspector ━━━ */}
          <div id="proof">
            <HeroClinicalProof />
          </div>
        </div>
      </section>

      {/* ━━━ Bet 1: Graph Memory vs. Vector Chunks ━━━ */}
      <section className="py-20 border-t border-white/[0.08]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.025em] text-white mb-3">
              Vector databases have clinical amnesia.
            </h2>
            <p className="text-[15px] sm:text-[16px] text-white/65 leading-[1.65] max-w-[65ch]">
              Standard AI summarizers chop a 30-page PDF into 500-token text chunks and do semantic search. When you ask about medications, the system finds matching keywords — but it has no concept of timeline, dosages changing over time, or doctors countermanding each other.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            {/* The Old Way */}
            <div className="border border-white/[0.08] rounded-xl bg-white/[0.01] p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-white/90 mb-2">
                  How Standard AI Tools Store Records (Vector Chunks)
                </h3>
                <p className="text-[13px] text-white/60 leading-[1.6] mb-6">
                  Documents are broken into fragments and indexed by cosine similarity. When you ask a question, it retrieves fragments that sound relevant — even if they are 3 years out of date.
                </p>

                <div className="p-3.5 rounded-lg bg-red-500/[0.03] border border-red-500/20 space-y-2 text-[12px] font-mono text-white/60 tabular-nums">
                  <p className="text-red-300">× Chunk 14: &quot;Discontinue Lisinopril due to cough (2023)&quot;</p>
                  <p className="text-red-300">× Chunk 82: &quot;Restart Lisinopril 10mg daily (2024)&quot;</p>
                  <p className="text-red-300">× Chunk 105: &quot;Increase to Lisinopril 20mg daily (2025)&quot;</p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-white/[0.06] text-[12px] text-red-300/90 leading-relaxed">
                Result: Hallucinates contradictory drug lists because it cannot reason about time.
              </div>
            </div>

            {/* CareNote Way */}
            <div className="border border-emerald-500/30 rounded-xl bg-emerald-500/[0.02] p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-white mb-2">
                  How CareNote Stores Records (Patient Knowledge Graph)
                </h3>
                <p className="text-[13px] text-white/70 leading-[1.6] mb-6">
                  Extracts clinical entities — medications, doses, lab trends, and doctors — and connects them across time in a persistent temporal graph. When a drug is changed, old entries are marked superseded.
                </p>

                <div className="p-3.5 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/20 space-y-2 text-[12px] font-mono tabular-nums">
                  <p className="text-white/40">Lisinopril 10mg (2024) → <span className="text-amber-300 font-medium">[SUPERSEDED]</span></p>
                  <p className="text-white font-medium">Lisinopril 20mg (2025) → <span className="text-emerald-300 font-medium">[CURRENT REGIMEN]</span></p>
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-emerald-500/20 text-[12px] text-emerald-300/90 leading-relaxed">
                Result: Maintains the true current state across years of visits and separate providers.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Bet 2: The PaperTrail Verification ━━━ */}
      <section className="py-20 border-t border-white/[0.08]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-2xl mb-12">
            <h2 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.025em] text-white mb-3">
              Never trust an AI summary without a page number.
            </h2>
            <p className="text-[15px] sm:text-[16px] text-white/65 leading-[1.65] max-w-[65ch]">
              In medicine, a hallucinated dosage or misattributed date carries real danger. CareNote refuses black-box generation. Every asserted fact carries a direct audit anchor.
            </p>
          </div>

          <div className="border border-white/[0.08] rounded-xl bg-[#0F141C] p-6 sm:p-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-[14px] font-semibold text-white">1. Fact Extraction</div>
                <p className="text-[13px] text-white/60 leading-[1.6]">
                  Gemini reads the PDF visually — extracting values, units, reference intervals, and physical page numbers directly from the document.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[14px] font-semibold text-white">2. Graph Synthesis</div>
                <p className="text-[13px] text-white/60 leading-[1.6]">
                  Facts accumulate into the patient graph, connecting changes across visits and detecting discrepancies between different specialists.
                </p>
              </div>

              <div className="space-y-2">
                <div className="text-[14px] font-semibold text-white">3. Direct Audit Trail</div>
                <p className="text-[13px] text-white/60 leading-[1.6]">
                  Every claim in the final briefing links directly to its source PDF. Click the citation to inspect the original doctor&apos;s note and page.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Interactive Record Query ━━━ */}
      <section className="py-20 border-t border-white/[0.08]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <h2 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.025em] text-white mb-3">
                Ask your records anything.
              </h2>
              <p className="text-[15px] sm:text-[16px] text-white/65 leading-[1.65] mb-6 max-w-[50ch]">
                Query across years of accumulated documents in plain language. Receive grounded answers with direct citations back to the source records.
              </p>

              <div className="space-y-2.5 text-[13px] text-white/80">
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/20 transition-colors">
                  &ldquo;What medications were changed after her hospital discharge?&rdquo;
                </div>
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/20 transition-colors">
                  &ldquo;How has her kidney function trended over the past 12 months?&rdquo;
                </div>
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/20 transition-colors">
                  &ldquo;Did cardiology and nephrology order any conflicting drugs?&rdquo;
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 border border-white/[0.08] rounded-xl bg-[#0F141C] p-6">
              <div className="pb-3 border-b border-white/[0.08] mb-4 text-[11px] text-white/50 font-semibold flex items-center justify-between">
                <span>Clinical Query Output</span>
                <span className="text-emerald-400">Source-Grounded</span>
              </div>

              <div className="space-y-3 text-[12px]">
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.06] text-white/50 font-mono text-[11px]">
                  User: &quot;What changed after the hospital discharge?&quot;
                </div>
                <div className="p-4 rounded bg-black/20 border border-white/[0.06] space-y-2.5 leading-relaxed">
                  <p className="text-white font-medium">
                    Two changes documented following the March 2025 discharge:
                  </p>
                  <ul className="space-y-2 list-disc pl-4 text-white/80">
                    <li>
                      <span className="text-white font-medium">Lisinopril</span> increased from 10mg to 20mg Daily.{' '}
                      <span className="font-mono text-[10px] bg-white/10 text-white/90 px-1 py-0.5 rounded border border-white/15">
                        Discharge_Summary.pdf #p.3
                      </span>
                    </li>
                    <li>
                      <span className="text-white font-medium">Furosemide</span> discontinued due to resolved edema.{' '}
                      <span className="font-mono text-[10px] bg-white/10 text-white/90 px-1 py-0.5 rounded border border-white/15">
                        Cardio_Followup.pdf #p.1
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Call To Action ━━━ */}
      <section id="demo" className="py-24 border-t border-white/[0.08]">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-[28px] sm:text-[42px] font-semibold tracking-[-0.03em] text-white mb-4">
            Register for Demo Access
          </h2>

          <p className="text-[15px] sm:text-[16px] text-white/60 max-w-md mx-auto mb-8">
            Experience how persistent graph memory and clickable page citations transform scattered medical PDFs.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <DemoRequestTrigger
              className="w-full sm:w-auto text-[13px] font-medium bg-white text-black px-6 py-3 rounded hover:bg-white/90 transition-colors cursor-pointer"
            >
              Request Demo Access
            </DemoRequestTrigger>
          </div>
        </div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer className="border-t border-white/[0.08] py-8">
        <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-white/50">
          <div className="flex items-center gap-2">
            <Logo size={14} />
            <span className="font-semibold text-white/80">CareNote</span>
            <span className="text-[10px] border border-white/[0.1] px-1.5 py-0.5 rounded">v0.1</span>
          </div>

          <div className="flex items-center gap-5 text-white/40">
            <DemoRequestTrigger className="hover:text-white transition-colors cursor-pointer">
              Request Demo Access
            </DemoRequestTrigger>
            <span>© {new Date().getFullYear()} CareNote</span>
          </div>
        </div>
      </footer>

      {/* Interactive Demo Request Access Modal */}
      <DemoRequestModal />
    </div>
  )
}

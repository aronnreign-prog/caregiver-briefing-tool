import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CareNote — Connected Clinical Intelligence',
  description:
    'Every medical record connected. Every claim cited. Turn fragmented clinical documents into a unified, verifiable patient timeline.',
}

function Logo({ size = 18 }: { size?: number }) {
  return (
    <div
      className="bg-accent rounded flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 11 11" fill="none">
        <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-[#0A0E14] text-[#EDEDED] font-sans antialiased selection:bg-accent/20 selection:text-accent">
      {/* ━━━ Top Navigation ━━━ */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#0A0E14]/80 backdrop-blur-xl">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 h-14">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={18} />
            <span className="font-mono text-[12px] font-bold tracking-wider uppercase text-white">
              CareNote
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="font-mono text-[11px] text-white/50 hover:text-white transition-colors"
            >
              Demo Workspace
            </Link>
            <Link
              href="/login"
              className="font-mono text-[11px] text-white/50 hover:text-white transition-colors hidden sm:inline-block"
            >
              Sign in
            </Link>
            <Link
              href="#demo"
              className="font-mono text-[11px] font-medium bg-white text-black px-3.5 py-1.5 rounded hover:bg-white/90 transition-colors"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </header>

      {/* ━━━ Hero Section ━━━ */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        {/* Subtle top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/[0.07] rounded-full blur-[140px] pointer-events-none" />

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="max-w-2xl mb-12">
            <div className="inline-flex items-center gap-2 border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 rounded-full mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-[10px] text-white/60 tracking-wider uppercase">
                Continuous Clinical Synthesis
              </span>
            </div>

            <h1 className="text-[40px] sm:text-[56px] font-medium tracking-[-0.035em] leading-[1.08] text-white mb-5">
              Every record connected. <br />
              <span className="text-white/40">Every claim cited.</span>
            </h1>

            <p className="text-[16px] sm:text-[18px] text-white/60 leading-relaxed max-w-xl mb-8">
              Medical documents don&apos;t live in isolation. CareNote synthesizes messy clinical PDFs across providers into a unified timeline — tracking multi-year trends and linking every single fact to its original page.
            </p>

            <div className="flex items-center gap-3">
              <Link
                href="#demo"
                className="font-mono text-[12px] font-medium bg-accent text-[#0A0E14] px-5 py-2.5 rounded hover:opacity-90 transition-opacity"
              >
                Book a Demo
              </Link>
              <Link
                href="/dashboard"
                className="font-mono text-[12px] text-white/60 border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 rounded hover:text-white hover:border-white/20 transition-colors"
              >
                Try Live Workspace →
              </Link>
            </div>
          </div>

          {/* ━━━ Hero Visual: Interactive Product Canvas ━━━ */}
          <div className="border border-white/[0.08] rounded-xl bg-[#0F141C] shadow-2xl overflow-hidden">
            <div className="border-b border-white/[0.06] bg-[#121822]/60 px-4 py-2.5 flex items-center justify-between font-mono text-[11px] text-white/40">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>Margaret Thompson · 18-Month Synthesis Dossier</span>
              </div>
              <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                Verified Briefing
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
              {/* Left Column: The Briefing */}
              <div className="lg:col-span-7 p-6 space-y-6">
                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-accent font-semibold block mb-2">
                    Trajectory &amp; Safety Review
                  </span>
                  <p className="text-[13px] text-white/90 leading-relaxed mb-4">
                    Patient demonstrates a documented decline in estimated glomerular filtration rate across four distinct encounters: 65 → 58 → 51 → 47 mL/min.{' '}
                    <span className="inline-flex items-center font-mono text-[10px] bg-warning/15 text-warning px-1.5 py-0.5 rounded border border-warning/30">
                      eGFR Trajectory (4 Labs)
                    </span>
                  </p>

                  <div className="p-3.5 rounded-lg bg-alert/10 border border-alert/25 text-[12px] space-y-1.5">
                    <div className="flex items-center gap-2 text-alert font-mono text-[10px] font-bold tracking-wider uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-alert" />
                      Cross-Provider Discrepancy
                    </div>
                    <p className="text-white/80 leading-relaxed">
                      Metformin 1000mg BID continued from Endocrinology note, despite current eGFR at 47 mL/min. Clinical guidelines mandate dosage reduction at &lt;45 to avoid lactic acidosis.{' '}
                      <span className="font-mono text-[10px] bg-alert/20 text-alert px-1 py-0.5 rounded">
                        Endo_Nov2025.pdf #p.2
                      </span>
                    </p>
                  </div>
                </div>

                <div>
                  <span className="font-mono text-[9px] uppercase tracking-widest text-white/40 block mb-2">
                    Reconciled Medication Schedule
                  </span>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-white/80">Lisinopril 20mg Daily</span>
                      <span className="text-accent bg-accent/10 px-1.5 py-0.5 rounded text-[10px]">
                        Discharge_Summary.pdf #p.3
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-white/80">Metformin 1000mg BID</span>
                      <span className="text-warning bg-warning/10 px-1.5 py-0.5 rounded text-[10px]">
                        Review Dosage
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Source Document Inspector */}
              <div className="lg:col-span-5 p-6 bg-black/20 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-3 font-mono text-[10px] text-white/40">
                    <span>Source Document Viewer</span>
                    <span className="text-accent">Page 2 of 4</span>
                  </div>

                  <div className="border border-white/[0.06] rounded bg-white/[0.02] p-3.5 font-mono text-[11px] leading-relaxed space-y-2.5 text-white/50">
                    <div className="border-b border-white/[0.04] pb-2 text-[10px]">
                      <span className="text-white/80 font-semibold">ST. JUDE MEDICAL CENTER</span>
                      <br />
                      Date: 2025-11-14 | Outpatient Endocrinology
                    </div>
                    <p className="text-[10px]">
                      ...Assessment &amp; Plan: Type 2 Diabetes Mellitus. Patient tolerating oral agents well without reported GI distress...
                    </p>
                    <div className="bg-accent/15 border-l-2 border-accent p-2 text-white font-medium text-[11px]">
                      &quot;Continue Metformin 1000 mg tablet by mouth twice daily with meals. Repeat metabolic panel in 6 months.&quot;
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.04] font-mono text-[10px] text-white/40 flex items-center justify-between">
                  <span>Audit Trail: 100% Verifiable</span>
                  <span className="text-accent">Direct Source Anchor</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Linear-Style Walkthrough: 4 Minimal Pillars ━━━ */}
      <section className="py-24 border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-xl mb-16">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
              The Architecture
            </span>
            <h2 className="text-[28px] sm:text-[36px] font-medium tracking-[-0.03em] text-white">
              Engineered for clinical reality.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Step 01 */}
            <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] text-accent tracking-widest block mb-3">
                  01 / VISUAL INGESTION
                </span>
                <h3 className="text-[16px] font-medium text-white mb-2">
                  Drop any medical PDF.
                </h3>
                <p className="text-[13px] text-white/60 leading-relaxed">
                  Lab reports, discharge faxes, and prescription tables. CareNote parses complex multi-column layouts visually without fragile OCR templates.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.04] font-mono text-[10px] text-white/40">
                Preserves exact values, reference units, and page indices.
              </div>
            </div>

            {/* Step 02 */}
            <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] text-accent tracking-widest block mb-3">
                  02 / TEMPORAL STATE
                </span>
                <h3 className="text-[16px] font-medium text-white mb-2">
                  Time-aware medication tracking.
                </h3>
                <p className="text-[13px] text-white/60 leading-relaxed">
                  Generic models treat all text as happening today. CareNote tracks valid date intervals — when a drug is changed or stopped, prior regimens are marked superseded.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.04] font-mono text-[10px] text-white/40">
                Never hallucinates discontinued medications as active.
              </div>
            </div>

            {/* Step 03 */}
            <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] text-accent tracking-widest block mb-3">
                  03 / TRAJECTORY SYNTHESIS
                </span>
                <h3 className="text-[16px] font-medium text-white mb-2">
                  Catch cross-provider discrepancies.
                </h3>
                <p className="text-[13px] text-white/60 leading-relaxed">
                  Connects multi-year lab trends across independent test centers and cross-checks active prescriptions against physiological baselines.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.04] font-mono text-[10px] text-white/40">
                Flags drug-lab contraindications across separate doctors.
              </div>
            </div>

            {/* Step 04 */}
            <div className="border border-white/[0.06] rounded-xl bg-white/[0.02] p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[10px] text-accent tracking-widest block mb-3">
                  04 / ZERO-TRUST PROVENANCE
                </span>
                <h3 className="text-[16px] font-medium text-white mb-2">
                  Every claim is an interactive citation.
                </h3>
                <p className="text-[13px] text-white/60 leading-relaxed">
                  No black-box summaries. Click any medication, dosage, or flagged alert to open the source PDF directly to the supporting sentence.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-white/[0.04] font-mono text-[10px] text-white/40">
                Verifiable in 3 seconds by anyone in the exam room.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Interactive Record Query ━━━ */}
      <section className="py-24 border-t border-white/[0.06] bg-white/[0.01]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
                On-Demand Intelligence
              </span>
              <h2 className="text-[26px] sm:text-[34px] font-medium tracking-[-0.03em] text-white mb-4">
                Ask your records anything.
              </h2>
              <p className="text-[14px] text-white/60 leading-relaxed mb-6">
                Query across years of accumulated documents in natural language. Receive direct, cited answers grounded entirely in documented clinical facts.
              </p>

              <div className="space-y-2 font-mono text-[11px] text-white/70">
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                  → &quot;What medications were stopped after the hospital stay?&quot;
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                  → &quot;Has kidney function trended down over the past 12 months?&quot;
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.04]">
                  → &quot;Are any baseline labs overdue for her current prescriptions?&quot;
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 border border-white/[0.08] rounded-xl bg-[#0F141C] p-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06] mb-4 font-mono text-[11px] text-white/40">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  Query Engine
                </span>
                <span>Ground-Truth Verification</span>
              </div>

              <div className="space-y-3 text-[12px]">
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/[0.04] font-mono text-[11px] text-white/50">
                  User: &quot;What medications were changed after her hospital discharge?&quot;
                </div>
                <div className="p-4 rounded bg-black/20 border border-white/[0.04] space-y-2.5 leading-relaxed">
                  <p className="text-white font-medium">
                    Following the March 2025 discharge, two medication changes were documented:
                  </p>
                  <ul className="space-y-1.5 list-disc pl-4 text-white/70 text-[12px]">
                    <li>
                      <span className="text-white font-medium">Lisinopril</span> increased from 10mg to 20mg Daily.{' '}
                      <span className="font-mono text-[10px] bg-accent/15 text-accent px-1 py-0.5 rounded">
                        Discharge_Summary.pdf #p.3
                      </span>
                    </li>
                    <li>
                      <span className="text-white font-medium">Furosemide</span> discontinued due to resolved edema.{' '}
                      <span className="font-mono text-[10px] bg-accent/15 text-accent px-1 py-0.5 rounded">
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

      {/* ━━━ Comparison Table ━━━ */}
      <section className="py-24 border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6">
          <div className="max-w-xl mb-12">
            <h2 className="text-[24px] sm:text-[32px] font-medium tracking-[-0.03em] text-white mb-2">
              Why generic summarizers fail.
            </h2>
            <p className="text-[14px] text-white/60">
              When dates and dosages carry real clinical consequences, generic chat wrappers are dangerous.
            </p>
          </div>

          <div className="border border-white/[0.06] rounded-xl overflow-x-auto bg-white/[0.02]">
            <table className="w-full text-left border-collapse min-w-[560px]">
              <thead>
                <tr className="border-b border-white/[0.06] font-mono text-[10px] uppercase tracking-wider text-white/40">
                  <th className="py-3.5 px-6">Capability</th>
                  <th className="py-3.5 px-6">Generic PDF Summarizers</th>
                  <th className="py-3.5 px-6 text-accent">CareNote</th>
                </tr>
              </thead>
              <tbody className="text-[12px] divide-y divide-white/[0.04] font-mono">
                <tr>
                  <td className="py-3.5 px-6 text-white font-medium">Document Memory</td>
                  <td className="py-3.5 px-6 text-white/40">Single document scope; forgets past uploads</td>
                  <td className="py-3.5 px-6 text-white font-medium">Multi-year timeline across all visits</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-6 text-white font-medium">Temporal Reasoning</td>
                  <td className="py-3.5 px-6 text-white/40">Treats past and present facts as active</td>
                  <td className="py-3.5 px-6 text-white font-medium">Tracks valid intervals; supersedes old meds</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-6 text-white font-medium">Source Provenance</td>
                  <td className="py-3.5 px-6 text-white/40">Vague statements without source pages</td>
                  <td className="py-3.5 px-6 text-white font-medium">Every fact tied to document &amp; page number</td>
                </tr>
                <tr>
                  <td className="py-3.5 px-6 text-white font-medium">Conflict Detection</td>
                  <td className="py-3.5 px-6 text-white/40">Cannot cross-check separate providers</td>
                  <td className="py-3.5 px-6 text-white font-medium">Evaluates drugs against cross-provider labs</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ━━━ Call To Action ━━━ */}
      <section id="demo" className="py-24 border-t border-white/[0.06]">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="text-[28px] sm:text-[40px] font-medium tracking-[-0.03em] text-white mb-4">
            See CareNote with your actual records.
          </h2>

          <p className="text-[15px] text-white/60 max-w-md mx-auto mb-8">
            Experience how multi-source synthesis, temporal tracking, and verifiable page citations transform dense patient files.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:contact@carenote.health?subject=CareNote%20Demo%20Request"
              className="w-full sm:w-auto font-mono text-[12px] font-medium bg-accent text-[#0A0E14] px-6 py-3 rounded hover:opacity-90 transition-opacity"
            >
              Book a Technical Demo
            </a>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto font-mono text-[12px] text-white/60 border border-white/[0.08] bg-white/[0.02] px-6 py-3 rounded hover:text-white hover:border-white/20 transition-colors"
            >
              Launch Demo Workspace
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ Minimal Footer ━━━ */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-white/40">
          <div className="flex items-center gap-2">
            <Logo size={14} />
            <span className="font-bold tracking-wider uppercase text-white/70">CareNote</span>
            <span className="text-[9px] border border-white/[0.08] px-1 py-0.5 rounded">v0.1</span>
          </div>

          <div className="flex items-center gap-5">
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Workspace
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <span>© {new Date().getFullYear()} CareNote</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

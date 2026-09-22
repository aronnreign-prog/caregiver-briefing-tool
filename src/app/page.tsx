import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CareNote — Clinical Knowledge Graph for Complex Care',
  description:
    'Turn fragmented medical PDFs across providers into a unified clinical timeline. Track longitudinal trajectories, catch cross-record safety discrepancies, and verify every claim directly against the source page.',
}

function Logo({ size = 20 }: { size?: number }) {
  return (
    <div
      className="bg-accent rounded-sm flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 11 11" fill="none">
        <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline-block ml-1.5 group-hover:translate-x-0.5 transition-transform">
      <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground selection:bg-accent/20 selection:text-accent-foreground font-sans">
      {/* ━━━ Blueprint Top Navbar ━━━ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-4 sm:px-8 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-mono text-[12px] font-bold tracking-widest uppercase text-foreground">
              CareNote
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/dashboard"
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Live Demo
            </Link>
            <Link
              href="/login"
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors hidden sm:inline-block"
            >
              Sign In
            </Link>
            <Link
              href="#demo"
              className="font-mono text-[11px] font-semibold bg-accent text-background px-4 py-1.5 rounded hover:opacity-90 transition-opacity"
            >
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* ━━━ Hero Section (Nanonets style: Clean, assertive, problem-focused) ━━━ */}
      <section className="relative pt-16 sm:pt-24 pb-16 sm:pb-20 border-b border-border overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full bg-accent/[0.04] blur-[140px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-8">
          <div className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1 rounded-sm mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                Clinical Context Graph Engine
              </span>
            </div>

            <h1 className="text-[34px] sm:text-[48px] lg:text-[56px] font-semibold tracking-[-0.03em] leading-[1.1] text-foreground mb-6">
              Turn fragmented medical records into a single, connected clinical intelligence.
            </h1>

            <p className="text-[16px] sm:text-[18px] text-muted-foreground leading-relaxed max-w-2xl mb-8">
              Single-document summarizers review records in isolation. CareNote connects unstructured clinical PDFs across providers, resolves longitudinal trends, and produces appointment-ready briefings where every single assertion is cited to its source page.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href="#demo"
                className="group inline-flex items-center justify-center font-mono text-[12px] font-bold bg-accent text-background px-6 py-3.5 rounded hover:opacity-90 transition-opacity"
              >
                Book a Technical Demo
                <ArrowIcon />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center font-mono text-[12px] text-muted-foreground border border-border bg-surface/50 px-6 py-3.5 rounded hover:text-foreground hover:border-accent/40 transition-colors"
              >
                Explore Interactive Workspace
              </Link>
            </div>
          </div>

          {/* ━━━ Blueprint Showcase Preview (Nanonets Workflow Diagram) ━━━ */}
          <div className="border border-border rounded-xl bg-surface shadow-2xl overflow-hidden">
            <div className="border-b border-border bg-surface-raised px-4 sm:px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-accent" />
                <span>Multi-Source Ingestion &amp; Graph Synthesis</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground border border-border px-2 py-0.5 rounded">
                PATIENT: M. THOMPSON · 18-MONTH CHRONOLOGY
              </span>
            </div>

            <div className="p-6 sm:p-8">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-stretch mb-6">
                {/* Source 1 */}
                <div className="border border-border/80 bg-background/80 rounded p-4 font-mono text-[11px] flex flex-col justify-between">
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase mb-1">Source 01 · Hospital Discharge</div>
                    <div className="text-foreground font-semibold mb-2">St. Jude Medical · 2024-03-12</div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      &quot;Discharged on Metformin 1000mg BID. Baseline renal function normal (eGFR 65).&quot;
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-accent">
                    → Extracted: Metformin 1000mg [Page 2]
                  </div>
                </div>

                {/* Source 2 */}
                <div className="border border-border/80 bg-background/80 rounded p-4 font-mono text-[11px] flex flex-col justify-between">
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase mb-1">Source 02 · Outpatient Labs</div>
                    <div className="text-foreground font-semibold mb-2">Quest Diagnostics · 2024-09-18</div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      &quot;Comprehensive Metabolic Panel: eGFR 58 mL/min/1.73m², Serum Creatinine 1.2 mg/dL.&quot;
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-accent">
                    → Extracted: eGFR 58 [Page 1]
                  </div>
                </div>

                {/* Source 3 */}
                <div className="border border-border/80 bg-background/80 rounded p-4 font-mono text-[11px] flex flex-col justify-between">
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase mb-1">Source 03 · Nephrology Clinic</div>
                    <div className="text-foreground font-semibold mb-2">Renal Specialists · 2025-01-22</div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      &quot;Follow-up labs confirm progressive decline: eGFR 51 mL/min. Stage 3a CKD.&quot;
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-accent">
                    → Extracted: eGFR 51 [Page 3]
                  </div>
                </div>

                {/* Source 4 */}
                <div className="border border-border/80 bg-background/80 rounded p-4 font-mono text-[11px] flex flex-col justify-between">
                  <div>
                    <div className="text-muted-foreground text-[10px] uppercase mb-1">Source 04 · Urgent Care Visit</div>
                    <div className="text-foreground font-semibold mb-2">Northside Health · 2025-09-04</div>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      &quot;BP 152/92. Added Lisinopril 20mg Daily. Stat BMP reveals eGFR 47 mL/min.&quot;
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-accent">
                    → Extracted: Lisinopril 20mg, eGFR 47 [Page 1]
                  </div>
                </div>
              </div>

              {/* Synthesized Briefing Output */}
              <div className="border-t border-border pt-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-accent font-semibold">
                    Synthesized Clinical Intelligence &amp; Verified Citations
                  </span>
                  <span className="font-mono text-[10px] text-alert bg-alert-dim px-2 py-0.5 rounded border border-alert/30">
                    CRITICAL SAFETY FLAG DETECTED
                  </span>
                </div>

                <div className="bg-surface-raised border border-border rounded-lg p-5 space-y-4">
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground mb-1.5">
                      18-Month Trajectory: Progressive Renal Impairment
                    </h3>
                    <p className="text-[13px] text-foreground/90 leading-relaxed">
                      Serial metabolic monitoring reveals a steady decline in eGFR from 65 to 58, 51, and currently 47 mL/min across 4 distinct encounters.{' '}
                      <span className="font-mono text-[10px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                        4 Sources Linked
                      </span>
                    </p>
                  </div>

                  <div className="border-l-2 border-alert pl-3.5 py-1">
                    <h4 className="text-[13px] font-semibold text-alert mb-1">
                      Contraindication Discrepancy Flag
                    </h4>
                    <p className="text-[12px] text-alert-foreground leading-relaxed">
                      Patient remains on Metformin 1000mg BID continued from March discharge. With eGFR now documented at 47 mL/min, clinical guidelines require dose reduction (&lt;45 mL/min contraindication threshold) to mitigate lactic acidosis risk.{' '}
                      <span className="font-mono text-[10px] bg-alert/20 text-alert px-1.5 py-0.5 rounded">
                        StJude_Discharge.pdf #p.2
                      </span>{' '}
                      <span className="font-mono text-[10px] bg-alert/20 text-alert px-1.5 py-0.5 rounded">
                        Northside_UC.pdf #p.1
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ The Concrete Scenario (Nanonets "Help agents solve the most complex problems" style) ━━━ */}
      <section className="py-16 sm:py-24 border-b border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="max-w-3xl mb-12">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
              The Multi-Provider Dilemma
            </span>
            <h2 className="text-[26px] sm:text-[38px] font-semibold tracking-[-0.02em] leading-tight text-foreground">
              One single patient question requires connecting five isolated documents.
            </h2>
            <p className="text-[15px] sm:text-[16px] text-muted-foreground mt-4 leading-relaxed">
              A patient is prescribed a new medication at urgent care, has labs done at an independent facility, sees an endocrinologist for diabetes, and gets discharged from a hospital. Each provider records notes in their own silo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-border rounded-lg bg-surface p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest block mb-3">
                  Silo 01 · Outpatient Records
                </span>
                <h3 className="text-[16px] font-semibold text-foreground mb-2">
                  The Endocrinologist doesn&apos;t see the renal drop.
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  They maintain the patient on high-dose oral hypoglycemics because their clinic chart has no record of the recent metabolic tests ordered by the hospital.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[10px] text-warning">
                Result: Unmonitored medication risk
              </div>
            </div>

            <div className="border border-border rounded-lg bg-surface p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest block mb-3">
                  Silo 02 · Dispersed Testing
                </span>
                <h3 className="text-[16px] font-semibold text-foreground mb-2">
                  The Isolated Lab doesn&apos;t know the clinical trajectory.
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  A lab report listing eGFR at 51 prints as &quot;mild reduction&quot;. But when evaluated against three prior visits over 18 months, it represents a steep 28% drop.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[10px] text-warning">
                Result: Missed progressive disease marker
              </div>
            </div>

            <div className="border border-border rounded-lg bg-surface p-6 flex flex-col justify-between">
              <div>
                <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest block mb-3">
                  Silo 03 · Urgent Care &amp; Discharge
                </span>
                <h3 className="text-[16px] font-semibold text-foreground mb-2">
                  The Hospital doesn&apos;t reconcile prior discontinuations.
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  Discharge medication reconciliations frequently re-list drugs that were deliberately discontinued months earlier due to adverse effects, restarting dangerous cycles.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border font-mono text-[10px] text-warning">
                Result: Dangerous duplicate therapy
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Technical Engine (How it actually works) ━━━ */}
      <section className="py-16 sm:py-24 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="max-w-2xl mb-16">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
              System Architecture
            </span>
            <h2 className="text-[26px] sm:text-[38px] font-semibold tracking-[-0.02em] text-foreground">
              Engineered for clinical precision, not generic chat.
            </h2>
            <p className="text-[15px] text-muted-foreground mt-3">
              Four deliberate architectural choices that separate CareNote from generic LLM summarization wrappers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Feature 1 */}
            <div className="border border-border rounded-xl bg-surface p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="font-mono text-[11px] font-bold text-accent uppercase tracking-widest mb-3">
                  / 01 Visual Document Understanding
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-3">
                  Layout-Aware Parsing Without Rigid OCR Templates
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  Medical records aren&apos;t clean text files. They are multi-column lab charts, scanned faxed summaries, and tabular discharge instructions. CareNote processes PDFs visually — preserving tables, headers, and reference columns without breaking when layouts change.
                </p>
              </div>
              <div className="p-3 rounded bg-surface-raised border border-border font-mono text-[11px] text-muted-foreground">
                Captures exact values, numerical units, reference ranges, and physical 1-indexed page coordinates.
              </div>
            </div>

            {/* Feature 2 */}
            <div className="border border-border rounded-xl bg-surface p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="font-mono text-[11px] font-bold text-accent uppercase tracking-widest mb-3">
                  / 02 Bi-Temporal State Tracking
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-3">
                  Valid Intervals Replace Stale Data Amalgams
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  Standard AI models treat every piece of text in a prompt as currently true. CareNote associates every clinical entity with valid-from and valid-to timestamps. When a medication is changed or discontinued, the prior regimen is explicitly superseded.
                </p>
              </div>
              <div className="p-3 rounded bg-surface-raised border border-border font-mono text-[11px] text-muted-foreground">
                Prevents hallucinated lists of historic drugs being presented as active therapies.
              </div>
            </div>

            {/* Feature 3 */}
            <div className="border border-border rounded-xl bg-surface p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="font-mono text-[11px] font-bold text-accent uppercase tracking-widest mb-3">
                  / 03 Longitudinal Trajectory Synthesis
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-3">
                  Cross-Record Multi-Year Trend Detection
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  Clinical trajectory is calculated across all accumulated encounters. Rather than viewing an isolated lab test, CareNote automatically extracts the historical sequence, identifying progressive changes and evaluating them against active prescriptions.
                </p>
              </div>
              <div className="p-3 rounded bg-surface-raised border border-border font-mono text-[11px] text-muted-foreground">
                Flags contraindications and dosage thresholds (e.g., eGFR &lt; 45 for Metformin) across different providers.
              </div>
            </div>

            {/* Feature 4 */}
            <div className="border border-border rounded-xl bg-surface p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <div className="font-mono text-[11px] font-bold text-accent uppercase tracking-widest mb-3">
                  / 04 Zero-Trust Source Provenance (PaperTrail)
                </div>
                <h3 className="text-[18px] font-semibold text-foreground mb-3">
                  Every Asserted Claim Tied Directly to the PDF Page
                </h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed mb-4">
                  In healthcare, black-box summaries are unacceptable. Every medication, lab finding, and safety warning generated by CareNote carries an embedded citation token linking to the exact source document UUID and page number.
                </p>
              </div>
              <div className="p-3 rounded bg-surface-raised border border-border font-mono text-[11px] text-muted-foreground">
                Caregivers and physicians can verify any sentence against the original medical record in one click.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Comparison Table (Nanonets "What makes us different" section) ━━━ */}
      <section className="py-16 sm:py-24 border-b border-border bg-surface/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="max-w-2xl mb-12">
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
              Capabilities Comparison
            </span>
            <h2 className="text-[26px] sm:text-[34px] font-semibold tracking-[-0.02em] text-foreground">
              Why generic document tools fail in healthcare.
            </h2>
          </div>

          <div className="border border-border rounded-xl overflow-x-auto bg-surface">
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-surface-raised/50 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-3.5 px-6">Capability</th>
                  <th className="py-3.5 px-6">Generic PDF Summarizers</th>
                  <th className="py-3.5 px-6 text-accent">CareNote Clinical Graph</th>
                </tr>
              </thead>
              <tbody className="text-[13px] divide-y divide-border font-mono">
                <tr>
                  <td className="py-4 px-6 font-sans font-medium text-foreground">Document Memory</td>
                  <td className="py-4 px-6 text-muted-foreground">Single document scope; forgets past uploads</td>
                  <td className="py-4 px-6 text-foreground font-semibold">Continuous longitudinal graph across all visits</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-sans font-medium text-foreground">Temporal Reasoning</td>
                  <td className="py-4 px-6 text-muted-foreground">Treats 2021 and 2025 facts as currently active</td>
                  <td className="py-4 px-6 text-foreground font-semibold">Tracks valid-from/to intervals; supersedes old meds</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-sans font-medium text-foreground">Source Provenance</td>
                  <td className="py-4 px-6 text-muted-foreground">Vague summaries without verifiable anchors</td>
                  <td className="py-4 px-6 text-foreground font-semibold">Every fact linked to physical document &amp; page number</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-sans font-medium text-foreground">Safety Discrepancies</td>
                  <td className="py-4 px-6 text-muted-foreground">Cannot evaluate conflicts across multiple providers</td>
                  <td className="py-4 px-6 text-foreground font-semibold">Cross-checks medications against cross-provider lab trends</td>
                </tr>
                <tr>
                  <td className="py-4 px-6 font-sans font-medium text-foreground">Omission Detection</td>
                  <td className="py-4 px-6 text-muted-foreground">Only reflects what is present in the document</td>
                  <td className="py-4 px-6 text-foreground font-semibold">Flags notable absences (e.g. missing monitoring baselines)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ━━━ Interactive Record Querying ━━━ */}
      <section className="py-16 sm:py-24 border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-6">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent block mb-2">
                On-Demand Record Intelligence
              </span>
              <h2 className="text-[26px] sm:text-[36px] font-semibold tracking-[-0.02em] text-foreground mb-4">
                Ask precise clinical questions across the entire health history.
              </h2>
              <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed mb-6">
                Before walking into an appointment, family caregivers shouldn&apos;t have to memorize a 200-page binder. Query the connected medical history in natural language and receive fact-grounded, cited answers with zero hallucination.
              </p>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-3 rounded bg-surface border border-border text-foreground/90">
                  <span className="text-accent mr-2">Q:</span> &quot;What medications were stopped following her March hospital discharge?&quot;
                </div>
                <div className="p-3 rounded bg-surface border border-border text-foreground/90">
                  <span className="text-accent mr-2">Q:</span> &quot;How has her kidney function trended since starting blood pressure therapy?&quot;
                </div>
                <div className="p-3 rounded bg-surface border border-border text-foreground/90">
                  <span className="text-accent mr-2">Q:</span> &quot;Are there any drug interactions between her cardiology and neurology prescriptions?&quot;
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 border border-border rounded-xl bg-surface p-6 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-border mb-4 font-mono text-[11px] text-muted-foreground">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent" />
                  Clinical Query Response
                </span>
                <span>Anaphora-Resolved Query</span>
              </div>

              <div className="space-y-3 text-[12px]">
                <div className="p-3 rounded bg-surface-raised border border-border font-mono text-[11px] text-muted-foreground">
                  User: &quot;What changed after the hospital stay?&quot;
                </div>
                <div className="p-4 rounded bg-background border border-border leading-relaxed space-y-3">
                  <p className="text-foreground font-medium">
                    Following the 2025-03-12 hospital discharge, the following medication adjustments were documented:
                  </p>
                  <ul className="space-y-2 list-disc pl-4 text-muted-foreground">
                    <li>
                      <span className="text-foreground font-semibold">Lisinopril</span> increased from 10mg to 20mg Daily for refractory hypertension.{' '}
                      <span className="font-mono text-[10px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                        Discharge_Summary.pdf #p.3
                      </span>
                    </li>
                    <li>
                      <span className="text-foreground font-semibold">Furosemide</span> discontinued due to resolved peripheral edema.{' '}
                      <span className="font-mono text-[10px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                        Cardio_Followup.pdf #p.1
                      </span>
                    </li>
                    <li>
                      <span className="text-foreground font-semibold">Metformin</span> maintained at 1000mg BID without adjustment.{' '}
                      <span className="font-mono text-[10px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                        Discharge_Summary.pdf #p.3
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ Bottom Call to Action ━━━ */}
      <section id="demo" className="py-20 sm:py-28 border-b border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-8 text-center">
          <div className="inline-flex items-center gap-2 border border-border bg-surface px-3 py-1 rounded-sm mb-6">
            <span className="font-mono text-[10px] text-accent uppercase tracking-widest">
              Private Pilot Access
            </span>
          </div>

          <h2 className="text-[30px] sm:text-[44px] font-semibold tracking-[-0.03em] text-foreground mb-4">
            See CareNote run on your actual records.
          </h2>

          <p className="text-[15px] sm:text-[16px] text-muted-foreground max-w-xl mx-auto leading-relaxed mb-8">
            Experience how multi-source extraction, temporal graph tracking, and verifiable page citations transform dense patient histories into actionable briefings.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:contact@carenote.health?subject=CareNote%20Technical%20Demo%20Request"
              className="w-full sm:w-auto font-mono text-[12px] font-bold bg-accent text-background px-8 py-3.5 rounded hover:opacity-90 transition-opacity"
            >
              Book a Technical Demo
            </a>
            <Link
              href="/dashboard"
              className="w-full sm:w-auto font-mono text-[12px] text-muted-foreground border border-border bg-surface px-8 py-3.5 rounded hover:text-foreground hover:border-accent/40 transition-colors"
            >
              Launch Live Workspace Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ Minimal Engineering Footer ━━━ */}
      <footer className="py-8 bg-surface">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <Logo size={16} />
            <span className="font-bold tracking-widest uppercase text-foreground">CareNote</span>
            <span className="border border-border px-1.5 py-0.5 rounded text-[9px]">v0.1</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="hover:text-foreground transition-colors">
              Interactive Workspace
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
            <span>© {new Date().getFullYear()} CareNote</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

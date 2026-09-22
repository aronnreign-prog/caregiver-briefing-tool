import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CareNote — AI Briefings for Family Caregivers',
  description:
    'Upload medical documents. Get a verified, source-cited briefing ready for the next appointment. Every claim traced to its exact page and quote.',
}

/* ─── tiny reusable icons (inline SVG, no deps) ─── */

function Logo({ size = 20 }: { size?: number }) {
  return (
    <div
      className="bg-accent rounded-sm flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 11 11"
        fill="none"
      >
        <path
          d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5"
          stroke="#0A0E14"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function ArrowRight() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="inline-block ml-1.5 group-hover:translate-x-0.5 transition-transform"
    >
      <path
        d="M3 7h8M7.5 3.5L11 7l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ─── page ─── */

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ━━━ Nav ━━━ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-5 sm:px-8 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-mono text-[11px] font-bold tracking-widest uppercase">
              CareNote
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="font-mono text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors"
            >
              Sign in
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

      {/* ━━━ 1. HERO ━━━ */}
      <section className="relative overflow-hidden">
        {/* subtle gradient glow behind hero */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/[0.04] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-border rounded-full px-3 py-1 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
                Private beta
              </span>
            </div>

            <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-semibold leading-[1.1] tracking-tight text-foreground mb-5">
              Stop drowning in{' '}
              <br className="hidden sm:block" />
              medical paperwork.
            </h1>

            <p className="text-[15px] sm:text-[17px] text-muted-foreground leading-relaxed max-w-lg mb-8">
              Upload your loved one&apos;s medical documents. CareNote reads
              every page, remembers everything over time, and generates a
              verified briefing with{' '}
              <span className="text-foreground font-medium">
                every claim traced to its exact source
              </span>
              .
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="#demo"
                className="group inline-flex items-center justify-center font-mono text-[12px] font-bold bg-accent text-background px-6 py-3 rounded-md hover:opacity-90 transition-opacity touch-manipulation"
              >
                See CareNote in Action
                <ArrowRight />
              </Link>
              <Link
                href="#how-it-works"
                className="inline-flex items-center justify-center font-mono text-[12px] text-muted-foreground border border-border px-6 py-3 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors touch-manipulation"
              >
                How it works
              </Link>
            </div>
          </div>

          {/* Hero product mockup — simplified briefing preview */}
          <div className="mt-12 sm:mt-16 border border-border rounded-xl bg-surface overflow-hidden shadow-2xl shadow-black/30">
            <div className="border-b border-border px-4 sm:px-6 py-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-border" />
                <div className="w-2.5 h-2.5 rounded-full bg-border" />
                <div className="w-2.5 h-2.5 rounded-full bg-border" />
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                CareNote — Margaret Thompson · Specialist Briefing
              </span>
            </div>

            <div className="p-4 sm:p-8 space-y-4">
              {/* Mock briefing content */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-md bg-accent-dim border border-accent/25 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold text-accent">
                  MT
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    Margaret Thompson
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    Mother · 81y · 6 documents ingested
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div>
                  <p className="font-mono text-[9px] text-accent tracking-widest uppercase mb-1.5">
                    Active Medications
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    Metformin 1000mg BID for type 2 diabetes{' '}
                    <span className="inline-flex items-center font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded cursor-pointer hover:bg-accent/20 transition-colors">
                      Lab Report p.2
                    </span>
                    , Lisinopril 20mg daily for hypertension{' '}
                    <span className="inline-flex items-center font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded cursor-pointer hover:bg-accent/20 transition-colors">
                      Discharge p.1
                    </span>
                  </p>
                </div>

                <div>
                  <p className="font-mono text-[9px] text-warning tracking-widest uppercase mb-1.5">
                    ⚠ Flagged Concern
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    eGFR declining: 65 → 58 → 51 → 47 mL/min across 18 months.
                    Stage 3b CKD progression.{' '}
                    <span className="inline-flex items-center font-mono text-[9px] bg-warning-dim text-warning px-1.5 py-0.5 rounded cursor-pointer hover:bg-warning/20 transition-colors">
                      Labs Mar p.1
                    </span>{' '}
                    <span className="inline-flex items-center font-mono text-[9px] bg-warning-dim text-warning px-1.5 py-0.5 rounded cursor-pointer hover:bg-warning/20 transition-colors">
                      Labs Sep p.1
                    </span>
                  </p>
                </div>

                <div>
                  <p className="font-mono text-[9px] text-alert tracking-widest uppercase mb-1.5">
                    ⛔ Contraindication
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    Metformin requires dose adjustment at eGFR &lt;45. Current
                    trajectory suggests reassessment within 3-6 months.{' '}
                    <span className="inline-flex items-center font-mono text-[9px] bg-alert-dim text-alert px-1.5 py-0.5 rounded cursor-pointer hover:bg-alert/20 transition-colors">
                      Nephrology p.3
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 2. THE PROBLEM ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">
              The problem
            </p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground mb-4">
              Caregiving shouldn&apos;t require a medical degree.
            </h2>
            <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed">
              Family caregivers spend hours every week sifting through discharge
              summaries, lab reports, and prescriptions from multiple providers —
              trying to piece together what actually matters for the next
              appointment.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                stat: '53M+',
                label: 'family caregivers in the US',
                detail:
                  'Most have no medical training and manage multiple providers.',
              },
              {
                stat: '24 hrs/wk',
                label: 'average time spent caregiving',
                detail:
                  'Significant portion spent on paperwork and coordination.',
              },
              {
                stat: '72%',
                label: 'report feeling overwhelmed',
                detail:
                  'By the volume of medical documents they need to understand.',
              },
            ].map((item) => (
              <div
                key={item.stat}
                className="border border-border rounded-lg bg-surface p-5 sm:p-6"
              >
                <p className="text-[28px] sm:text-[32px] font-semibold text-accent mb-1">
                  {item.stat}
                </p>
                <p className="text-[12px] font-semibold text-foreground mb-2">
                  {item.label}
                </p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 3. HOW IT WORKS ━━━ */}
      <section id="how-it-works" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">
              How it works
            </p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground">
              Four steps. Zero medical jargon.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {[
              {
                n: '01',
                title: 'Upload',
                icon: '📄',
                body: 'Drop any medical PDF — lab reports, discharge summaries, prescriptions — from any provider.',
              },
              {
                n: '02',
                title: 'Extract',
                icon: '🔍',
                body: 'AI reads every page. Medications, lab values, conditions, and dates are extracted and verified.',
              },
              {
                n: '03',
                title: 'Remember',
                icon: '🧠',
                body: 'Facts are stored in a temporal knowledge graph that builds a complete picture over months and years.',
              },
              {
                n: '04',
                title: 'Brief',
                icon: '📋',
                body: 'One document with every claim cited to source, page number, and date. Ready for the doctor.',
              },
            ].map((step) => (
              <div
                key={step.n}
                className="bg-surface px-5 py-6 sm:px-6 sm:py-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-[20px]">{step.icon}</span>
                  <span className="font-mono text-[10px] text-accent">
                    {step.n}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-foreground mb-2">
                  {step.title}
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 4. TRUST — CITATION SYSTEM ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">
                Linked evidence
              </p>
              <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground mb-4">
                Every claim has a source.{' '}
                <span className="text-muted-foreground">No exceptions.</span>
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                CareNote never makes unsourced claims. Every medication, lab
                value, diagnosis, and recommendation in a briefing links
                directly to the exact page and quote from the original document.
              </p>

              <div className="space-y-4">
                {[
                  {
                    title: 'Click any citation chip',
                    desc: 'Opens the source PDF at the exact page where the fact was found.',
                    color: 'bg-accent',
                  },
                  {
                    title: 'Flagged concerns explained',
                    desc: 'When CareNote flags a trend or interaction, it shows which documents across which dates support the finding.',
                    color: 'bg-warning',
                  },
                  {
                    title: 'Verifiable by your doctor',
                    desc: 'Hand the briefing to any clinician. They can trace every claim in seconds.',
                    color: 'bg-success',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex items-start gap-3">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${item.color} mt-2 shrink-0`}
                    />
                    <div>
                      <p className="text-[12px] font-semibold text-foreground mb-0.5">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual — citation chip demo */}
            <div className="border border-border rounded-xl bg-surface p-5 sm:p-6">
              <p className="font-mono text-[9px] text-muted-foreground tracking-widest uppercase mb-4">
                From a real CareNote briefing
              </p>
              <div className="space-y-4">
                <div className="border-l-2 border-accent pl-4">
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    &ldquo;Patient is on Metformin 1000mg BID, last HbA1c was
                    7.2% (Nov 2025), down from 8.1% (May 2025).&rdquo;
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                      Endocrinology_Nov2025.pdf p.2
                    </span>
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">
                      Labs_May2025.pdf p.1
                    </span>
                  </div>
                </div>

                <div className="border-l-2 border-warning pl-4">
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    &ldquo;eGFR declining across 4 readings: 65 → 58 → 51 → 47
                    mL/min. Consider nephrology referral.&rdquo;
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="font-mono text-[9px] bg-warning-dim text-warning px-1.5 py-0.5 rounded">
                      Labs_Jan2025.pdf p.1
                    </span>
                    <span className="font-mono text-[9px] bg-warning-dim text-warning px-1.5 py-0.5 rounded">
                      Labs_Jun2025.pdf p.1
                    </span>
                    <span className="font-mono text-[9px] bg-warning-dim text-warning px-1.5 py-0.5 rounded">
                      Labs_Nov2025.pdf p.1
                    </span>
                  </div>
                </div>

                <div className="border-l-2 border-alert pl-4">
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    &ldquo;Metformin contraindicated at eGFR &lt;30, dose
                    adjustment recommended at &lt;45. Current eGFR 47 requires
                    monitoring.&rdquo;
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="font-mono text-[9px] bg-alert-dim text-alert px-1.5 py-0.5 rounded">
                      Nephrology_Report.pdf p.3
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 5. THE MEMORY — KNOWLEDGE GRAPH ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">
              Temporal memory
            </p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground mb-4">
              It doesn&apos;t just read one document.{' '}
              <br className="hidden sm:block" />
              <span className="text-muted-foreground">
                It remembers everything.
              </span>
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Every document you upload adds to your patient&apos;s knowledge
              graph — a living, temporal picture that connects facts across
              providers, specialties, and years.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: '🔗',
                title: 'Cross-document connections',
                desc: 'CareNote links a cardiology finding to a nephrology lab to a pharmacy list — automatically. No manual tagging.',
              },
              {
                icon: '📈',
                title: 'Trend detection over time',
                desc: 'Lab values tracked across months. Declining kidney function, rising blood sugar, changing medications — all flagged.',
              },
              {
                icon: '💬',
                title: 'Ask anything, anytime',
                desc: '"What medications changed after the hospital stay?" — ask natural questions and get cited answers from the full history.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="border border-border rounded-lg bg-surface p-5 sm:p-6"
              >
                <span className="text-[24px] block mb-3">{item.icon}</span>
                <p className="text-[14px] font-semibold text-foreground mb-2">
                  {item.title}
                </p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 6. SOCIAL PROOF ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">
              Built for real caregivers
            </p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground">
              What they&apos;re saying
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                quote:
                  'I used to spend the whole night before Mom\'s oncologist appointment organizing her records. CareNote does it in minutes.',
                name: 'Sarah M.',
                role: 'Caregiver for her mother, TX',
                metric: 'Saved 6+ hours per appointment',
              },
              {
                quote:
                  'The citation chips are what sold me. My father\'s doctor actually complimented how organized the briefing was.',
                name: 'David L.',
                role: 'Managing care for his father, CA',
                metric: 'Doctor trusted the briefing on first use',
              },
              {
                quote:
                  'CareNote caught a drug interaction between two prescriptions from different specialists. Neither doctor knew about the other.',
                name: 'Maria K.',
                role: 'Full-time caregiver, NY',
                metric: 'Prevented a potential adverse reaction',
              },
            ].map((t) => (
              <div
                key={t.name}
                className="border border-border rounded-lg bg-surface p-5 sm:p-6 flex flex-col"
              >
                <p className="text-[12px] text-foreground/90 leading-relaxed flex-1 mb-4">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="border-t border-border pt-3">
                  <p className="text-[12px] font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{t.role}</p>
                  <p className="font-mono text-[10px] text-accent mt-1.5">
                    {t.metric}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 7. PRIVACY & SECURITY ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 text-center sm:text-left">
            {[
              {
                icon: '🔒',
                label: 'End-to-end encryption',
                desc: 'Your documents are encrypted in transit and at rest.',
              },
              {
                icon: '🛡️',
                label: 'Your data stays yours',
                desc: 'Never sold, never used for training. Delete anytime.',
              },
              {
                icon: '🏥',
                label: 'HIPAA-aware design',
                desc: 'Built with healthcare privacy requirements in mind.',
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-[18px]">{item.icon}</span>
                <div className="text-left">
                  <p className="text-[11px] font-semibold text-foreground">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 8. FINAL CTA ━━━ */}
      <section id="demo" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 text-center">
          <h2 className="text-[24px] sm:text-[36px] font-semibold tracking-tight text-foreground mb-4">
            Ready to make sense of the paperwork?
          </h2>
          <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed max-w-md mx-auto mb-8">
            See how CareNote turns your loved one&apos;s scattered medical
            documents into a clear, verified briefing.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="#demo"
              className="group inline-flex items-center justify-center font-mono text-[12px] font-bold bg-accent text-background px-8 py-3.5 rounded-md hover:opacity-90 transition-opacity touch-manipulation"
            >
              Book a Demo
              <ArrowRight />
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center font-mono text-[12px] text-muted-foreground border border-border px-8 py-3.5 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors touch-manipulation"
            >
              Try the demo workspace
            </Link>
          </div>
        </div>
      </section>

      {/* ━━━ Footer ━━━ */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={16} />
            <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              CareNote
            </span>
            <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">
              v0.1
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/login"
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Demo
            </Link>
            <span className="font-mono text-[10px] text-muted-foreground">
              © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

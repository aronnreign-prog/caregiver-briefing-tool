import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CareNote — AI Briefings for Family Caregivers',
  description:
    'Upload medical documents. CareNote builds a temporal knowledge graph across every record and generates source-cited briefings where every claim links to its exact page.',
}

/* ─── tiny reusable pieces ─── */

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

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="inline-block ml-1.5 group-hover:translate-x-0.5 transition-transform">
      <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* connector arrow between pipeline steps */
function StepConnector() {
  return (
    <div className="hidden lg:flex items-center justify-center text-border">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M5 12h14M14 7l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* ━━━ Nav ━━━ */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-5 sm:px-8 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-mono text-[11px] font-bold tracking-widest uppercase">CareNote</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link href="/login" className="font-mono text-[11px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded transition-colors">
              Sign in
            </Link>
            <Link href="#demo" className="font-mono text-[11px] font-semibold bg-accent text-background px-4 py-1.5 rounded hover:opacity-90 transition-opacity">
              Book a Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* ━━━ 1. HERO — the real pitch ━━━ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-accent/[0.04] blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-16 sm:pt-24 pb-16 sm:pb-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 border border-border rounded-full px-3 py-1 mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="font-mono text-[10px] text-muted-foreground tracking-wide">Private beta</span>
            </div>

            <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-semibold leading-[1.1] tracking-tight text-foreground mb-5">
              A knowledge graph<br className="hidden sm:block" />
              for your loved one&apos;s<br className="hidden sm:block" />
              medical history.
            </h1>

            <p className="text-[15px] sm:text-[17px] text-muted-foreground leading-relaxed max-w-lg mb-8">
              Most tools extract facts from a single PDF. CareNote builds a{' '}
              <span className="text-foreground font-medium">temporal knowledge graph</span>{' '}
              that connects every medication, lab value, and diagnosis{' '}
              <span className="text-foreground font-medium">across documents, providers, and years</span>.
              Then generates a briefing where every single claim links to its exact source page.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="#demo" className="group inline-flex items-center justify-center font-mono text-[12px] font-bold bg-accent text-background px-6 py-3 rounded-md hover:opacity-90 transition-opacity touch-manipulation">
                Book a Demo
                <Arrow />
              </Link>
              <Link href="#architecture" className="inline-flex items-center justify-center font-mono text-[12px] text-muted-foreground border border-border px-6 py-3 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors touch-manipulation">
                See the architecture
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 2. THE ARCHITECTURE — this is what's different ━━━ */}
      <section id="architecture" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">Under the hood</p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground mb-4">
              Not another &ldquo;upload and summarize&rdquo; tool.
            </h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed max-w-xl mx-auto">
              Every other tool gives you a one-shot summary per document. CareNote has a fundamentally different architecture.
            </p>
          </div>

          {/* Pipeline visualization */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-4 lg:gap-0 items-stretch">

            {/* Step 1: Multimodal Extraction */}
            <div className="border border-border rounded-xl bg-surface p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-[10px] text-accent bg-accent-dim px-2 py-0.5 rounded">01</span>
                <span className="text-[13px] font-semibold text-foreground">Multimodal Extraction</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 flex-1">
                Gemini 2.5 Flash reads your PDF <span className="text-foreground">visually</span> — not just text, but tables, handwritten notes,
                lab report layouts. Outputs a structured schema: medications with doses, lab values with reference ranges, conditions with onset dates.
                Every fact tagged with its <span className="text-foreground">exact page number</span>.
              </p>
              <div className="border border-border rounded-lg bg-background p-3 font-mono text-[10px]">
                <p className="text-accent mb-1">// Zod-validated output</p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">medications</span>: [&#123; name: <span className="text-success">&quot;Metformin&quot;</span>,
                </p>
                <p className="text-muted-foreground pl-3">
                  dose: <span className="text-success">&quot;1000mg&quot;</span>, status: <span className="text-success">&quot;active&quot;</span>,
                </p>
                <p className="text-muted-foreground pl-3">
                  pageNumber: <span className="text-warning">2</span> &#125;]
                </p>
              </div>
            </div>

            <StepConnector />

            {/* Step 2: Knowledge Graph */}
            <div className="border border-accent/30 rounded-xl bg-surface p-5 flex flex-col ring-1 ring-accent/10">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-[10px] text-accent bg-accent-dim px-2 py-0.5 rounded">02</span>
                <span className="text-[13px] font-semibold text-foreground">Temporal Knowledge Graph</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 flex-1">
                Facts don&apos;t go into a flat database. They&apos;re ingested into a <span className="text-foreground">bi-temporal graph</span> where
                every entity — a medication, a lab result, a diagnosis — is a node with a <span className="text-foreground">valid-from</span> and{' '}
                <span className="text-foreground">valid-to</span> date. When a medication is discontinued,
                the graph knows it. When a lab value changes, the graph tracks the trend.
              </p>
              <div className="border border-border rounded-lg bg-background p-3 font-mono text-[10px] space-y-1">
                <p className="text-muted-foreground">
                  <span className="text-foreground">eGFR 65</span> <span className="text-accent">(2024-01 → 2024-06)</span>{' '}
                  <span className="text-warning">[SUPERSEDED]</span>
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">eGFR 51</span> <span className="text-accent">(2024-06 → 2025-01)</span>{' '}
                  <span className="text-warning">[SUPERSEDED]</span>
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">eGFR 47</span> <span className="text-accent">(2025-01 → present)</span>{' '}
                  <span className="text-success">[ACTIVE]</span>
                </p>
              </div>
            </div>

            <StepConnector />

            {/* Step 3: Multi-Layer Retrieval */}
            <div className="border border-border rounded-xl bg-surface p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-[10px] text-accent bg-accent-dim px-2 py-0.5 rounded">03</span>
                <span className="text-[13px] font-semibold text-foreground">3-Layer Retrieval</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 flex-1">
                Before generating anything, CareNote queries the graph with <span className="text-foreground">three concurrent retrievals</span>:
                longitudinal entity summaries, chronological episode replay, and MMR-reranked edge search with temporal invalidation.
                This isn&apos;t RAG over flat chunks — it&apos;s structured memory.
              </p>
              <div className="border border-border rounded-lg bg-background p-3 font-mono text-[10px] space-y-1">
                <p><span className="text-accent">Layer 1:</span> <span className="text-muted-foreground">Entity nodes (50 entities)</span></p>
                <p><span className="text-accent">Layer 2:</span> <span className="text-muted-foreground">Episodes (30 documents)</span></p>
                <p><span className="text-accent">Layer 3:</span> <span className="text-muted-foreground">Edge search (MMR λ=0.6)</span></p>
              </div>
            </div>

            <StepConnector />

            {/* Step 4: Cited Briefing */}
            <div className="border border-border rounded-xl bg-surface p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-[10px] text-accent bg-accent-dim px-2 py-0.5 rounded">04</span>
                <span className="text-[13px] font-semibold text-foreground">Source-Cited Briefing</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-4 flex-1">
                Gemini generates a structured briefing with inline <span className="text-foreground">[claim:cN]</span> tokens.
                Each claim maps to a source document UUID + page number. Click any citation chip and you&apos;re looking at the
                exact page of the original PDF. <span className="text-foreground">Zero trust required in the AI</span> — verify everything yourself.
              </p>
              <div className="border border-border rounded-lg bg-background p-3 font-mono text-[10px] space-y-1.5">
                <p className="text-muted-foreground">
                  Metformin 1000mg BID{' '}
                  <span className="bg-accent-dim text-accent px-1 py-0.5 rounded text-[9px]">Lab p.2</span>
                </p>
                <p className="text-muted-foreground">
                  eGFR declining: 65→47{' '}
                  <span className="bg-warning-dim text-warning px-1 py-0.5 rounded text-[9px]">Labs Mar</span>{' '}
                  <span className="bg-warning-dim text-warning px-1 py-0.5 rounded text-[9px]">Labs Sep</span>
                </p>
                <p className="text-muted-foreground">
                  Dose adjustment needed{' '}
                  <span className="bg-alert-dim text-alert px-1 py-0.5 rounded text-[9px]">Nephro p.3</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 3. WHY THIS MATTERS — concrete examples ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">What the graph catches</p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground">
              Things no single-document tool will ever find.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Cross-provider connection */}
            <div className="border border-border rounded-xl bg-surface p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-alert" />
                <p className="font-mono text-[10px] text-alert tracking-widest uppercase">Cross-provider conflict</p>
              </div>
              <p className="text-[13px] text-foreground font-medium mb-3">
                Cardiologist prescribes Drug A.<br />
                Nephrologist prescribes Drug B.<br />
                Neither knows about the other.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                CareNote&apos;s graph links both medications to the same patient.
                The briefing flags the interaction — with citations to both prescriptions, from two different providers, months apart.
              </p>
            </div>

            {/* Temporal trend */}
            <div className="border border-border rounded-xl bg-surface p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <p className="font-mono text-[10px] text-warning tracking-widest uppercase">18-month trend</p>
              </div>
              <p className="text-[13px] text-foreground font-medium mb-3">
                eGFR: 65 → 58 → 51 → 47<br />
                Across 4 lab reports.<br />
                From 2 different labs.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Each report in isolation looks unremarkable. The graph sees the trajectory — Stage 3b CKD progression —
                and flags that Metformin needs dose adjustment at eGFR &lt;45.
              </p>
            </div>

            {/* Notable absence */}
            <div className="border border-border rounded-xl bg-surface p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <p className="font-mono text-[10px] text-accent tracking-widest uppercase">Notable absence</p>
              </div>
              <p className="text-[13px] text-foreground font-medium mb-3">
                Patient on Metformin for 2 years.<br />
                Zero HbA1c results in any record.<br />
                No baseline monitoring documented.
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The graph knows the patient is on a diabetic medication but has no monitoring labs.
                The briefing marks this as a <span className="font-mono text-[10px] text-accent">NOTABLE_ABSENCE</span> — something a human reviewing individual PDFs would never catch.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 4. ON-DEMAND QUERY — the third mode ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">On-demand query</p>
              <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground mb-4">
                Ask anything about the full history.
              </h2>
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                Not a chatbot. A <span className="text-foreground">clinical query engine</span> backed by the full knowledge graph.
                Ask a question in plain English. Get an answer grounded in the actual records — with every fact cited to its source document and page.
              </p>
              <p className="text-[14px] text-muted-foreground leading-relaxed mb-6">
                Follow-up questions resolve pronouns against the previous turn. &ldquo;Why was that stopped?&rdquo; works because the graph
                knows which medication &ldquo;that&rdquo; refers to.
              </p>
              <div className="space-y-2">
                {[
                  'What medications changed after the hospital stay in March?',
                  'Has her kidney function been stable over the past year?',
                  'Are there any drug interactions between her current prescriptions?',
                ].map((q) => (
                  <div key={q} className="flex items-center gap-2 border border-border rounded-lg bg-background px-3 py-2">
                    <span className="text-muted-foreground text-[11px]">→</span>
                    <span className="text-[11px] text-foreground/80 italic">{q}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mock query result */}
            <div className="border border-border rounded-xl bg-surface overflow-hidden">
              <div className="border-b border-border px-4 py-2.5 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent" />
                <span className="font-mono text-[10px] text-muted-foreground">Clinical Query — Margaret Thompson</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="bg-background border border-border rounded-lg px-3 py-2">
                  <p className="text-[11px] text-foreground/70 italic">&ldquo;What medications changed after the hospital stay?&rdquo;</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    After the March 2025 admission, two changes were made:
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    <span className="font-medium">1.</span> Lisinopril increased from 10mg to 20mg daily{' '}
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">Discharge p.1</span>
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    <span className="font-medium">2.</span> Amlodipine 5mg added for persistent hypertension{' '}
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">Discharge p.2</span>{' '}
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">Follow-up p.1</span>
                  </p>
                  <p className="text-[12px] text-foreground/90 leading-relaxed">
                    Metformin remained unchanged at 1000mg BID{' '}
                    <span className="font-mono text-[9px] bg-accent-dim text-accent px-1.5 py-0.5 rounded">Discharge p.1</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ━━━ 5. VERSUS — honest comparison ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">Comparison</p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground">
              What&apos;s actually different.
            </h2>
          </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-4 sm:px-6 py-3 font-mono text-[10px] text-muted-foreground tracking-widest uppercase w-1/3">Capability</th>
                  <th className="px-4 sm:px-6 py-3 font-mono text-[10px] text-muted-foreground tracking-widest uppercase w-1/3">Typical AI Summarizer</th>
                  <th className="px-4 sm:px-6 py-3 font-mono text-[10px] text-accent tracking-widest uppercase w-1/3">CareNote</th>
                </tr>
              </thead>
              <tbody className="text-[12px]">
                {[
                  ['Memory across documents', 'None — each upload is isolated', 'Bi-temporal knowledge graph accumulates across all docs'],
                  ['Citation granularity', 'None or "from Document A"', 'Exact document UUID + page number per claim'],
                  ['Trend detection', 'Not possible with single docs', 'Automatic — graph tracks values over time'],
                  ['Drug interactions', 'Only within one prescription list', 'Cross-provider, cross-date detection'],
                  ['Notable absences', 'Cannot detect missing data', 'Flags expected monitoring gaps'],
                  ['Follow-up questions', 'Stateless — no context', 'Anaphora resolution against prior turns + full graph'],
                ].map(([cap, typical, carenote]) => (
                  <tr key={cap} className="border-b border-border last:border-0">
                    <td className="px-4 sm:px-6 py-3 text-foreground font-medium">{cap}</td>
                    <td className="px-4 sm:px-6 py-3 text-muted-foreground">{typical}</td>
                    <td className="px-4 sm:px-6 py-3 text-foreground">{carenote}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ━━━ 6. THE STACK — for the technical reader ━━━ */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
          <div className="text-center mb-12">
            <p className="font-mono text-[9px] tracking-widest text-accent uppercase mb-3">The stack</p>
            <h2 className="text-[24px] sm:text-[32px] font-semibold tracking-tight text-foreground">
              Built on infrastructure that matters.
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                name: 'Gemini 2.5 Flash',
                role: 'Multimodal extraction + briefing generation',
                detail: 'Reads PDFs visually. Outputs Zod-validated structured data. No OCR pipeline needed.',
              },
              {
                name: 'Zep Cloud',
                role: 'Bi-temporal knowledge graph',
                detail: 'Every fact has valid-from/valid-to dates. Superseded facts are automatically invalidated. Graph search with MMR reranking.',
              },
              {
                name: 'Neon Postgres',
                role: 'Serverless relational storage',
                detail: 'Drizzle ORM. Document metadata, briefing history, claim evidence chains. Scales to zero.',
              },
              {
                name: 'Vercel Blob',
                role: 'PDF storage',
                detail: 'Original documents preserved. Citation chips link directly to the stored PDF at the cited page.',
              },
            ].map((tech) => (
              <div key={tech.name} className="border border-border rounded-lg bg-surface p-4 sm:p-5">
                <p className="text-[13px] font-semibold text-foreground mb-1">{tech.name}</p>
                <p className="font-mono text-[10px] text-accent mb-2">{tech.role}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{tech.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ 7. CTA ━━━ */}
      <section id="demo" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 text-center">
          <h2 className="text-[24px] sm:text-[36px] font-semibold tracking-tight text-foreground mb-4">
            See the graph in action.
          </h2>
          <p className="text-[14px] sm:text-[15px] text-muted-foreground leading-relaxed max-w-lg mx-auto mb-8">
            Upload a few medical PDFs. Watch the knowledge graph build connections no human would catch.
            Read a briefing where every claim is traceable.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="#demo" className="group inline-flex items-center justify-center font-mono text-[12px] font-bold bg-accent text-background px-8 py-3.5 rounded-md hover:opacity-90 transition-opacity touch-manipulation">
              Book a Demo
              <Arrow />
            </Link>
            <Link href="/dashboard" className="inline-flex items-center justify-center font-mono text-[12px] text-muted-foreground border border-border px-8 py-3.5 rounded-md hover:text-foreground hover:border-foreground/30 transition-colors touch-manipulation">
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
            <span className="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase">CareNote</span>
            <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">v0.1</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/dashboard" className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors">Demo</Link>
            <span className="font-mono text-[10px] text-muted-foreground">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

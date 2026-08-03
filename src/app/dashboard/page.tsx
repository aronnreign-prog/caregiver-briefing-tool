import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/auth/actions'
import { addPatient } from '@/app/dashboard/actions'
import Link from 'next/link'

const DEMO_PATIENTS = [
  { id: 'demo-1', name: 'Margaret Thompson', relationship: 'Mother', date_of_birth: '1945-03-12', flagCount: 1, docCount: 3, briefingStatus: 'complete' },
  { id: 'demo-2', name: 'Robert Chen', relationship: 'Father', date_of_birth: '1948-07-24', flagCount: 0, docCount: 1, briefingStatus: 'pending' },
]

function calcAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

function initials(name: string) {
  return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = supabase ? (await supabase.auth.getUser()).data.user : null

  let caregiver: { id: string; name: string } | null = null
  let patients: { id: string; name: string; relationship: string; date_of_birth: string; flagCount?: number; docCount?: number; briefingStatus?: string }[] = []
  const isGuest = !user

  if (user && supabase) {
    const { data } = await supabase.from('caregivers').select('id, name').eq('auth_user_id', user.id).single()
    caregiver = data
    if (caregiver?.id) {
      const { data: patientData } = await supabase.from('patients').select('*').eq('caregiver_id', caregiver.id).order('created_at', { ascending: false })
      patients = patientData || []
    }
  } else {
    patients = DEMO_PATIENTS
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Top navbar ── */}
      <nav className="shrink-0 border-b border-border bg-surface flex items-center px-6 py-3 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-mono text-[11px] font-bold tracking-widest text-foreground uppercase">CareNote</span>
          <span className="font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">v0.1</span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {isGuest ? (
            <>
              <span className="font-mono text-[9px] text-muted-foreground border border-border px-2 py-1 rounded tracking-widest">GUEST MODE</span>
              <Link href="/login" className="font-mono text-[11px] text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="font-mono text-[11px] bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity font-semibold">
                Create account
              </Link>
            </>
          ) : (
            <form action={async () => { 'use server'; await logout() }}>
              <button type="submit" className="font-mono text-[11px] text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors">
                Sign out
              </button>
            </form>
          )}
        </div>
      </nav>

      {/* ── Body: sidebar + main ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-44 shrink-0 border-r border-border bg-surface flex flex-col overflow-hidden">

          <div className="flex-1 overflow-y-auto px-2 py-4">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-3 mb-2">Patients</p>
            {patients.map((p) => (
              <Link key={p.id} href={`/dashboard/patients/${p.id}`}
                className="group flex items-center gap-2.5 px-3 py-2.5 rounded-md hover:bg-surface-raised transition-colors">
                <div className="w-7 h-7 rounded-md bg-accent-dim border border-accent/25 flex items-center justify-center shrink-0 font-mono text-[10px] font-bold text-accent">
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-foreground truncate">{p.name}</p>
                  <p className="font-mono text-[9px] text-muted-foreground">{p.relationship} · {calcAge(p.date_of_birth)}y</p>
                </div>
                {(p.flagCount ?? 0) > 0 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-alert shrink-0" />
                )}
              </Link>
            ))}
            {patients.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted-foreground">No patients yet.</p>
            )}
          </div>

          {/* Bottom CTA */}
          <div className="border-t border-border p-3 shrink-0">
            {isGuest ? (
              <div>
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">Save your patients</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">Create a free account to add real patient records.</p>
                <Link href="/signup" className="flex items-center justify-center w-full bg-accent text-background font-mono text-[10px] font-semibold py-1.5 rounded hover:opacity-90 transition-opacity">
                  Create free account
                </Link>
              </div>
            ) : (
              <form action={async (fd: FormData) => { 'use server'; await addPatient(fd) }}>
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">Add patient</p>
                <div className="space-y-1.5">
                  <input name="name" placeholder="Full name" required
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                  <input name="relationship" placeholder="Relationship" required
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent" />
                  <input name="date_of_birth" type="date" required
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-[11px] text-foreground font-mono focus:outline-none focus:border-accent" />
                  <button type="submit" className="w-full bg-accent text-background font-mono text-[10px] font-semibold py-1.5 rounded hover:opacity-90 transition-opacity">
                    Add patient
                  </button>
                </div>
              </form>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-8 py-8">

          {/* Demo mode banner */}
          {isGuest && (
            <div className="mb-6 flex items-center gap-3 bg-warning-dim border border-warning/25 rounded-md px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              <p className="text-[12px] text-muted-foreground">
                <span className="text-warning-foreground font-mono text-[10px] tracking-widest uppercase mr-2">Demo mode</span>
                You&apos;re viewing sample patient data.{' '}
                <Link href="/signup" className="text-accent hover:underline">Create an account</Link>{' '}
                to manage your own records.
              </p>
            </div>
          )}

          {/* Page heading */}
          <div className="mb-6">
            <h1 className="text-[22px] font-semibold text-foreground tracking-tight">
              {isGuest ? 'Caregiver Briefing Tool' : caregiver?.name ?? 'My workspace'}
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {isGuest
                ? 'Upload medical documents. Get a verified, source-cited briefing for any appointment.'
                : `${patients.length} patient${patients.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {/* Patient cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-10">
            {patients.map((p) => (
              <Link key={p.id} href={`/dashboard/patients/${p.id}`} className="group block">
                <article className="border border-border bg-surface rounded-lg overflow-hidden hover:border-accent/40 hover:bg-surface-raised transition-all h-full flex flex-col">
                  {(p.flagCount ?? 0) > 0 && <div className="h-0.5 bg-alert w-full" />}
                  <div className="px-4 py-4 flex-1">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-accent-dim border border-accent/20 flex items-center justify-center shrink-0 font-mono text-[12px] font-bold text-accent">
                        {initials(p.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h2 className="text-[13px] font-semibold text-foreground truncate">{p.name}</h2>
                          {isGuest && <span className="font-mono text-[9px] border border-border text-muted-foreground px-1.5 py-0.5 rounded-sm shrink-0">DEMO</span>}
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {p.relationship} · DOB {p.date_of_birth} · Age {calcAge(p.date_of_birth)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {(p.flagCount ?? 0) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-alert" />
                          <span className="font-mono text-[10px] text-alert">{p.flagCount} concern{(p.flagCount ?? 0) !== 1 ? 's' : ''}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-success" />
                          <span className="font-mono text-[10px] text-muted-foreground">No flags</span>
                        </div>
                      )}
                      {p.briefingStatus && (
                        <span className={`ml-auto font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                          p.briefingStatus === 'complete'
                            ? 'text-success border-success/30 bg-success-dim'
                            : 'text-muted-foreground border-border'
                        }`}>
                          {p.briefingStatus === 'complete' ? 'BRIEFING READY' : 'NO BRIEFING'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">Open record</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all">
                      <path d="M2.5 6h7M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </article>
              </Link>
            ))}

            {!isGuest && patients.length === 0 && (
              <div className="col-span-full border border-dashed border-border rounded-lg p-12 text-center">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">No patients yet</p>
                <p className="text-[12px] text-muted-foreground">Add your first patient using the panel on the left.</p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div>
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-4">How it works</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
              {[
                { n: '01', title: 'Upload', body: 'Add lab reports, discharge summaries, prescriptions as PDFs.' },
                { n: '02', title: 'Extract', body: 'AI reads every document. Facts are dated and source-tagged.' },
                { n: '03', title: 'Analyse', body: 'Trends detected. Contraindications checked against DDInter.' },
                { n: '04', title: 'Briefing', body: 'One verified document, every claim cited by source and page.' },
              ].map(s => (
                <div key={s.n} className="bg-surface px-5 py-4">
                  <p className="font-mono text-[10px] text-accent mb-2">{s.n}</p>
                  <p className="text-[12px] font-semibold text-foreground mb-1">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}

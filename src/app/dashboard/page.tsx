import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/auth/actions'
import { addPatient } from '@/app/dashboard/actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

const DEMO_PATIENTS = [
  { id: 'demo-1', name: 'Margaret Thompson', relationship: 'Mother', date_of_birth: '1945-03-12' },
  { id: 'demo-2', name: 'Robert Chen', relationship: 'Father', date_of_birth: '1948-07-24' },
]

function calcAge(dob: string) {
  const diff = Date.now() - new Date(dob).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const user = supabase ? (await supabase.auth.getUser()).data.user : null

  let caregiver: { id: string; name: string } | null = null
  let patients: { id: string; name: string; relationship: string; date_of_birth: string }[] = []
  const isGuest = !user

  if (user && supabase) {
    const { data } = await supabase
      .from('caregivers')
      .select('id, name')
      .eq('auth_user_id', user.id)
      .single()
    caregiver = data

    if (caregiver?.id) {
      const { data: patientData } = await supabase
        .from('patients')
        .select('*')
        .eq('caregiver_id', caregiver.id)
        .order('created_at', { ascending: false })
      patients = patientData || []
    }
  } else {
    patients = DEMO_PATIENTS
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Top nav bar */}
      <header className="border-b border-border bg-surface flex items-center justify-between px-6 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="font-mono text-xs text-muted-foreground tracking-widest uppercase">CareNote</span>
          <span className="text-border mx-2">|</span>
          <span className="font-mono text-xs text-muted-foreground">v0.1</span>
        </div>
        <div className="flex items-center gap-4">
          {isGuest ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">GUEST MODE</span>
              <Link
                href="/login"
                className="font-mono text-xs border border-border text-muted-foreground hover:text-foreground hover:border-accent px-3 py-1.5 rounded transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="font-mono text-xs bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity"
              >
                Create account
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <span className="font-mono text-xs text-muted-foreground">{caregiver?.name || user?.email}</span>
              <form action={async () => { 'use server'; await logout() }}>
                <button
                  type="submit"
                  className="font-mono text-xs border border-border text-muted-foreground hover:text-foreground hover:border-border px-3 py-1.5 rounded transition-colors"
                >
                  Log out
                </button>
              </form>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="px-4 pt-6 pb-3">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-4">Patients</p>
            <nav className="flex flex-col gap-1">
              {patients.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/patients/${p.id}`}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded hover:bg-surface-raised transition-colors"
                >
                  <span className="w-6 h-6 rounded bg-accent-dim flex items-center justify-center shrink-0">
                    <span className="font-mono text-[10px] text-accent font-bold">
                      {p.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate leading-tight">{p.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{p.relationship} &middot; {calcAge(p.date_of_birth)}y</p>
                  </div>
                </Link>
              ))}
              {patients.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No patients yet.</p>
              )}
            </nav>
          </div>

          {/* Add patient form pinned to bottom of sidebar */}
          <div className="mt-auto border-t border-border p-4">
            {isGuest ? (
              <div className="space-y-2">
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase">Save your patients</p>
                <p className="text-xs text-muted-foreground leading-relaxed">Create a free account to add real patient records.</p>
                <Link
                  href="/signup"
                  className="block w-full text-center font-mono text-xs bg-accent text-background py-2 rounded hover:opacity-90 transition-opacity mt-3"
                >
                  Create free account
                </Link>
              </div>
            ) : (
              <form action={async (formData) => { 'use server'; await addPatient(formData) }}>
                <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-3">Add patient</p>
                <div className="space-y-2">
                  <Input
                    id="name" name="name" required
                    placeholder="Full name"
                    className="h-8 text-xs bg-surface-raised border-border font-sans"
                  />
                  <Input
                    id="relationship" name="relationship" required
                    placeholder="Relationship (e.g. Mother)"
                    className="h-8 text-xs bg-surface-raised border-border font-sans"
                  />
                  <Input
                    id="date_of_birth" name="date_of_birth" type="date" required
                    className="h-8 text-xs bg-surface-raised border-border font-mono"
                  />
                  <button
                    type="submit"
                    className="w-full font-mono text-xs bg-accent text-background py-2 rounded hover:opacity-90 transition-opacity"
                  >
                    Add patient
                  </button>
                </div>
              </form>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8">
          {isGuest && (
            <div className="mb-6 flex items-start gap-3 border border-warning/30 bg-warning-dim rounded px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
              <div>
                <p className="text-xs font-mono text-warning-foreground">DEMO MODE</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  You&apos;re viewing sample patient data. <Link href="/signup" className="text-accent hover:underline">Create an account</Link> to manage your own records.
                </p>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              {isGuest ? 'Caregiver Briefing Tool' : `${caregiver?.name || 'Dashboard'}`}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upload medical documents. Get a verified, source-cited briefing for any appointment.
            </p>
          </div>

          {/* Patient cards */}
          {patients.length === 0 ? (
            <div className="border border-dashed border-border rounded p-12 text-center">
              <p className="text-sm text-muted-foreground">No patients yet. Add one using the sidebar.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {patients.map((p) => (
                <Link key={p.id} href={`/dashboard/patients/${p.id}`} className="group block">
                  <article className="border border-border rounded bg-surface hover:border-accent/50 hover:bg-surface-raised transition-all p-5">
                    {/* Patient header */}
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-sm font-medium text-foreground leading-tight">{p.name}</h2>
                        <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                          {p.relationship} &middot; DOB {p.date_of_birth} &middot; Age {calcAge(p.date_of_birth)}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] border border-border text-muted-foreground px-2 py-0.5 rounded-sm">
                        {isGuest ? 'DEMO' : 'ACTIVE'}
                      </span>
                    </div>

                    {/* Pipeline hint */}
                    <div className="flex items-center gap-2 mt-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="font-mono text-[10px] text-muted-foreground">Open record</span>
                      </div>
                      <svg className="ml-auto w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}

          {/* How it works strip */}
          <div className="mt-12 border-t border-border pt-8">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-6">How it works</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border rounded overflow-hidden">
              {[
                { step: '01', label: 'Upload', desc: 'Add lab reports, discharge summaries, prescriptions as PDFs.' },
                { step: '02', label: 'Extract', desc: 'AI reads every document. Facts are dated and source-tagged.' },
                { step: '03', label: 'Analyse', desc: 'Trends detected. Contraindications checked against DDInter.' },
                { step: '04', label: 'Briefing', desc: 'One verified document, every claim cited by source and page.' },
              ].map(({ step, label, desc }) => (
                <div key={step} className="bg-surface px-5 py-5">
                  <p className="font-mono text-[10px] text-accent mb-2">{step}</p>
                  <p className="text-xs font-medium text-foreground mb-1">{label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

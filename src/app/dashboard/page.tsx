import Link from 'next/link'
import AddPatientForm from './AddPatientForm'
import SignOutButton from './SignOutButton'
import DeletePatientButton from './DeletePatientButton'
import { db } from '@/lib/db'
import { patients as patientsTable, caregivers } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession, getCaregiver } from '@/lib/auth-session'

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
  const session = await getSession()
  const user = session?.user

  let caregiver: { id: string; name: string } | null = null
  let patients: { id: string; name: string; relationship: string; date_of_birth: string; flagCount?: number; docCount?: number; briefingStatus?: string }[] = []
  const isGuest = !user

  if (user) {
    const cgData = await getCaregiver()
    caregiver = cgData
    if (caregiver?.id) {
      const patientData = await db.select({
        id: patientsTable.id,
        name: patientsTable.name,
        relationship: patientsTable.relationship,
        date_of_birth: patientsTable.date_of_birth
      }).from(patientsTable).where(eq(patientsTable.caregiver_id, caregiver.id)).orderBy(patientsTable.created_at)
      
      patients = patientData || []
    }
  } else {
    patients = DEMO_PATIENTS
  }

  return (
    <div className="h-screen bg-background flex overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">

        <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
          <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center shrink-0">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-mono text-[11px] font-bold tracking-widest text-foreground uppercase">CareNote</span>
          <span className="ml-auto font-mono text-[9px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">v0.1</span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-4">
          <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase px-3 mb-2">Patients</p>
          {patients.map((p) => (
            <div key={p.id} className="group relative flex items-center rounded-md hover:bg-surface-raised transition-colors">
              <Link href={`/dashboard/patients/${p.id}`}
                className="flex items-center gap-3 px-3 py-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-md bg-accent-dim border border-accent/25 flex items-center justify-center shrink-0 font-mono text-[11px] font-bold text-accent">
                  {initials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{p.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{p.relationship} · {calcAge(p.date_of_birth)}y</p>
                </div>
                {(p.flagCount ?? 0) > 0 && (
                  <div className="w-1.5 h-1.5 rounded-full bg-alert shrink-0" />
                )}
              </Link>
              {!isGuest && (
                <div className="pr-2">
                  <DeletePatientButton patientId={p.id} patientName={p.name} />
                </div>
              )}
            </div>
          ))}
          {patients.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No patients yet.</p>
          )}
        </div>

        <div className="border-t border-border p-4">
          {isGuest ? (
            <div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">Sign in to add patient records and upload documents.</p>
              <Link href="/signup" className="flex items-center justify-center w-full bg-accent text-background font-mono text-[11px] font-semibold py-2 rounded hover:opacity-90 transition-opacity">
                Create free account
              </Link>
              <Link href="/login" className="flex items-center justify-center w-full border border-border text-muted-foreground font-mono text-[11px] py-2 rounded hover:border-accent hover:text-foreground transition-colors mt-2">
                Sign in
              </Link>
            </div>
          ) : (
            <AddPatientForm />
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="shrink-0 border-b border-border bg-surface/60 backdrop-blur flex items-center justify-between px-6 py-3">
          <div>
            <h1 className="text-[13px] font-semibold text-foreground">
              {isGuest ? 'Demo workspace' : caregiver?.name ?? 'My workspace'}
            </h1>
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {isGuest ? 'Sample records — sign in to manage your own' : `${patients.length} patient${patients.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {!isGuest ? (
            <SignOutButton />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="font-mono text-[11px] text-muted-foreground border border-border px-3 py-1.5 rounded hover:text-foreground hover:border-foreground/30 transition-colors">
                Sign in
              </Link>
              <Link href="/signup" className="font-mono text-[11px] bg-accent text-background px-3 py-1.5 rounded hover:opacity-90 transition-opacity">
                Create account
              </Link>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">

          {isGuest && (
            <div className="mb-5 flex items-center gap-3 bg-warning-dim border border-warning/25 rounded-md px-4 py-3">
              <div className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
              <p className="text-[12px] text-muted-foreground">
                <span className="text-warning-foreground font-mono text-[10px] tracking-widest uppercase mr-2">Demo mode</span>
                Viewing sample data.{' '}
                <Link href="/signup" className="text-accent hover:underline">Create an account</Link>{' '}
                to manage real patient records.
              </p>
            </div>
          )}

          {/* Patient cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
            {patients.map((p) => (
              <div key={p.id} className="group relative block">
                <Link href={`/dashboard/patients/${p.id}`} className="block h-full">
                  <article className="border border-border bg-surface rounded-lg overflow-hidden hover:border-accent/40 hover:bg-surface-raised transition-all h-full flex flex-col">
                    {(p.flagCount ?? 0) > 0 && <div className="h-0.5 bg-alert w-full" />}
                    <div className="p-5 flex-1">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-accent-dim border border-accent/20 flex items-center justify-center shrink-0 font-mono text-[13px] font-bold text-accent">
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

                      <div className="mt-4 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-muted-foreground">
                            <rect x="1" y="1.5" width="9" height="8" rx="1" stroke="currentColor" strokeWidth="1.1"/>
                            <path d="M3.5 4.5h4M3.5 6.5h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                          </svg>
                          <span className="font-mono text-[10px] text-muted-foreground">{p.docCount ?? '0'} docs</span>
                        </div>
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
                    <div className="border-t border-border px-5 py-2.5 flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">Open record</span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all">
                        <path d="M2.5 6h7M6 2.5l3.5 3.5L6 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </article>
                </Link>
                {/* Delete button — only for authenticated users, appears on card hover */}
                {!isGuest && (
                  <div className="absolute top-2.5 right-2.5 z-10">
                    <DeletePatientButton patientId={p.id} patientName={p.name} />
                  </div>
                )}
              </div>
            ))}

            {patients.length === 0 && (
              <div className="col-span-full border border-dashed border-border rounded-lg p-12 text-center">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">No patients yet</p>
                <p className="text-[12px] text-muted-foreground">Add your first patient using the panel on the left.</p>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="border-t border-border pt-6">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-4">How it works</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border rounded-lg overflow-hidden border border-border">
              {[
                { n: '01', title: 'Upload', body: 'Lab reports, discharge summaries, prescriptions — any PDF from any provider.' },
                { n: '02', title: 'Extract', body: 'AI reads every page. Every fact is dated and tagged to its exact source quote.' },
                { n: '03', title: 'Analyse', body: 'Trends detected across months. Contraindications & drug interactions flagged.' },
                { n: '04', title: 'Briefing', body: 'One document. Every claim cited to source, page number, and date.' },
              ].map(s => (
                <div key={s.n} className="bg-surface px-5 py-4">
                  <p className="font-mono text-[10px] text-accent mb-2.5">{s.n}</p>
                  <p className="text-[12px] font-semibold text-foreground mb-1.5">{s.title}</p>
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

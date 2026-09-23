import Link from 'next/link'
import { redirect } from 'next/navigation'
import AddPatientForm from './AddPatientForm'
import SignOutButton from './SignOutButton'
import DeletePatientButton from './DeletePatientButton'
import { db } from '@/lib/db'
import { patients as patientsTable, documents as documentsTable, briefings as briefingsTable } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession, getCaregiver } from '@/lib/auth-session'

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

  if (!user) {
    redirect('/login')
  }

  const caregiver = await getCaregiver()
  if (!caregiver?.id) {
    redirect('/login')
  }

  const [patientRows, docRows, briefingRows] = await Promise.all([
    db.select({
      id: patientsTable.id,
      name: patientsTable.name,
      relationship: patientsTable.relationship,
      date_of_birth: patientsTable.date_of_birth,
    }).from(patientsTable).where(eq(patientsTable.caregiver_id, caregiver.id)).orderBy(patientsTable.created_at),

    db.select({
      id: documentsTable.id,
      patient_id: documentsTable.patient_id,
    }).from(documentsTable).where(eq(documentsTable.caregiver_id, caregiver.id)),

    db.select({
      id: briefingsTable.id,
      patient_id: briefingsTable.patient_id,
      status: briefingsTable.status,
      flagged_concerns: briefingsTable.flagged_concerns,
      created_at: briefingsTable.created_at,
    }).from(briefingsTable).where(eq(briefingsTable.caregiver_id, caregiver.id)).orderBy(briefingsTable.created_at),
  ])

  const patients = (patientRows || []).map((p) => {
    const pDocs = (docRows || []).filter((d) => d.patient_id === p.id)
    const pBriefings = (briefingRows || []).filter((b) => b.patient_id === p.id)
    const latestBriefing = pBriefings[pBriefings.length - 1]

    let flagCount = 0
    if (latestBriefing?.flagged_concerns && Array.isArray(latestBriefing.flagged_concerns)) {
      flagCount = latestBriefing.flagged_concerns.length
    }

    return {
      ...p,
      docCount: pDocs.length,
      flagCount,
      briefingStatus: latestBriefing?.status,
    }
  })

  return (
    <div className="min-h-[100dvh] md:h-screen bg-background flex flex-col md:flex-row overflow-x-hidden md:overflow-hidden">

      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-surface flex-col">

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
              <div className="pr-2">
                <DeletePatientButton patientId={p.id} patientName={p.name} />
              </div>
            </div>
          ))}
          {patients.length === 0 && (
            <p className="px-3 py-4 text-xs text-muted-foreground">No patients yet.</p>
          )}
        </div>

        <div className="border-t border-border p-4">
          <AddPatientForm />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="shrink-0 border-b border-border bg-surface/80 backdrop-blur flex items-center justify-between px-4 sm:px-6 py-3 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <div className="md:hidden flex items-center gap-2">
              <div className="w-5 h-5 bg-accent rounded-sm flex items-center justify-center shrink-0">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1.5 2.5h8M1.5 5.5h5.5M1.5 8.5h3.5" stroke="#0A0E14" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </div>
              <span className="font-mono text-[11px] font-bold tracking-widest text-foreground uppercase">CareNote</span>
            </div>
            <div>
              <h1 className="text-[12px] sm:text-[13px] font-semibold text-foreground">
                {caregiver?.name ?? 'My workspace'}
              </h1>
              <p className="font-mono text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
                {`${patients.length} patient${patients.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <SignOutButton />
        </header>

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 sm:py-6">
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
                          <h2 className="text-[13px] font-semibold text-foreground truncate">{p.name}</h2>
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
                {/* Delete button appears on card hover */}
                <div className="absolute top-2.5 right-2.5 z-10">
                  <DeletePatientButton patientId={p.id} patientName={p.name} />
                </div>
              </div>
            ))}

            {patients.length === 0 && (
              <div className="col-span-full border border-dashed border-border rounded-lg p-8 sm:p-12 text-center">
                <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-2">No patients yet</p>
                <p className="text-[12px] text-muted-foreground">Add your first patient using the form below or on the left.</p>
              </div>
            )}
          </div>

          {/* Mobile Add Patient Form */}
          <div className="md:hidden border border-border rounded-lg bg-surface p-4 mb-8">
            <AddPatientForm />
          </div>

          {/* How it works */}
          <div className="border-t border-border pt-6">
            <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-4">How it works</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-px bg-border rounded-lg overflow-hidden border border-border">
              {[
                { n: '01', title: 'Upload', body: 'Lab reports, discharge summaries, prescriptions — any PDF from any provider.' },
                { n: '02', title: 'Extract', body: 'AI reads every page. Every fact is dated and tagged to its exact source quote.' },
                { n: '03', title: 'Analyse', body: 'Trends detected across months. Contraindications & drug interactions flagged.' },
                { n: '04', title: 'Briefing', body: 'One document. Every claim cited to source, page number, and date.' },
              ].map(s => (
                <div key={s.n} className="bg-surface px-4 sm:px-5 py-3.5 sm:py-4">
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

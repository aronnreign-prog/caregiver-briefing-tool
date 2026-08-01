import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/auth/actions'
import { addPatient } from '@/app/dashboard/actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

const DEMO_PATIENTS = [
  { id: 'demo-1', name: 'Margaret Thompson', relationship: 'Mother', date_of_birth: '1945-03-12' },
  { id: 'demo-2', name: 'Robert Chen', relationship: 'Father', date_of_birth: '1948-07-24' },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let caregiver: { id: string; name: string } | null = null
  let patients: { id: string; name: string; relationship: string; date_of_birth: string }[] = []
  const isGuest = !user

  if (user) {
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
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Guest banner */}
        {isGuest && (
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            <span>You are browsing in guest mode. Data shown is for demonstration only.</span>
            <div className="flex gap-2 ml-4 shrink-0">
              <Link href="/login">
                <Button size="sm" variant="outline">Sign in</Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">Create account</Button>
              </Link>
            </div>
          </div>
        )}

        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {isGuest ? 'Caregiver Briefing Tool' : `Welcome, ${caregiver?.name || 'Caregiver'}`}
          </h1>
          {!isGuest && (
            <form action={async () => {
              'use server'
              await logout()
            }}>
              <Button variant="outline" type="submit">Log out</Button>
            </form>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <h2 className="text-2xl font-semibold text-foreground">
              {isGuest ? 'Demo Patients' : 'Your Patients'}
            </h2>

            {patients.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No patients added yet. Add one to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {patients.map((patient) => (
                  <Link key={patient.id} href={`/dashboard/patients/${patient.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader>
                        <CardTitle className="text-foreground">{patient.name}</CardTitle>
                        <CardDescription>{patient.relationship}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>Add Patient</CardTitle>
                <CardDescription>
                  {isGuest
                    ? 'Sign in to save your own patient profiles.'
                    : 'Create a profile to organize medical records.'}
                </CardDescription>
              </CardHeader>
              {isGuest ? (
                <CardFooter className="flex flex-col gap-2">
                  <Link href="/signup" className="w-full">
                    <Button className="w-full">Create free account</Button>
                  </Link>
                  <Link href="/login" className="w-full">
                    <Button variant="outline" className="w-full">Sign in</Button>
                  </Link>
                </CardFooter>
              ) : (
                <form action={async (formData) => {
                  'use server'
                  await addPatient(formData)
                }}>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input id="name" name="name" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date_of_birth">Date of Birth</Label>
                      <Input id="date_of_birth" name="date_of_birth" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="relationship">Relationship</Label>
                      <Input id="relationship" name="relationship" placeholder="e.g. Mother, Father" required />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" className="w-full">Add Patient</Button>
                  </CardFooter>
                </form>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

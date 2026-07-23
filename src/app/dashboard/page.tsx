import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/auth/actions'
import { addPatient } from '@/app/dashboard/actions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Fetch caregiver profile
  const { data: caregiver } = await supabase
    .from('caregivers')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .single()

  // Fetch patients
  const { data: patients } = await supabase
    .from('patients')
    .select('*')
    .eq('caregiver_id', caregiver?.id)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Welcome, {caregiver?.name || 'Caregiver'}
          </h1>
          <form action={async () => {
            'use server'
            await logout()
          }}>
            <Button variant="outline" type="submit">Log out</Button>
          </form>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <h2 className="text-2xl font-semibold">Your Patients</h2>
            {patients?.length === 0 ? (
              <Card>
                <CardContent className="p-6 text-center text-gray-500">
                  No patients added yet. Add one to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {patients?.map((patient) => (
                  <Link key={patient.id} href={`/dashboard/patients/${patient.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader>
                        <CardTitle>{patient.name}</CardTitle>
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
                <CardDescription>Create a profile to organize medical records.</CardDescription>
              </CardHeader>
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
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

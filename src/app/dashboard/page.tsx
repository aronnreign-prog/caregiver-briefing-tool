import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { logout } from '@/app/auth/actions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Fetch the caregiver profile
  const { data: caregiver, error: profileError } = await supabase
    .from('caregivers')
    .select('name')
    .eq('auth_user_id', user.id)
    .single()

  if (profileError) {
    console.error('Error fetching caregiver profile:', profileError)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Caregiver Dashboard
          </h1>
          <form action={logout}>
            <Button variant="outline" type="submit">Log out</Button>
          </form>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Welcome, {caregiver?.name || 'Caregiver'}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">
              You are securely logged in. From here, you can manage your patients and generate medical briefings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

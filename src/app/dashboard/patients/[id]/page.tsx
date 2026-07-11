import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import PatientDetailClient from './PatientDetailClient'

export default async function PatientPage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Await the params object before accessing properties (Next.js 15 requirement, though works in 14 too)
  const patientId = params.id

  // Fetch the patient (RLS ensures caregiver can only see their own patients)
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single()

  if (patientError || !patient) {
    notFound()
  }

  // Fetch initial documents for this patient
  const { data: documents } = await supabase
    .from('documents')
    .select('id, filename, status, uploaded_at')
    .eq('patient_id', patientId)
    .order('uploaded_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center space-x-4 mb-6">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">← Back to Dashboard</Button>
          </Link>
        </div>

        <header>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {patient.name}
          </h1>
          <p className="text-gray-600 mt-2">
            DOB: {new Date(patient.date_of_birth).toLocaleDateString()} • {patient.relationship}
          </p>
        </header>

        <PatientDetailClient patient={patient} initialDocuments={documents || []} />
      </div>
    </div>
  )
}

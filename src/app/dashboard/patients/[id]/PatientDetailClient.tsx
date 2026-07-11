'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type Document = {
  id: string
  filename: string
  status: string
  uploaded_at: string
}

export default function PatientDetailClient({ patient, initialDocuments }: { patient: any, initialDocuments: Document[] }) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Subscribe to real-time changes on the documents table for this patient
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `patient_id=eq.${patient.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setDocuments((prev) => [payload.new as Document, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setDocuments((prev) =>
              prev.map((doc) => (doc.id === payload.new.id ? (payload.new as Document) : doc))
            )
          } else if (payload.eventType === 'DELETE') {
            setDocuments((prev) => prev.filter((doc) => doc.id !== payload.old.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [patient.id, supabase])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be under 10MB.')
      return
    }

    setUploading(true)
    
    // 1. Upload to Supabase Storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${patient.id}/${Date.now()}.${fileExt}`
    
    const { error: uploadError } = await supabase.storage
      .from('medical_records')
      .upload(fileName, file)

    if (uploadError) {
      alert('Failed to upload file to storage: ' + uploadError.message)
      setUploading(false)
      return
    }

    // 2. Create row in documents table
    // (Note: In a full app, we might do this via a server action or trigger, but we'll do it from client here)
    const { data: { user } } = await supabase.auth.getUser()
    
    const { data: caregiver } = await supabase
      .from('caregivers')
      .select('id')
      .eq('auth_user_id', user?.id)
      .single()

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      patient_id: patient.id,
      caregiver_id: caregiver?.id,
      filename: file.name,
      storage_path: fileName,
      file_size: file.size,
      mime_type: file.type,
      status: 'uploaded'
    }).select().single()

    if (dbError) {
      alert('Failed to save document metadata: ' + dbError.message)
      setUploading(false)
      return
    }

    const { error: jobError } = await supabase.from('jobs').insert({
      job_type: 'process_document',
      payload: { document_id: docData.id, caregiver_id: caregiver?.id },
      status: 'queued'
    })

    if (jobError) {
      console.error('Failed to queue processing job:', jobError.message)
    }

    setUploading(false)
    e.target.value = '' // Reset input
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'uploaded': return 'bg-blue-100 text-blue-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'extracted': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6 mt-6">
      <Card>
        <CardHeader>
          <CardTitle>Medical Records</CardTitle>
          <CardDescription>Upload PDF documents for {patient.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            {uploading && <span className="text-sm text-gray-500">Uploading...</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {documents.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No documents uploaded yet.</p>
        ) : (
          documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex flex-col">
                  <span className="font-medium">{doc.filename}</span>
                  <span className="text-xs text-gray-500">
                    Uploaded on {new Date(doc.uploaded_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(doc.status)}`}>
                  {doc.status.toUpperCase()}
                </span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

'use client'

import { createClient } from '@/lib/supabase/client'
import type { Document } from '@/types/database'
import { useRouter } from 'next/navigation'

interface Props {
  patientId: string
  isDemo: boolean
  isGuest: boolean
  uploading: boolean
  onUploadStart: (uploading: boolean) => void
  onDocumentAdded: (doc: Document) => void
}

/** Deep module: one export, handles PDF upload to Supabase Storage + DB + job queue. */
export default function DocumentUploader({ patientId, isDemo, isGuest, uploading, onUploadStart, onDocumentAdded }: Props) {
  const router = useRouter()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createClient()
    if (!supabase || isGuest) { alert('Sign in to upload documents.'); return }
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { alert('Only PDF files are allowed.'); return }
    if (file.size > 10 * 1024 * 1024) { alert('File size must be under 10MB.'); return }

    onUploadStart(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { alert('Please sign in to upload.'); return }

      const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user.id).single()
      if (!caregiver?.id) { alert('Caregiver profile not found.'); return }

      const path = `${patientId}/${Date.now()}.${file.name.split('.').pop()}`
      const { error: uploadError } = await supabase.storage.from('medical_records').upload(path, file)
      if (uploadError) throw uploadError

      const { data: docData, error: dbError } = await supabase.from('documents').insert({
        patient_id: patientId,
        caregiver_id: caregiver.id,
        filename: file.name,
        storage_path: path,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
      }).select().single()

      if (dbError || !docData?.id) throw dbError || new Error('No document ID')

      onDocumentAdded(docData as Document)
      router.refresh()

      await supabase.from('jobs').insert({
        job_type: 'process_document',
        payload: { document_id: docData.id, caregiver_id: caregiver.id },
        status: 'queued'
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      alert('Upload failed: ' + msg)
    } finally {
      onUploadStart(false)
      e.target.value = ''
    }
  }

  if (isDemo || isGuest) return null

  return (
    <div>
      <label className="cursor-pointer">
        <input type="file" accept=".pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
        <span className="font-mono text-[10px] text-accent hover:text-foreground transition-colors">
          {uploading ? 'Uploading…' : '+ Upload'}
        </span>
      </label>
      <p className="font-mono text-[8px] text-muted-foreground mt-0.5 leading-tight">
        Upload one document per visit.<br />Combined PDFs lose per-visit dates.
      </p>
    </div>
  )
}

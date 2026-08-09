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
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const pdfs = files.filter(f => f.type === 'application/pdf')
    if (pdfs.length < files.length) alert('Skipping non-PDF files.')
    if (pdfs.length === 0) return

    const oversized = pdfs.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) { alert(`${oversized.length} file(s) exceed 10MB.`); return }

    onUploadStart(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { alert('Please sign in to upload.'); onUploadStart(false); return }

    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user.id).single()
    if (!caregiver?.id) { alert('Caregiver profile not found.'); onUploadStart(false); return }

    let ok = 0, err = 0
    for (const file of pdfs) {
      try {
        const path = `${patientId}/${Date.now()}_${ok}.${file.name.split('.').pop()}`
        const { error: uploadError } = await supabase.storage.from('medical_records').upload(path, file)
        if (uploadError) throw uploadError

        const { data: docData, error: dbError } = await supabase.from('documents').insert({
          patient_id: patientId, caregiver_id: caregiver.id, filename: file.name,
          storage_path: path, file_size: file.size, mime_type: file.type, status: 'uploaded',
        }).select().single()

        if (dbError || !docData?.id) throw dbError || new Error('No document ID')

        onDocumentAdded(docData as Document)
        ok++

        await supabase.from('jobs').insert({
          job_type: 'process_document', payload: { document_id: docData.id, caregiver_id: caregiver.id }, status: 'queued'
        })
      } catch (e: unknown) { err++; console.error(file.name, e) }
    }

    if (err > 0) alert(`Uploaded ${ok} of ${pdfs.length}. ${err} failed.`)
    router.refresh()
    onUploadStart(false)
    e.target.value = ''
  }

  if (isDemo || isGuest) return null

  return (
    <div>
      <label className="cursor-pointer">
        <input type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        <span className="font-mono text-[10px] text-accent hover:text-foreground transition-colors">
          {uploading ? 'Uploading…' : '+ Upload'}
        </span>
      </label>
      <p className="font-mono text-[8px] text-muted-foreground mt-0.5 leading-tight">
        One document per visit. Select multiple PDFs at once.
      </p>
    </div>
  )
}

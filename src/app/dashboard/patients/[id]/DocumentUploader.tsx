'use client'

import type { Document } from '@/types/database'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { ingestDocument, createDocumentRecord } from './pipeline-actions'

interface Props {
  patientId: string
  isDemo: boolean
  isGuest: boolean
  uploading: boolean
  onUploadStart: (uploading: boolean) => void
  onDocumentAdded: (doc: Document) => void
}

export default function DocumentUploader({ patientId, isDemo, isGuest, uploading, onUploadStart, onDocumentAdded }: Props) {
  const router = useRouter()

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isGuest) { alert('Sign in to upload documents.'); return }
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const pdfs = files.filter(f => f.type === 'application/pdf')
    if (pdfs.length < files.length) alert('Skipping non-PDF files.')
    if (pdfs.length === 0) return

    const oversized = pdfs.filter(f => f.size > 10 * 1024 * 1024)
    if (oversized.length > 0) { alert(`${oversized.length} file(s) exceed 10MB.`); return }

    onUploadStart(true)
    let ok = 0
    let err = 0

    for (const file of pdfs) {
      try {
        const blob = await upload(`${patientId}/${Date.now()}_${file.name}`, file, {
          access: 'public',
          handleUploadUrl: '/api/upload',
        })

        const result = await createDocumentRecord(patientId, file.name, blob.url, file.size, file.type)
        if (result.error || !result.id) throw new Error(result.error ?? 'No document ID')

        const docRecord: Document = {
          id: result.id,
          patient_id: patientId,
          caregiver_id: '',
          filename: file.name,
          blob_url: blob.url,
          file_size: String(file.size),
          mime_type: file.type,
          status: 'uploaded',
          uploaded_at: new Date().toISOString(),
        }
        onDocumentAdded(docRecord)
        ok++

        ingestDocument(result.id).catch(err => {
          console.error('[Upload] Ingest failed for', result.id, err)
        })
      } catch (e: unknown) {
        err++
        console.error(file.name, e)
      }
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
          {uploading ? 'Uploading...' : '+ Upload'}
        </span>
      </label>
      <p className="font-mono text-[8px] text-muted-foreground mt-0.5 leading-tight">
        One document per visit. Select multiple PDFs at once.
      </p>
    </div>
  )
}
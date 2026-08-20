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
  variant?: 'compact' | 'dropzone'
  onUploadStart: (uploading: boolean) => void
  onDocumentAdded: (doc: Document) => void
}

export default function DocumentUploader({
  patientId,
  isDemo,
  isGuest,
  uploading,
  variant = 'compact',
  onUploadStart,
  onDocumentAdded,
}: Props) {
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

  if (variant === 'dropzone') {
    return (
      <div className="mt-3">
        <label className="inline-flex flex-col items-center justify-center cursor-pointer">
          <input type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-background font-mono text-[11px] font-semibold hover:opacity-90 transition-opacity">
            {uploading ? (
              'Uploading...'
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Upload PDF
              </>
            )}
          </span>
        </label>
        <p className="font-mono text-[9px] text-muted-foreground mt-2">
          One document per visit · Select multiple PDFs
        </p>
      </div>
    )
  }

  return (
    <label className="cursor-pointer inline-flex items-center">
      <input type="file" accept=".pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
      <span className="font-mono text-[10px] text-accent hover:text-foreground transition-colors font-medium">
        {uploading ? 'Uploading...' : '+ Upload'}
      </span>
    </label>
  )
}
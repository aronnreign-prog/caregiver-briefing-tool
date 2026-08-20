'use client'

import type { Document } from '@/types/database'
import { deleteDocument } from '@/app/dashboard/actions'
import { PipelineBar } from './PipelineBar'
import DocumentUploader from './DocumentUploader'

interface Props {
  patientId: string
  documents: Document[]
  isDemo: boolean
  isGuest: boolean
  uploading: boolean
  onUploadStart: (v: boolean) => void
  onDocumentAdded: (doc: Document) => void
  onDocumentRemoved: (id: string) => void
  onDocClick: (e: React.MouseEvent, docId: string, page?: number) => void
}

/** Deep module: one export, renders document list with upload + delete. */
export default function DocumentList({
  patientId, documents, isDemo, isGuest, uploading,
  onUploadStart, onDocumentAdded, onDocumentRemoved, onDocClick,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase">Documents</p>
        <DocumentUploader
          patientId={patientId}
          isDemo={isDemo}
          isGuest={isGuest}
          uploading={uploading}
          onUploadStart={onUploadStart}
          onDocumentAdded={onDocumentAdded}
        />
      </div>

      {documents.length === 0 ? (
        <div className="border border-dashed border-border rounded-md p-5 text-center">
          <p className="text-[11px] text-muted-foreground">No documents yet.</p>
          {!isGuest && !isDemo && (
            <DocumentUploader
              patientId={patientId}
              isDemo={isDemo}
              isGuest={isGuest}
              uploading={uploading}
              onUploadStart={onUploadStart}
              onDocumentAdded={onDocumentAdded}
            />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id}
              className={`group relative border border-border rounded-md px-3 py-2.5 bg-surface-raised ${doc.blob_url && !isDemo ? 'hover:border-accent/40 cursor-pointer transition-colors' : ''}`}
              onClick={(e) => doc.blob_url && !isDemo ? onDocClick(e, doc.id) : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" className="text-muted-foreground shrink-0 mt-0.5">
                    <path d="M2 1h6l3 3v9a1 1 0 01-1 1H2a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" strokeWidth="1"/>
                    <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1"/>
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[11px] text-foreground font-mono truncate">{doc.filename}</p>
                    <p className="font-mono text-[9px] text-muted-foreground mt-0.5">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {!isDemo && !isGuest && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (confirm(`Delete document ${doc.filename}? This will remove its graph data.`)) {
                        const result = await deleteDocument(patientId, doc.id)
                        if (result?.error) { alert(`Failed to delete: ${result.error}`); return }
                        onDocumentRemoved(doc.id)
                      }
                    }}
                    title="Delete document and purge graph data"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-alert rounded"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M1.5 3h9M4.5 3V2h3v1M3 3l.5 7.5h5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
              <PipelineBar status={doc.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

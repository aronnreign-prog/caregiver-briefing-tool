'use client'

import { useState, useTransition } from 'react'
import { deletePatient } from './actions'

interface DeletePatientButtonProps {
  patientId: string
  patientName: string
}

export default function DeletePatientButton({ patientId, patientName }: DeletePatientButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [err, setErr] = useState<string | null>(null)

  function handleDeleteClick(e: React.MouseEvent) {
    e.preventDefault()   // don't navigate
    e.stopPropagation()
    setErr(null)
    setConfirming(true)
  }

  function handleCancel(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setConfirming(false)
    setErr(null)
  }

  function handleConfirm(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    startTransition(async () => {
      const result = await deletePatient(patientId)
      if (result?.error) {
        setErr(result.error)
        setConfirming(false)
      }
      // On success the server revalidates /dashboard — card disappears automatically
    })
  }

  if (confirming) {
    return (
      // Full-card overlay confirm dialog
      <div
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        className="absolute inset-0 z-10 bg-surface/95 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3 p-5"
      >
        <div className="w-8 h-8 rounded-full bg-alert/10 border border-alert/30 flex items-center justify-center mb-1">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-alert">
            <path d="M7 2v5M7 9.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="font-mono text-[10px] tracking-widest uppercase text-alert">Delete patient</p>
        <p className="text-[11px] text-center text-muted-foreground leading-relaxed max-w-[180px]">
          Remove <span className="text-foreground font-medium">{patientName}</span> and all their records? This cannot be undone.
        </p>
        {err && (
          <p className="font-mono text-[10px] text-alert text-center">{err}</p>
        )}
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="font-mono text-[10px] px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="font-mono text-[10px] px-3 py-1.5 rounded bg-alert text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            {isPending ? (
              <>
                <svg className="animate-spin" width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v2M5 7v2M1 5h2M7 5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Deleting…
              </>
            ) : 'Delete'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={handleDeleteClick}
      title={`Delete ${patientName}`}
      className="
        opacity-0 group-hover:opacity-100
        transition-opacity duration-150
        w-6 h-6 rounded flex items-center justify-center
        text-muted-foreground hover:text-alert hover:bg-alert/10
        border border-transparent hover:border-alert/20
        shrink-0
      "
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1.5 3h9M4.5 3V2h3v1M3 3l.5 7.5h5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

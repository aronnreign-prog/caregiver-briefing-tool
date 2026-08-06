'use client'

import { useEffect } from 'react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled page error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-full bg-alert-dim border border-alert/30 flex items-center justify-center mx-auto mb-4">
          <span className="font-mono text-lg text-alert">!</span>
        </div>
        <h1 className="text-[16px] font-semibold text-foreground mb-2">Something went wrong</h1>
        <p className="text-[12px] text-muted-foreground mb-6 leading-relaxed">
          An unexpected error occurred. This has been logged and we'll investigate.
        </p>
        <button
          onClick={reset}
          className="bg-accent text-background font-mono text-[11px] font-semibold px-5 py-2 rounded hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <p className="font-mono text-[9px] text-muted-foreground mt-6">
          {error.digest ? `Error ID: ${error.digest}` : error.message.slice(0, 100)}
        </p>
      </div>
    </div>
  )
}

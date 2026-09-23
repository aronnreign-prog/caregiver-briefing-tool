import React from 'react'
import type { FlaggedConcern } from './types'

export function FlaggedBanner({ concerns }: { concerns: FlaggedConcern[] }) {
  if (!concerns || concerns.length === 0) return null

  return (
    <div className="shrink-0 border-b border-alert/30 bg-alert-dim px-4 sm:px-5 py-2.5 sm:py-3">
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <span className="font-mono text-[9px] text-alert border border-alert/40 px-1.5 py-0.5 rounded tracking-widest uppercase">
            FLAGGED — RAISE WITH DOCTOR
          </span>
        </div>
        <div className="flex-1 space-y-1">
          {concerns.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className={`font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${
                  c.severity === 'high'
                    ? 'text-alert border-alert/40 bg-background/20'
                    : c.severity === 'medium'
                    ? 'text-warning border-warning/40'
                    : 'text-muted-foreground border-border'
                }`}
              >
                {c.severity.toUpperCase()}
              </span>
              <p className="text-[12px] text-foreground leading-relaxed">
                {c.description || c.concern}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

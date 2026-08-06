'use client'

import type { Document, Briefing } from '@/types/database'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'

const PIPELINE_STEPS = ['Uploaded', 'Extracting', 'Ready']

function pipelineStep(status: string): number {
  if (status === 'uploaded') return 0
  if (status === 'processing' || status === 'extracting') return 1
  if (status === 'extracted' || status === 'ready' || status === 'complete') return 2
  return 0
}

export function PipelineBar({ status }: { status: string }) {
  const step = pipelineStep(status)
  const failed = status === 'failed'
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {PIPELINE_STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          <div className={`w-1 h-1 rounded-full ${
            failed && i === step ? 'bg-alert' :
            i < step ? 'bg-success' :
            i === step ? 'bg-accent' :
            'bg-border'
          }`} />
          <span className={`font-mono text-[9px] ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          {i < PIPELINE_STEPS.length - 1 && <span className="text-border text-[9px]">·</span>}
        </div>
      ))}
    </div>
  )
}

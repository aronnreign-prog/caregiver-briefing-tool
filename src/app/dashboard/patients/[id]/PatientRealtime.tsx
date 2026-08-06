'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Document, Briefing } from '@/types/database'

interface Props {
  patientId: string
  isDemo: boolean
  onDocumentChange: React.Dispatch<React.SetStateAction<Document[]>>
  onBriefingChange: React.Dispatch<React.SetStateAction<Briefing[]>>
  onNewBriefing?: (id: string) => void
}

/** Deep module: subscribes to Supabase Realtime for live document+briefing updates. */
export default function PatientRealtime({ patientId, isDemo, onDocumentChange, onBriefingChange, onNewBriefing }: Props) {
  useEffect(() => {
    if (isDemo) return
    const supabase = createClient()

    const channel = supabase.channel('patient-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', filter: `patient_id=eq.${patientId}` }, (payload) => {
        if (payload.eventType === 'INSERT') onDocumentChange((prev: Document[]) => [payload.new as Document, ...prev])
        else if (payload.eventType === 'UPDATE') onDocumentChange((prev: Document[]) => prev.map(d => d.id === payload.new.id ? payload.new as Document : d))
        else if (payload.eventType === 'DELETE') onDocumentChange((prev: Document[]) => prev.filter(d => d.id !== payload.old.id))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefings', filter: `patient_id=eq.${patientId}` }, (payload) => {
        if (payload.eventType === 'INSERT') { onBriefingChange((prev: Briefing[]) => [payload.new as Briefing, ...prev]); onNewBriefing?.(payload.new.id) }
        else if (payload.eventType === 'UPDATE') onBriefingChange((prev: Briefing[]) => prev.map(b => b.id === payload.new.id ? payload.new as Briefing : b))
        else if (payload.eventType === 'DELETE') onBriefingChange((prev: Briefing[]) => prev.filter(b => b.id !== payload.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [patientId, isDemo, onDocumentChange, onBriefingChange, onNewBriefing])

  return null
}

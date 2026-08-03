'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { addPatient } from '@/app/dashboard/actions'

export default function AddPatientForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [dob, setDob] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('name', name)
      formData.append('relationship', relationship)
      formData.append('date_of_birth', dob)

      const result = await addPatient(formData)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
      } else {
        setName('')
        setRelationship('')
        setDob('')
        setLoading(false)
        router.refresh()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add patient'
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="font-mono text-[9px] tracking-widest text-muted-foreground uppercase mb-3">Add patient</p>
      {error && (
        <p className="font-mono text-[10px] text-alert border border-alert/30 bg-alert-dim px-2 py-1 rounded">{error}</p>
      )}
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        required
        className="w-full bg-background border border-border rounded px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
      />
      <input
        name="relationship"
        value={relationship}
        onChange={(e) => setRelationship(e.target.value)}
        placeholder="Relationship"
        required
        className="w-full bg-background border border-border rounded px-3 py-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent"
      />
      <input
        name="date_of_birth"
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        required
        className="w-full bg-background border border-border rounded px-3 py-2 text-[12px] text-foreground font-mono focus:outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-background font-mono text-[11px] font-semibold py-2 rounded hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
      >
        {loading ? 'Adding…' : 'Add patient'}
      </button>
    </form>
  )
}

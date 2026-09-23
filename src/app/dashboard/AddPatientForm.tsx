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
    <form onSubmit={handleSubmit} className="space-y-2.5">
      <p className="font-mono text-[9px] tracking-widest text-white/40 uppercase mb-3">Add patient profile</p>
      {error && (
        <div aria-live="polite" className="font-mono text-[10px] text-red-400 border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 rounded-lg">
          {error}
        </div>
      )}
      <input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        required
        className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2 text-[16px] sm:text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-colors"
      />
      <input
        name="relationship"
        value={relationship}
        onChange={(e) => setRelationship(e.target.value)}
        placeholder="Relationship (e.g. Mother, Father)"
        required
        className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2 text-[16px] sm:text-[12px] text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-colors"
      />
      <input
        name="date_of_birth"
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        required
        className="w-full bg-[#0A0E14] border border-[#1F2937] rounded-lg px-3 py-2 text-[16px] sm:text-[12px] text-white font-mono focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-colors"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full min-h-[38px] bg-white text-black font-medium text-[12px] py-2 rounded-lg hover:bg-white/90 transition-all disabled:opacity-50 cursor-pointer touch-manipulation focus-visible:ring-2 focus-visible:ring-white/60 outline-none"
      >
        {loading ? 'Adding…' : 'Add patient profile'}
      </button>
    </form>
  )
}

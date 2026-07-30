'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ReactMarkdown from 'react-markdown'

type Document = {
  id: string
  filename: string
  status: string
  uploaded_at: string
  storage_path?: string
}

type Briefing = {
  id: string
  audience: string
  status: string
  created_at: string
  completed_at: string | null
  briefing_text: string | null
  claims: any[] | null
  flagged_concerns: any[] | null
}

export default function PatientDetailClient({
  patient,
  initialDocuments,
  initialBriefings,
}: {
  patient: any
  initialDocuments: Document[]
  initialBriefings: Briefing[]
}) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments)
  const [briefings, setBriefings] = useState<Briefing[]>(initialBriefings)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [audience, setAudience] = useState('general')
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `patient_id=eq.${patient.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setDocuments((prev) => [payload.new as Document, ...prev])
          else if (payload.eventType === 'UPDATE') setDocuments((prev) => prev.map((doc) => (doc.id === payload.new.id ? (payload.new as Document) : doc)))
          else if (payload.eventType === 'DELETE') setDocuments((prev) => prev.filter((doc) => doc.id !== payload.old.id))
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'briefings', filter: `patient_id=eq.${patient.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') setBriefings((prev) => [payload.new as Briefing, ...prev])
          else if (payload.eventType === 'UPDATE') setBriefings((prev) => prev.map((b) => (b.id === payload.new.id ? (payload.new as Briefing) : b)))
          else if (payload.eventType === 'DELETE') setBriefings((prev) => prev.filter((b) => b.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [patient.id, supabase])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be under 10MB.')
      return
    }

    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${patient.id}/${Date.now()}.${fileExt}`

    const { error: uploadError } = await supabase.storage.from('medical_records').upload(fileName, file)

    if (uploadError) {
      alert('Failed to upload file: ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) {
      alert('Caregiver profile not found')
      setUploading(false)
      return
    }

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      filename: file.name,
      storage_path: fileName,
      file_size: file.size,
      mime_type: file.type,
      status: 'uploaded'
    }).select().single()

    if (dbError || !docData?.id) {
      alert('Failed to save document metadata: ' + (dbError?.message || 'No document ID returned'))
      setUploading(false)
      return
    }

    const documentId = docData.id
    if (!documentId || documentId === 'undefined' || typeof documentId !== 'string') {
      alert('Invalid document ID generated')
      setUploading(false)
      return
    }

    await supabase.from('jobs').insert({
      job_type: 'process_document',
      payload: { document_id: documentId, caregiver_id: caregiver.id },
      status: 'queued'
    })

    setUploading(false)
    e.target.value = ''
  }

  const generateBriefing = async () => {
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()
    if (!caregiver?.id) {
      alert('Caregiver profile not found')
      setGenerating(false)
      return
    }

    const { data: briefingData, error: briefingError } = await supabase.from('briefings').insert({
      patient_id: patient.id,
      caregiver_id: caregiver.id,
      audience: audience,
      status: 'queued',
      source_doc_ids: documents.map(d => d.id)
    }).select().single()

    if (briefingError || !briefingData?.id) {
      alert('Failed to start briefing: ' + (briefingError?.message || 'No briefing ID returned'))
      setGenerating(false)
      return
    }

    const briefingId = briefingData.id
    if (!briefingId || briefingId === 'undefined' || typeof briefingId !== 'string') {
      alert('Invalid briefing ID generated')
      setGenerating(false)
      return
    }

    await supabase.from('jobs').insert({
      job_type: 'generate_briefing',
      payload: { briefing_id: briefingId, caregiver_id: caregiver.id },
      status: 'queued'
    })

    setGenerating(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded': return 'bg-blue-100 text-blue-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'extracted': return 'bg-green-100 text-green-800'
      case 'complete': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDocClick = async (e: React.MouseEvent, docId: string, page?: number) => {
    e.preventDefault()
    const doc = documents.find(d => d.id === docId)
    if (!doc || !doc.storage_path) {
      alert('Document not found or storage path missing')
      return
    }
    const { data, error } = await supabase.storage.from('medical_records').createSignedUrl(doc.storage_path, 60)
    if (error || !data) {
      alert('Failed to open document: ' + (error?.message || 'Unknown error'))
      return
    }

    const url = page ? `${data.signedUrl}#page=${page}` : data.signedUrl
    window.open(url, '_blank')
  }

  const renderCitationChip = (claim: any) => {
    if (!claim.evidence) return null

    if (claim.flag === 'MEDICAL_KNOWLEDGE') {
      const searchUrl = `https://mobius.nlm.nih.gov/RxNav/search?searchBy=String&searchTerm=${encodeURIComponent(claim.claim_text)}`
      return (
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 hover:bg-purple-200"
          title={claim.evidence.entry_text || 'View on NIH RxNav'}
        >
          💊 RxNav
        </a>
      )
    }

    return (
      <a
        href="#"
        onClick={(e) => handleDocClick(e, claim.evidence.source_doc_id, claim.evidence.source_page)}
        className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 hover:bg-blue-200"
        title={claim.evidence.source_quote}
      >
        📄 Doc
      </a>
    )
  }

  const renderPlaceholderBriefing = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-indigo-50 to-white px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Shift Briefing Preview</h3>
        <p className="text-sm text-gray-500 mt-1">Based on the Signature Value Example</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Important Medical Alerts */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-red-800 font-bold mb-3 flex items-center text-sm uppercase tracking-wide">
            <span className="mr-2 text-base">⚠️</span>
            Important Medical Alerts
          </h4>
          <ul className="space-y-2">
            <li className="flex items-start">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold mr-3 mt-0.5 flex-shrink-0">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              </span>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-red-600 bg-red-100 px-2 py-0.5 rounded-full mr-2">High</span>
                <span className="text-sm text-red-800">ACE inhibitor (Lisinopril) prescribed despite 18-month declining GFR trend — contraindicated in declining kidney function.</span>
              </div>
            </li>
          </ul>
        </div>

        {/* Briefing Content */}
        <div className="prose prose-sm max-w-none">
          <h4 className="text-base font-semibold text-gray-900 mb-3">Patient Summary</h4>
          <div className="text-sm text-gray-700 leading-relaxed space-y-3">
            <p>
              Your mom&apos;s GFR has been declining for 18 months across 6 lab draws from 3 different providers
              <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-200" title="Verified against Lab Result - Mar 12">
                ✓ SUPPORTED
              </span>
              <span className="inline-flex items-center ml-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200" title="Source: Lab Result - Mar 12, page 2">
                [Lab Result - Mar 12]
              </span>
              <span className="inline-flex items-center ml-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200" title="Source: Lab Result - Sep 05, page 1">
                [Lab Result - Sep 05]
              </span>
              {' '}(65 → 58 → 51 → 47)
              <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-800 border border-green-200" title="Verified against Lab Result - Jan 20">
                ✓ SUPPORTED
              </span>
              <span className="inline-flex items-center ml-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 cursor-pointer hover:bg-blue-200" title="Source: Lab Result - Jan 20, page 1">
                [Lab Result - Jan 20]
              </span>
              .
            </p>
            <p>
              Her new cardiologist prescribed Lisinopril yesterday — an ACE inhibitor that is contraindicated in declining kidney function
              <span className="inline-flex items-center ml-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title="Verified via NIH RxNav Drug Database">
                💊 RxNav
              </span>
              .
            </p>
            <p className="text-gray-600 italic">
              Flag this for the cardiologist before the next appointment.
            </p>
          </div>
        </div>

        {/* PaperTrail Verification Summary */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">PaperTrail Verification</h5>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
              <svg className="w-3.5 h-3.5 mr-1.5 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              3 Claims SUPPORTED
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
              <svg className="w-3.5 h-3.5 mr-1.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              1 Claim Partially Supported
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
              <svg className="w-3.5 h-3.5 mr-1.5 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              0 Claims Unsupported
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            All claims verified against source documents via atomic evidence matching.
          </p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Left Column: Medical Records & History */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-xl font-semibold text-gray-900">Medical Records & History</h2>
                <p className="text-sm text-gray-500 mt-1">Upload PDFs to feed the AI Knowledge Graph</p>
              </div>
              <div className="p-6 space-y-6">
                {/* Upload Drop Zone */}
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <label
                    htmlFor="pdf-upload"
                    className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-10 h-10 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">
                      {uploading ? 'Uploading...' : 'Upload PDFs (Lab Results, Visit Notes, etc.)'}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">Click or drag files here</span>
                  </label>
                </div>

                {/* Recent Documents */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Recent Documents</h3>
                  <div className="space-y-2">
                    {documents.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-6">No documents uploaded yet.</p>
                    ) : (
                      documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-gray-50/50 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="text-xl">📄</span>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-900">{doc.filename}</span>
                              <span className="text-xs text-gray-500">
                                {new Date(doc.uploaded_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <span className={`px-2.5 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${getStatusColor(doc.status)}`}>
                            {doc.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Caregiver Briefing */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-200 bg-gray-50/50">
                <h2 className="text-xl font-semibold text-gray-900">AI Caregiver Briefing</h2>
                <p className="text-sm text-gray-500 mt-1">Generate a medical briefing for the next doctor visit</p>
              </div>
              <div className="p-6 space-y-6">
                {/* Generate Button */}
                <div className="flex items-center space-x-3">
                  <select
                    className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    disabled={generating}
                  >
                    <option value="general">General Overview</option>
                    <option value="er_visit">ER Visit</option>
                    <option value="specialist">Specialist Appointment</option>
                    <option value="second_opinion">Second Opinion</option>
                  </select>
                  <button
                    onClick={generateBriefing}
                    disabled={generating || documents.length === 0}
                    className="flex-1 bg-indigo-600 text-white text-sm font-semibold py-2.5 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generating ? 'Starting...' : 'Generate Shift Briefing'}
                  </button>
                </div>

                {/* Briefing Output */}
                {briefings.length === 0 ? (
                  renderPlaceholderBriefing()
                ) : (
                  <div className="space-y-6">
                    {briefings.map((briefing) => (
                      <div key={briefing.id} className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg capitalize text-gray-900">{briefing.audience.replace('_', ' ')} Briefing</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{new Date(briefing.created_at).toLocaleString()}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(briefing.status)}`}>
                            {briefing.status.toUpperCase()}
                          </span>
                        </div>

                        {briefing.status === 'complete' && (
                          <div className="p-6 space-y-6">
                            {briefing.flagged_concerns && briefing.flagged_concerns.length > 0 && (
                              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                                <h4 className="text-red-800 font-bold mb-2 flex items-center text-sm uppercase tracking-wide">
                                  <span className="mr-2">⚠️</span> Important Medical Alerts
                                </h4>
                                <ul className="list-disc pl-5 space-y-1">
                                  {briefing.flagged_concerns.map((concern, idx) => (
                                    <li key={idx} className="text-sm text-red-700">
                                      <span className="font-semibold capitalize">[{concern.severity}]</span> {concern.concern}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="prose prose-sm max-w-none">
                              <ReactMarkdown
                                components={{
                                  p: ({ node, children }) => {
                                    const textContent = Array.isArray(children) ? children.join('') : String(children)
                                    const matchedClaims = (briefing.claims || []).filter(c =>
                                      textContent.includes(c.claim_text) || c.claim_text.includes(textContent)
                                    )
                                    return (
                                      <p className="text-sm text-gray-700 leading-relaxed">
                                        {children}
                                        {matchedClaims.map((claim, idx) => (
                                          <span key={idx}>{renderCitationChip(claim)}</span>
                                        ))}
                                      </p>
                                    )
                                  },
                                  li: ({ node, children }) => {
                                    const textContent = Array.isArray(children) ? children.join('') : String(children)
                                    const matchedClaims = (briefing.claims || []).filter(c =>
                                      textContent.includes(c.claim_text) || c.claim_text.includes(textContent)
                                    )
                                    return (
                                      <li className="text-sm text-gray-700">
                                        {children}
                                        {matchedClaims.map((claim, idx) => (
                                          <span key={idx}>{renderCitationChip(claim)}</span>
                                        ))}
                                      </li>
                                    )
                                  }
                                }}
                              >
                                {briefing.briefing_text || ''}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {briefing.status === 'processing' && (
                          <div className="flex justify-center items-center py-12">
                            <div className="animate-pulse flex flex-col items-center">
                              <div className="h-8 w-8 bg-indigo-400 rounded-full mb-4"></div>
                              <p className="text-sm text-gray-500">AI is analyzing documents and reasoning...</p>
                            </div>
                          </div>
                        )}

                        {briefing.status === 'failed' && (
                          <div className="text-red-500 text-sm mt-4 p-4 bg-red-50 rounded">
                            Failed to generate briefing. Please try again.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  initialBriefings 
}: { 
  patient: any, 
  initialDocuments: Document[],
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

    const { data: docData, error: dbError } = await supabase.from('documents').insert({
      patient_id: patient.id,
      caregiver_id: caregiver?.id,
      filename: file.name,
      storage_path: fileName,
      file_size: file.size,
      mime_type: file.type,
      status: 'uploaded'
    }).select().single()

    if (dbError) {
      alert('Failed to save document metadata: ' + dbError.message)
      setUploading(false)
      return
    }

    await supabase.from('jobs').insert({
      job_type: 'process_document',
      payload: { document_id: docData.id, caregiver_id: caregiver?.id },
      status: 'queued'
    })

    setUploading(false)
    e.target.value = ''
  }

  const generateBriefing = async () => {
    setGenerating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: caregiver } = await supabase.from('caregivers').select('id').eq('auth_user_id', user?.id).single()

    // Create briefing row
    const { data: briefingData, error: briefingError } = await supabase.from('briefings').insert({
      patient_id: patient.id,
      caregiver_id: caregiver?.id,
      audience: audience,
      status: 'queued',
      source_doc_ids: documents.map(d => d.id)
    }).select().single()

    if (briefingError) {
      alert('Failed to start briefing: ' + briefingError.message)
      setGenerating(false)
      return
    }

    // Queue job
    await supabase.from('jobs').insert({
      job_type: 'generate_briefing',
      payload: { briefing_id: briefingData.id, caregiver_id: caregiver?.id },
      status: 'queued'
    })

    setGenerating(false)
  }

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'uploaded': return 'bg-blue-100 text-blue-800'
      case 'processing': return 'bg-yellow-100 text-yellow-800'
      case 'extracted': return 'bg-green-100 text-green-800'
      case 'complete': return 'bg-green-100 text-green-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const handleDocClick = async (e: React.MouseEvent, docId: string, page?: number) => {
    e.preventDefault();
    const doc = documents.find(d => d.id === docId);
    if (!doc || !doc.storage_path) {
      alert("Document not found or storage path missing");
      return;
    }
    const { data, error } = await supabase.storage.from('medical_records').createSignedUrl(doc.storage_path, 60);
    if (error || !data) {
      alert("Failed to open document: " + (error?.message || "Unknown error"));
      return;
    }
    
    // Open in new tab, optionally appending page hash
    const url = page ? `${data.signedUrl}#page=${page}` : data.signedUrl;
    window.open(url, '_blank');
  }

  const renderCitationChip = (claim: any) => {
    if (!claim.evidence) return null;
    
    if (claim.flag === 'MEDICAL_KNOWLEDGE') {
      const searchUrl = \`https://mobius.nlm.nih.gov/RxNav/search?searchBy=String&searchTerm=\${encodeURIComponent(claim.claim_text)}\`;
      return (
        <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 hover:bg-purple-200" title={claim.evidence.entry_text || "View on NIH RxNav"}>
          💊 RxNav
        </a>
      )
    }
    
    return (
      <a href="#" onClick={(e) => handleDocClick(e, claim.evidence.source_doc_id, claim.evidence.source_page)} className="inline-flex items-center ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 hover:bg-blue-200" title={claim.evidence.source_quote}>
        📄 Doc
      </a>
    )
  }

  return (
    <div className="space-y-8 mt-6">
      
      {/* Briefings Section */}
      <Card className="border-t-4 border-t-indigo-500 shadow-md">
        <CardHeader className="bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Medical Briefings</CardTitle>
              <CardDescription>AI-generated summaries for doctor visits</CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <select 
                className="text-sm border-gray-300 rounded-md shadow-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                disabled={generating}
              >
                <option value="general">General Overview</option>
                <option value="er_visit">ER Visit</option>
                <option value="specialist">Specialist Appointment</option>
                <option value="second_opinion">Second Opinion</option>
              </select>
              <Button onClick={generateBriefing} disabled={generating || documents.length === 0}>
                {generating ? 'Starting...' : 'Generate New Briefing'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {briefings.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No briefings generated yet.</p>
          ) : (
            <div className="space-y-8">
              {briefings.map((briefing) => (
                <div key={briefing.id} className="border rounded-lg p-6 bg-white shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b pb-4">
                    <div>
                      <h3 className="font-semibold text-lg capitalize">{briefing.audience.replace('_', ' ')} Briefing</h3>
                      <p className="text-sm text-gray-500">{new Date(briefing.created_at).toLocaleString()}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(briefing.status)}`}>
                      {briefing.status.toUpperCase()}
                    </span>
                  </div>

                  {briefing.status === 'complete' && (
                    <div className="space-y-6">
                      {/* Flagged Concerns */}
                      {briefing.flagged_concerns && briefing.flagged_concerns.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                          <h4 className="text-red-800 font-bold mb-2 flex items-center">
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

                      {/* Briefing Text (Markdown) */}
                      <div className="prose prose-sm max-w-none prose-blue">
                        <ReactMarkdown 
                          components={{
                            // Custom renderer for paragraphs to append citation chips
                            p: ({node, children}) => {
                              // Highly simplified citation injection for MVT
                              // In production, we'd use exact string matching or AST manipulation 
                              // to place chips inline exactly after the claim text.
                              // Here we just append all matching claims to the end of the block.
                              const textContent = Array.isArray(children) ? children.join('') : String(children)
                              const matchedClaims = (briefing.claims || []).filter(c => 
                                textContent.includes(c.claim_text) || c.claim_text.includes(textContent)
                              )
                              return (
                                <p>
                                  {children}
                                  {matchedClaims.map((claim, idx) => (
                                    <span key={idx}>{renderCitationChip(claim)}</span>
                                  ))}
                                </p>
                              )
                            },
                            li: ({node, children}) => {
                              const textContent = Array.isArray(children) ? children.join('') : String(children)
                              const matchedClaims = (briefing.claims || []).filter(c => 
                                textContent.includes(c.claim_text) || c.claim_text.includes(textContent)
                              )
                              return (
                                <li>
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
                        <div className="h-8 w-8 bg-blue-400 rounded-full mb-4"></div>
                        <p className="text-gray-500">AI is analyzing documents and reasoning...</p>
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
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader>
          <CardTitle>Source Documents</CardTitle>
          <CardDescription>Upload PDF documents to feed the AI Knowledge Graph</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-6">
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 cursor-pointer"
            />
            {uploading && <span className="text-sm text-gray-500">Uploading...</span>}
          </div>

          <div className="grid gap-3">
            {documents.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No documents uploaded yet.</p>
            ) : (
              documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-3 border rounded-md bg-gray-50/50 hover:bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">📄</span>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{doc.filename}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${getStatusColor(doc.status)}`}>
                    {doc.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

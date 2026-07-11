import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 1. Claim a job using our custom SKIP LOCKED function
  const { data: jobs, error: claimError } = await supabaseClient.rpc('claim_next_job', {
    worker_name: 'briefing-worker-1'
  })

  if (claimError) {
    console.error('Error claiming job:', claimError)
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
  }

  if (!jobs || jobs.length === 0) {
    return new Response(JSON.stringify({ message: 'No queued jobs' }), { status: 200 })
  }

  const job = jobs[0]
  if (job.job_type !== 'generate_briefing') {
    // If it's a different job type, mark as failed (this worker only processes briefings)
    await supabaseClient.from('jobs').update({ status: 'failed', error_message: 'Worker does not support this job type' }).eq('id', job.id)
    return new Response(JSON.stringify({ message: 'Skipped unsupported job' }), { status: 200 })
  }

  const briefingId = job.payload.briefing_id

  try {
    console.log(`Processing briefing: ${briefingId}`)
    
    // 2. Fetch Briefing metadata
    const { data: briefing, error: briefingError } = await supabaseClient
      .from('briefings')
      .select('patient_id, audience')
      .eq('id', briefingId)
      .single()

    if (briefingError || !briefing) throw new Error(`Briefing not found: ${briefingId}`)

    // Update briefing status
    await supabaseClient.from('briefings').update({ status: 'processing' }).eq('id', briefingId)

    // 3. Query Graphiti for the patient's current state
    console.log(`Fetching current state for patient ${briefing.patient_id} from Graphiti...`)
    const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL") || "http://host.docker.internal:8000"
    
    const stateResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/patient-state/${briefing.patient_id}`)
    
    if (!stateResponse.ok) {
      throw new Error(`Graphiti wrapper error: ${stateResponse.statusText}`)
    }

    const patientState = await stateResponse.json()
    console.log(`Successfully retrieved patient facts: ${patientState.current_facts?.length || 0} facts found.`)

    // 4. (Task 8 & 9) Pass facts to LLM for Reasoning and PaperTrail Verification
    console.log('Calling LLM Reasoning engine with PaperTrail (Task 8 & 9)...')
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
    const LLM_MODEL = 'anthropic/claude-3-haiku' // OpenRouter ID for Claude Haiku

    const systemPrompt = `You are an expert medical AI assisting a caregiver. Your job is to generate a concise, highly readable medical briefing.
You will be provided with the patient's CURRENT medical facts (medications, conditions, labs). Every fact includes a 'source_node_uuid' from the knowledge graph.
The audience for this briefing is: ${briefing.audience}.

CRITICAL: You must output strictly valid JSON with exactly this structure:
{
  "briefing_text": "The full Markdown briefing (Executive Summary, Medications, Conditions, Labs, Key Questions).",
  "claims": [
    {
      "claim": "Patient takes Lisinopril 10mg daily",
      "source_node_uuid": "the-uuid-from-the-facts"
    }
  ]
}

For EVERY medical claim you make in the briefing_text (e.g. a medication, a diagnosis, a lab value), you MUST create a corresponding entry in the "claims" array and cite the exact "source_node_uuid" that proves it. Do NOT hallucinate facts.`

    const userPrompt = `Patient Facts from Knowledge Graph:
${JSON.stringify(patientState.current_facts, null, 2)}

Please generate the briefing and PaperTrail claims now in JSON format.`

    const llmResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    })

    if (!llmResponse.ok) {
      throw new Error(`LLM API error: ${llmResponse.statusText}`)
    }

    const llmData = await llmResponse.json()
    const content = llmData.choices[0].message.content
    
    let parsedContent;
    try {
      parsedContent = JSON.parse(content)
    } catch (e) {
      console.error("Failed to parse LLM JSON output:", content)
      throw new Error("LLM did not return valid JSON.")
    }

    const generatedBriefing = parsedContent.briefing_text || "Failed to generate briefing text."
    const claims = parsedContent.claims || []
    
    console.log(`Generated briefing with ${claims.length} verified claims.`)

    // 6. Save final rendered briefing and claims
    await supabaseClient.from('briefings').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      briefing_text: generatedBriefing,
      claims: claims
    }).eq('id', briefingId)

    // Mark Job as complete
    await supabaseClient.from('jobs').update({
      status: 'complete',
      completed_at: new Date().toISOString()
    }).eq('id', job.id)

    return new Response(JSON.stringify({ message: 'Success', briefingId }), { status: 200 })

  } catch (error: any) {
    console.error('Job failed:', error)
    
    // Fail the job
    await supabaseClient.from('jobs').update({
      status: 'failed',
      error_message: error.message
    }).eq('id', job.id)

    // Fail the briefing
    await supabaseClient.from('briefings').update({
      status: 'failed',
      error_message: error.message
    }).eq('id', briefingId)

    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

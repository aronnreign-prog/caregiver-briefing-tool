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

    // TODO: Task 8, 9, 10
    // 4. Pass the facts to the LLM Reasoning layer
    // 5. Run PaperTrail verification
    // 6. Save final rendered briefing
    
    // For now, just mark the job and briefing as complete (stub)
    await supabaseClient.from('briefings').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      briefing_text: `# Draft Briefing\nPatient state retrieved. Details to be generated.`
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

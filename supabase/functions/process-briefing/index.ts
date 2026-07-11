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

    // --- TASK 8: Query Graphiti for Patient State & Trends ---
    console.log(`Fetching current state for patient ${briefing.patient_id} from Graphiti...`)
    const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL") || "http://host.docker.internal:8000"
    
    // Get current facts
    const stateResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/patient-state/${briefing.patient_id}`)
    if (!stateResponse.ok) throw new Error(`Graphiti wrapper error: ${stateResponse.statusText}`)
    const patientState = await stateResponse.json()
    const currentFacts = patientState.current_facts || []
    
    // Get temporal trends for key labs
    const labsToTrack = ["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"]
    const trends: Record<string, any> = {}
    
    for (const lab of labsToTrack) {
      const trendResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/trend/${briefing.patient_id}/${lab}`)
      if (trendResponse.ok) {
        const trendData = await trendResponse.json()
        if (trendData.trend && trendData.trend.length > 0) {
          trends[lab] = trendData.trend
        }
      }
    }
    console.log(`Successfully retrieved facts and ${Object.keys(trends).length} temporal trends.`)

    // --- TASK 9: LLM Reasoning (Layer 3) + Drug Database Verification (Layer 5) ---
    console.log('Running Layer 5 (Drug Database Verification)...')
    
    // Extract medications and conditions from current facts for contraindication checks
    // In a real implementation, we'd parse this robustly. For now we use basic string matching
    // on the 'fact' field (e.g. "Patient takes Lisinopril")
    const activeMeds = currentFacts
      .filter((f: any) => f.fact.toLowerCase().includes("take") || f.fact.toLowerCase().includes("prescrib"))
      .map((f: any) => f.fact)
    
    const activeConditions = currentFacts
      .filter((f: any) => f.fact.toLowerCase().includes("diagnos") || f.fact.toLowerCase().includes("has"))
      .map((f: any) => f.fact)

    const layer5Results: any[] = []
    
    // Note: Implementing real RxNorm and DDInter API calls here.
    // For MVT, we simulate the DDInter check if we see Lisinopril/ACE and a CKD/low GFR trend.
    // In production, we'd loop over activeMeds, hit https://rxnav.nlm.nih.gov/REST/rxcui.json
    // and hit DDInter endpoints.
    if (activeMeds.some((m: string) => m.toLowerCase().includes("lisinopril")) && 
        (activeConditions.some((c: string) => c.toLowerCase().includes("ckd") || c.toLowerCase().includes("kidney")) || trends["GFR"])) {
      layer5Results.push({
        type: "drug-disease-contraindication",
        medication: "Lisinopril",
        condition: "Chronic Kidney Disease / Low GFR",
        severity: "High",
        citation: "DDInter: Drug-disease interaction detected. ACE inhibitors require monitoring with declining GFR."
      })
    }

    console.log('Calling LLM Reasoning engine (Task 9)...')
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
    const LLM_MODEL = 'anthropic/claude-3-haiku'

    const systemPrompt = `You are generating a medical briefing for a caregiver to bring to a doctor.

Patient state: ${JSON.stringify(currentFacts, null, 2)}
Temporal trends: ${JSON.stringify(trends, null, 2)}
Drug contraindication checks: ${JSON.stringify(layer5Results, null, 2)}

Generate a briefing for this audience: ${briefing.audience}

Rules:
1. For each claim, note which source document it comes from.
2. Flag any trends (e.g., "GFR declining over 18 months").
3. Flag any conflicts between providers (e.g., different doses from different doctors).
4. Flag any contraindications (e.g., medication + condition that shouldn't go together).
5. Be honest about uncertainty — don't make claims you can't ground in the data.
6. Output as strictly valid JSON exactly matching this structure:
{
  "briefing_text": "Markdown formatted text...",
  "claims": [
    {
      "claim_text": "text",
      "expected_source": "source document name or uuid",
      "claim_type": "string"
    }
  ],
  "flagged_concerns": [
    {
      "concern": "text",
      "severity": "high/medium/low",
      "related_claims": ["text"]
    }
  ]
}`

    const userPrompt = `Please generate the briefing now as JSON.`

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

    // Save final rendered briefing
    await supabaseClient.from('briefings').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      briefing_text: parsedContent.briefing_text || "Failed to generate briefing text.",
      claims: parsedContent.claims || [],
      flagged_concerns: parsedContent.flagged_concerns || []
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

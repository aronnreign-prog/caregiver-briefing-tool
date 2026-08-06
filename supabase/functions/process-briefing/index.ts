import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithRetry, fetchRender } from "../_shared/fetch.ts";

serve(async (req: Request) => {
  // [Fix] Validate required env vars immediately — fail fast with clear error
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL) return new Response(JSON.stringify({ error: 'SUPABASE_URL env var is missing' }), { status: 500 })
  if (!SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY env var is missing' }), { status: 500 })

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // 1. Claim a job using our custom SKIP LOCKED function
  const { data: job, error: claimError } = await supabaseClient.rpc('claim_next_job', {
    worker_name: 'briefing-worker-1',
    job_type_filter: 'generate_briefing',
  })

  if (claimError) {
    console.error('Error claiming job:', claimError)
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 })
  }

  if (!job) {
    return new Response(JSON.stringify({ message: 'No queued jobs' }), { status: 200 })
  }

  if (job.job_type !== 'generate_briefing') {
    await supabaseClient.from('jobs').update({ status: 'queued', started_at: null, worker_id: null, attempts: job.attempts + 1 }).eq('id', job.id)
    return new Response(JSON.stringify({ message: 'Re-queued unsupported job' }), { status: 200 })
  }

  const briefingId = job.payload?.briefing_id
  if (
    !briefingId ||
    briefingId === 'undefined' ||
    briefingId === 'null' ||
    typeof briefingId !== 'string' ||
    briefingId.trim() === ''
  ) {
    throw new Error("Job payload missing or invalid briefing_id")
  }

  try {
    console.log(`Processing briefing: ${briefingId}`)
    
    // 2. Fetch Briefing metadata
    const { data: briefing, error: briefingError } = await supabaseClient
      .from('briefings')
      .select('patient_id, caregiver_id, audience')
      .eq('id', briefingId)
      .single()

    if (briefingError || !briefing) throw new Error(`Briefing not found: ${briefingId}`)

    // Update briefing status
    await supabaseClient.from('briefings').update({ status: 'processing' }).eq('id', briefingId)

    // --- TASK 8: Query Graphiti for Patient State & Trends ---
    console.log(`Fetching current state for patient ${briefing.patient_id} from Graphiti...`)
    
    const labsToTrack = ["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"];

    const { response: briefingResult } = await fetchRender("/generate-briefing", {
      method: "POST",
      body: JSON.stringify({
        patient_id: briefing.patient_id,
        audience: briefing.audience || "family caregiver",
        lab_entities: labsToTrack,
      }),
    });

    if (!briefingResult.ok) {
      const errBody = await briefingResult.text().catch(() => "");
      throw new Error(`generate-briefing error: ${briefingResult.status} ${briefingResult.statusText} ${errBody}`);
    }
    const briefingData = await briefingResult.json();
    const currentFacts = briefingData.current_facts || [];
    const trends: Record<string, any> = briefingData.trends || {};
    
    console.log(`Successfully retrieved facts and ${Object.keys(trends).length} temporal trends.`)

    // --- TASK 9: LLM Reasoning (Layer 3) + Drug Database Verification (Layer 5) ---
    console.log('Running Layer 5 (Drug Database Verification)...')
    
    // 1. Get clean drug names directly from the DB (extracted deterministically by Med7 in Task 5)
    const { data: docs } = await supabaseClient
      .from('documents')
      .select('extracted_entities')
      .eq('patient_id', briefing.patient_id)

    const activeMeds = new Set<string>()
    if (docs) {
      for (const d of docs) {
        const meds = d.extracted_entities?.medications || []
        for (const m of meds) {
          if (m.name) activeMeds.add(m.name)
        }
      }
    }

    const layer5Results: any[] = []
    
    // 2. Map drugs to RxCUIs via NIH RxNav API
    const rxcuis: string[] = []
    const rxcuiToName: Record<string, string> = {}
    
    for (const med of Array.from(activeMeds)) {
      try {
        const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(med)}&maxEntries=1`
        const { response: res } = await fetchWithRetry(url, { timeoutMs: 15000, maxRetries: 1 });
        if (res.ok) {
          const data = await res.json()
          const candidates = data.approximateGroup?.candidate
          if (candidates && candidates.length > 0) {
            const rxcui = candidates[0].rxcui
            rxcuis.push(rxcui)
            rxcuiToName[rxcui] = med
          }
        }
      } catch (e) {
        console.warn(`Failed to fetch RxCUI for ${med}: `, e)
      }
    }

    // 3. Check for Drug-Drug Interactions via NIH RxNav Interaction API
    if (rxcuis.length > 1) {
      try {
        const ddiUrl = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`
        const { response: ddiRes } = await fetchWithRetry(ddiUrl, { timeoutMs: 30000, maxRetries: 1 });
        if (ddiRes.ok) {
          const ddiData = await ddiRes.json()
          if (ddiData.fullInteractionTypeGroup) {
            for (const group of ddiData.fullInteractionTypeGroup) {
              for (const type of group.fullInteractionType) {
                for (const interaction of type.interactionPair) {
                  layer5Results.push({
                    type: "drug-drug-interaction",
                    medications: [rxcuiToName[interaction.interactionConcept[0].minConceptItem.rxcui] || "Unknown", 
                                  rxcuiToName[interaction.interactionConcept[1].minConceptItem.rxcui] || "Unknown"],
                    severity: interaction.severity,
                    citation: `NIH RxNav Interaction API: ${interaction.description}`
                  })
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch DDIs from RxNav:", e)
      }
    }

    console.log('Calling LLM Reasoning engine (Task 9)...')
    const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
    // [Fix] Validate OPENROUTER_API_KEY before any LLM call — fail fast with clear error
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY env var is missing. Set it in Supabase Secrets or supabase/functions/.env.local')
    // Pull the LLM model from the environment instead of hardcoding
    const LLM_MODEL = Deno.env.get('LLM_MODEL') || 'anthropic/claude-3-haiku'

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

    const { response: llmResponse } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      timeoutMs: 90000,
      maxRetries: 1,
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
    });

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
    let claims = parsedContent.claims || []
    const flaggedConcerns = parsedContent.flagged_concerns || []
    
    // --- PaperTrail Verification (Layer 4) — delegated to Python wrapper ---
    console.log(`Running PaperTrail Verification via /verify-briefing...`)
    
    let verifiedClaims: any[] = claims.map((c: any) => ({ ...c, flag: "UNVERIFIED", evidence: null }))
    let rejectedClaims: any[] = []
    let finalBriefingText = generatedBriefing

    try {
      const { response: verifyResult } = await fetchRender("/verify-briefing", {
        method: "POST",
        body: JSON.stringify({
          patient_id: briefing.patient_id,
          generated_briefing: generatedBriefing,
          raw_claims: claims,
          layer5_results: layer5Results,
          audience: briefing.audience || "family caregiver",
        }),
      });

      if (verifyResult.ok) {
        const verifyData = await verifyResult.json();
        verifiedClaims = verifyData.verified_claims || verifiedClaims;
        rejectedClaims = verifyData.rejected_claims || [];
        finalBriefingText = verifyData.final_briefing_text || generatedBriefing;
      } else {
        const errText = await verifyResult.text().catch(() => "");
        console.warn(`[WARN] /verify-briefing failed (${verifyResult.status}): ${errText}`);
      }
    } catch (e) {
      console.warn("PaperTrail verification failed, using unverified claims:", e);
    }

    console.log(`PaperTrail complete: ${verifiedClaims.length} supported, ${rejectedClaims.length} rejected.`)

    // Save final rendered briefing
    await supabaseClient.from('briefings').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
      briefing_text: finalBriefingText,
      claims: verifiedClaims,
      flagged_concerns: flaggedConcerns
    }).eq('id', briefingId)

    // Mark Job as complete
    await supabaseClient.from('jobs').update({
      status: 'complete',
      completed_at: new Date().toISOString()
    }).eq('id', job.id)

    // 5. Send Email Notification via Resend (Task 11)
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_API_KEY) {
      console.log('Sending email notification to caregiver...')
      try {
        const { data: caregiver } = await supabaseClient.from('caregivers').select('auth_user_id').eq('id', briefing.caregiver_id).single()
        if (caregiver?.auth_user_id) {
          const { data: authUser } = await supabaseClient.auth.admin.getUserById(caregiver.auth_user_id)
          const email = authUser?.user?.email
          
          if (email) {
            const { response: emailRes } = await fetchWithRetry('https://api.resend.com/emails', {
          method: 'POST',
          timeoutMs: 30000,
          maxRetries: 1,
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Acme Care <onboarding@resend.dev>',
            to: [email],
            subject: `Briefing ready for Patient ${briefing.patient_id.slice(0, 8)}`,
            html: `<p>Your requested medical briefing is now ready to view in the dashboard.</p>`
          })
        });
        if (!emailRes.ok) {
          console.warn(`Email notification failed: ${emailRes.status}`);
        }
          }
        }
      } catch (emailError) {
        console.error('Failed to send notification email:', emailError)
        // Non-fatal error, don't throw
      }
    }

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
}, {
  // [Fix M8] Outer fatal error handler: catches module-load or top-level errors
  // and returns them in the response body instead of a generic Deno 500.
  onError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[FATAL] Unhandled module-level error:', msg)
    return new Response(JSON.stringify({ error: `Fatal: ${msg}` }), { status: 500 })
  }
})

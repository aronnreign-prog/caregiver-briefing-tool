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
    
    // Get current facts
    const { response: stateResponse } = await fetchRender(`/patient-state/${briefing.patient_id}`);
    if (!stateResponse.ok) throw new Error(`Graphiti wrapper error: ${stateResponse.statusText}`)
    const patientState = await stateResponse.json()
    const currentFacts = patientState.current_facts || []
    
    // Get temporal trends for key labs
    const labsToTrack = ["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"];
    const trends: Record<string, any> = {};
    
    const trendPromises = labsToTrack.map(async (lab) => {
      try {
        const { response: trendResponse } = await fetchRender(
          `/trend/${briefing.patient_id}/${lab}`,
          { timeoutMs: 30000, maxRetries: 1 }
        );
        if (trendResponse.ok) {
          const trendData = await trendResponse.json();
          if (trendData.trend && trendData.trend.length > 0) {
            trends[lab] = trendData.trend;
          }
        } else {
          console.warn(`[WARN] /trend/${lab} returned ${trendResponse.status}`);
        }
      } catch (e) {
        console.warn(`[WARN] Failed to fetch trend for ${lab}:`, e);
      }
    });
    
    await Promise.allSettled(trendPromises);
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
    
    // --- TASK 10: PaperTrail Verification (Layer 4) ---
    console.log(`Running PaperTrail Verification...`)
    
    // Stage 1: Atomic Claim Decomposition
    const decomposeClaimsPrompt = `Decompose the following briefing into atomic claims. Each claim should be a single verifiable fact. 
    Briefing: ${generatedBriefing}
    Output as JSON array of {claim_id, claim_text, claim_type, expected_evidence}. 
    claim_type can be "source_document", "medical_knowledge", or "reasoning".`

    let atomicClaims: any[] = []
    try {
const { response: decompRes } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      timeoutMs: 60000,
      maxRetries: 1,
      headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: decomposeClaimsPrompt }]
      })
    });
      if (decompRes.ok) {
        const decompData = await decompRes.json()
        const parsed = JSON.parse(decompData.choices[0].message.content)
        atomicClaims = Array.isArray(parsed) ? parsed : (parsed.claims || [])
      }
    } catch (e) {
      console.warn("Failed to decompose claims:", e)
    }

    // Stage 2: Atomic Evidence Extraction
    // First, fetch the raw text of all documents for this patient
    const { data: sourceDocs } = await supabaseClient
      .from('documents')
      .select('id, extracted_text')
      .eq('patient_id', briefing.patient_id)
      
    let atomicEvidence: any[] = []
    
    if (sourceDocs && sourceDocs.length > 0) {
      for (const doc of sourceDocs) {
        if (!doc.extracted_text) continue;
        
        const extractEvidencePrompt = `Extract atomic evidence from the following source document text. Each evidence should be a single fact with the exact source quote. 
        Document text: ${doc.extracted_text}
        Output as JSON array of {evidence_id, evidence_text, source_quote, source_doc_id: "${doc.id}"}.`
        
        try {
          const { response: evRes } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        timeoutMs: 60000,
        maxRetries: 1,
        headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LLM_MODEL,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: extractEvidencePrompt }]
        })
      });
          if (evRes.ok) {
            const evData = await evRes.json()
            const parsedEv = JSON.parse(evData.choices[0].message.content)
            const extracted = Array.isArray(parsedEv) ? parsedEv : (parsedEv.evidence || parsedEv.atomic_evidence || [])
            atomicEvidence = atomicEvidence.concat(extracted)
          }
        } catch (e) {
          console.warn(`Failed to extract evidence for doc ${doc.id}:`, e)
        }
      }
    }

    // Stage 3 & 4: Claim-Evidence Matching & Flagging
    const verifiedClaims = []
    const rejectedClaims = []
    
    for (const claim of atomicClaims) {
      let flag = "UNSUPPORTED"
      let evidence = null
      
      // Strategy C: Medical Knowledge
      if (claim.claim_type === "medical_knowledge") {
        const isContraindication = layer5Results.find(res => 
          claim.claim_text.toLowerCase().includes(res.medications[0]?.toLowerCase()) || 
          claim.claim_text.toLowerCase().includes(res.medications[1]?.toLowerCase())
        )
        if (isContraindication) {
          flag = "MEDICAL_KNOWLEDGE"
          evidence = { source: "RxNav", entry_text: isContraindication.citation, match_type: "medical_knowledge" }
        }
      } 
      // Strategy A: String Match
      else {
        const expectedQuote = (claim.expected_evidence || claim.claim_text).toLowerCase()
        const matchedEv = atomicEvidence.find(ev => 
          (ev.source_quote && ev.source_quote.toLowerCase().includes(expectedQuote)) || 
          (ev.evidence_text && ev.evidence_text.toLowerCase().includes(expectedQuote))
        )
        
        if (matchedEv) {
          flag = "SUPPORTED"
          evidence = {
            source_doc_id: matchedEv.source_doc_id,
            source_quote: matchedEv.source_quote,
            match_type: "exact",
            confidence: 1.0
          }
        } 
        // Strategy B: Semantic Match
        else if (atomicEvidence.length > 0) {
          console.log(`String match failed for: "${claim.claim_text}". Running semantic match...`)
          const semanticPrompt = `Does the following evidence semantically support the claim? 
          Claim: ${claim.claim_text}
          Evidence Pool: ${JSON.stringify(atomicEvidence.map(e => e.evidence_text))}
          
          Respond ONLY with JSON: {"is_supported": true/false, "confidence": 0.0 to 1.0, "matching_fact": "the matching fact text"}`
          
          try {
            const { response: semanticResponse } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          timeoutMs: 60000,
          maxRetries: 1,
          headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_MODEL,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: semanticPrompt }]
          })
        });
            
            if (semanticResponse.ok) {
              const semanticData = await semanticResponse.json()
              const semanticResult = JSON.parse(semanticData.choices[0].message.content)
              if (semanticResult.is_supported && semanticResult.confidence > 0.8) {
                flag = "SUPPORTED"
                evidence = { source_doc_id: "semantic-match", source_quote: semanticResult.matching_fact, match_type: "semantic", confidence: semanticResult.confidence }
              } else if (semanticResult.is_supported && semanticResult.confidence >= 0.5) {
                flag = "PARTIALLY SUPPORTED"
                evidence = { source_doc_id: "semantic-match", source_quote: semanticResult.matching_fact, match_type: "semantic", confidence: semanticResult.confidence }
              }
            }
          } catch (e) {
            console.warn("Semantic match failed:", e)
          }
        }
      }
      
      const verifiedClaim = { ...claim, flag, evidence }
      
      if (flag === "UNSUPPORTED") {
        rejectedClaims.push(verifiedClaim)
        console.warn(`[REJECTED] Hallucination detected: ${claim.claim_text}`)
      } else {
        verifiedClaims.push(verifiedClaim)
      }
    }
    
    // Strip UNSUPPORTED claims from the briefing text
    let finalBriefingText = generatedBriefing
    for (const rejected of rejectedClaims) {
      finalBriefingText = finalBriefingText.replace(rejected.claim_text, "")
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
            subject: `Briefing ready for ${patientState.patient?.name || 'your patient'}`,
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

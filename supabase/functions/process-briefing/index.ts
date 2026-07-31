import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL) return new Response(JSON.stringify({ error: 'SUPABASE_URL env var is missing' }), { status: 500 });
    if (!SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY env var is missing' }), { status: 500 });

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Claim a job using safe SKIP LOCKED function
    const { data: claimed, error: claimError } = await supabaseClient.rpc('claim_next_job', {
      worker_name: 'briefing-worker-1'
    });

    if (claimError) {
      console.error('Error claiming job:', claimError);
      return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
    }

    if (!claimed) {
      return new Response(JSON.stringify({ message: 'No queued jobs' }), { status: 200 });
    }

    const job = claimed;
    if (job.job_type !== 'generate_briefing') {
      await supabaseClient.from('jobs').update({ status: 'failed', error_message: 'Worker does not support this job type' }).eq('id', job.id);
      return new Response(JSON.stringify({ message: 'Skipped unsupported job' }), { status: 200 });
    }

    const rawBriefingId = job.payload?.briefing_id;
    if (!rawBriefingId || typeof rawBriefingId !== 'string' || !UUID_REGEX.test(rawBriefingId)) {
      await supabaseClient.from('jobs').update({ status: 'failed', error_message: 'Job payload contains invalid briefing_id UUID' }).eq('id', job.id);
      return new Response(JSON.stringify({ error: 'Invalid briefing_id UUID in job payload', details: { briefing_id: rawBriefingId } }), { status: 400 });
    }
    const briefingId = rawBriefingId;

    try {
      console.log(`Processing briefing: ${briefingId}`);
      
      // 2. Fetch Briefing metadata
      const { data: briefing, error: briefingError } = await supabaseClient
        .from('briefings')
        .select('patient_id, caregiver_id, audience')
        .eq('id', briefingId)
        .single();

      if (briefingError || !briefing) throw new Error(`Briefing not found: ${briefingId}`);

      await supabaseClient.from('briefings').update({ status: 'processing' }).eq('id', briefingId);

      // --- TASK 8: Query Graphiti for Patient State & Trends ---
      console.log(`Fetching current state for patient ${briefing.patient_id} from Graphiti...`);
      const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL") || "https://caregiver-briefing-tool.onrender.com";
      
      const stateResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/patient-state/${briefing.patient_id}`);
      if (!stateResponse.ok) throw new Error(`Graphiti wrapper error: ${stateResponse.statusText}`);
      const patientState = await stateResponse.json();
      const currentFacts = patientState.current_facts || [];
      
      const labsToTrack = ["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"];
      const trends: Record<string, any> = {};
      
      for (const lab of labsToTrack) {
        const trendResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/trend/${briefing.patient_id}/${lab}`);
        if (trendResponse.ok) {
          const trendData = await trendResponse.json();
          if (trendData.trend && trendData.trend.length > 0) {
            trends[lab] = trendData.trend;
          }
        }
      }
      console.log(`Retrieved ${currentFacts.length} facts and ${Object.keys(trends).length} temporal trends.`);

      // --- TASK 9: LLM Reasoning (Layer 3) + Drug Database Verification (Layer 5) ---
      console.log('Running Layer 5 (Drug Database Verification)...');
      
      const { data: docs } = await supabaseClient
        .from('documents')
        .select('extracted_entities')
        .eq('patient_id', briefing.patient_id);

      const activeMeds = new Set<string>();
      if (docs) {
        for (const d of docs) {
          const meds = d.extracted_entities?.medications || [];
          for (const m of meds) {
            if (m.name) activeMeds.add(m.name);
          }
        }
      }

      const layer5Results: any[] = [];
      const rxcuis: string[] = [];
      const rxcuiToName: Record<string, string> = {};
      
      for (const med of Array.from(activeMeds)) {
        try {
          const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(med)}&maxEntries=1`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            const candidates = data.approximateGroup?.candidate;
            if (candidates && candidates.length > 0) {
              const rxcui = candidates[0].rxcui;
              rxcuis.push(rxcui);
              rxcuiToName[rxcui] = med;
            }
          }
        } catch (e) {
          console.warn(`Failed to fetch RxCUI for ${med}: `, e);
        }
      }

      if (rxcuis.length > 1) {
        try {
          const ddiUrl = `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`;
          const ddiRes = await fetch(ddiUrl);
          if (ddiRes.ok) {
            const ddiData = await ddiRes.json();
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
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("Failed to fetch DDIs from RxNav:", e);
        }
      }

      console.log('Calling LLM Reasoning engine (Task 9)...');
      const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
      if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY env var is missing');
      
      const LLM_MODEL_CHAIN = [
        Deno.env.get('LLM_MODEL'),
        'deepseek/deepseek-chat-v3.1',
        'openrouter/free',
        'anthropic/claude-3-haiku',
        'mistralai/mistral-7b-instruct:free',
      ].filter((m): m is string => !!m);

      const systemPrompt = `You are generating a medical briefing for a caregiver to bring to a doctor.

Patient state: ${JSON.stringify(currentFacts, null, 2)}
Temporal trends: ${JSON.stringify(trends, null, 2)}
Drug contraindication checks: ${JSON.stringify(layer5Results, null, 2)}

Generate a briefing for this audience: ${briefing.audience}

Rules:
1. For each claim, note which source document it comes from.
2. Flag any trends (e.g., "GFR declining over 18 months").
3. Flag any conflicts between providers.
4. Flag any contraindications.
5. Be honest about uncertainty — don't make claims you can't ground in the data.
6. Output as strictly valid JSON matching this schema:
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
}`;

      let llmResponse: Response | null = null;
      for (const modelName of LLM_MODEL_CHAIN) {
        llmResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelName,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Please generate the briefing now as JSON.` }
            ]
          })
        });

        if (llmResponse.ok) break;
        console.warn(`LLM model ${modelName} failed (${llmResponse.status}). Trying next fallback...`);
        llmResponse = null;
      }

      if (!llmResponse) throw new Error('All LLM models failed in model chain');

      const llmData = await llmResponse.json();
      const content = llmData.choices[0].message.content;
      
      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
      } catch (e) {
        console.error("Failed to parse LLM JSON output:", content);
        throw new Error("LLM did not return valid JSON.");
      }

      const generatedBriefing = parsedContent.briefing_text || "Failed to generate briefing text.";
      const claims = parsedContent.claims || [];
      const flaggedConcerns = parsedContent.flagged_concerns || [];
      
      // Save final rendered briefing
      await supabaseClient.from('briefings').update({
        status: 'complete',
        completed_at: new Date().toISOString(),
        briefing_text: generatedBriefing,
        claims: claims,
        flagged_concerns: flaggedConcerns
      }).eq('id', briefingId);

      await supabaseClient.from('jobs').update({
        status: 'complete',
        completed_at: new Date().toISOString()
      }).eq('id', job.id);

      return new Response(JSON.stringify({ message: 'Success', briefingId }), { status: 200 });

    } catch (error: any) {
      console.error('Job failed:', error);
      
      await supabaseClient.from('jobs').update({
        status: 'failed',
        error_message: error?.message || String(error)
      }).eq('id', job.id);

      await supabaseClient.from('briefings').update({
        status: 'failed',
        error_message: error?.message || String(error)
      }).eq('id', briefingId);

      return new Response(JSON.stringify({ error: error?.message || String(error) }), { status: 500 });
    }
  } catch (fatal: any) {
    return new Response(JSON.stringify({ error: 'Fatal Edge Function exception', details: fatal?.message || String(fatal) }), { status: 500 });
  }
}, {
  onError(error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[FATAL] Unhandled module-level error:', msg);
    return new Response(JSON.stringify({ error: `Fatal: ${msg}` }), { status: 500 });
  }
});

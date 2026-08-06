import { serve } from "https://deno.land/std@0.192.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchWithRetry, fetchRender } from "../_shared/fetch.ts";
import { ok, err, errStr, logTiming, type Result } from "../_shared/result.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY');
const LLM_MODEL = Deno.env.get('LLM_MODEL') || 'anthropic/claude-3-haiku';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const LABS_TO_TRACK = ["GFR", "Creatinine", "HbA1c", "LDL", "Hemoglobin"];

type SupaClient = ReturnType<typeof createClient>;

async function claimJob(client: SupaClient): Promise<Result<any>> {
  const t0 = Date.now();
  const { data, error } = await client.rpc('claim_next_job', { worker_name: 'briefing-worker-1', job_type_filter: 'generate_briefing' });
  logTiming("claim_next_job", t0);
  if (error) return err(error);
  if (!data) return ok(null);
  return ok(data);
}

async function fetchBriefing(client: SupaClient, briefingId: string): Promise<Result<any>> {
  const t0 = Date.now();
  const { data, error } = await client.from('briefings').select('patient_id, caregiver_id, audience').eq('id', briefingId).single();
  logTiming("briefings.select", t0);
  if (error || !data) return err(new Error(`Briefing not found: ${briefingId}`));
  return ok(data);
}

async function fetchPatientState(patientId: string): Promise<Result<any>> {
  const t0 = Date.now();
  const { response } = await fetchRender("/generate-briefing", {
    method: "POST",
    body: JSON.stringify({ patient_id: patientId, audience: "family caregiver", lab_entities: LABS_TO_TRACK }),
  });
  logTiming("generate-briefing (bulk)", t0);
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    return err(new Error(`generate-briefing: ${response.status} ${errBody}`));
  }
  return ok(await response.json());
}

async function fetchMedications(client: SupaClient, patientId: string): Promise<Result<Set<string>>> {
  const t0 = Date.now();
  const { data: docs } = await client.from('documents').select('extracted_entities').eq('patient_id', patientId);
  logTiming("documents.select meds", t0);
  const meds = new Set<string>();
  if (docs) {
    for (const d of docs) {
      for (const m of (d.extracted_entities?.medications || [])) {
        if (m.name) meds.add(m.name);
      }
    }
  }
  return ok(meds);
}

async function checkDrugInteractions(meds: Set<string>): Promise<Result<{ results: any[]; rxcuis: string[]; rxcuiToName: Record<string, string> }>> {
  const results: any[] = [];
  const rxcuis: string[] = [];
  const rxcuiToName: Record<string, string> = {};

  for (const med of Array.from(meds)) {
    try {
      const t0 = Date.now();
      const { response: res } = await fetchWithRetry(
        `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(med)}&maxEntries=1`,
        { timeoutMs: 15000, maxRetries: 1 }
      );
      logTiming(`rxnav ${med}`, t0);
      if (res.ok) {
        const data = await res.json();
        const candidates = data.approximateGroup?.candidate;
        if (candidates?.length > 0) {
          rxcuis.push(candidates[0].rxcui);
          rxcuiToName[candidates[0].rxcui] = med;
        }
      }
    } catch (e) { console.warn(`RxNav failed for ${med}:`, e); }
  }

  if (rxcuis.length > 1) {
    try {
      const t0 = Date.now();
      const { response: ddiRes } = await fetchWithRetry(
        `https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis=${rxcuis.join('+')}`,
        { timeoutMs: 30000, maxRetries: 1 }
      );
      logTiming("rxnav DDI", t0);
      if (ddiRes.ok) {
        const ddiData = await ddiRes.json();
        if (ddiData.fullInteractionTypeGroup) {
          for (const group of ddiData.fullInteractionTypeGroup) {
            for (const type of group.fullInteractionType) {
              for (const interaction of type.interactionPair) {
                results.push({
                  type: "drug-drug-interaction",
                  medications: [rxcuiToName[interaction.interactionConcept[0].minConceptItem.rxcui] || "Unknown",
                                rxcuiToName[interaction.interactionConcept[1].minConceptItem.rxcui] || "Unknown"],
                  severity: interaction.severity,
                  citation: `NIH RxNav: ${interaction.description}`
                });
              }
            }
          }
        }
      }
    } catch (e) { console.warn("DDI fetch failed:", e); }
  }

  return ok({ results, rxcuis, rxcuiToName });
}

async function generateBriefingLLM(currentFacts: any, trends: any, drugResults: any[], audience: string): Promise<Result<any>> {
  if (!OPENROUTER_API_KEY) return errStr("OPENROUTER_API_KEY is required");

  const systemPrompt = `You are generating a medical briefing for a caregiver to bring to a doctor.\n\nPatient state: ${JSON.stringify(currentFacts, null, 2)}\nTemporal trends: ${JSON.stringify(trends, null, 2)}\nDrug contraindication checks: ${JSON.stringify(drugResults, null, 2)}\n\nGenerate a briefing for this audience: ${audience}\n\nRules:\n1. For each claim, note which source document it comes from.\n2. Flag any trends (e.g., "GFR declining over 18 months").\n3. Flag any conflicts between providers.\n4. Flag any contraindications.\n5. Be honest about uncertainty.\n6. Output strictly valid JSON: { "briefing_text": "Markdown...", "claims": [{ "claim_text": "...", "expected_source": "...", "claim_type": "..." }], "flagged_concerns": [{ "concern": "...", "severity": "high/medium/low", "related_claims": ["..."] }] }`;

  const t0 = Date.now();
  const { response } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", timeoutMs: 90000, maxRetries: 1,
    headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL, response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: "Please generate the briefing now as JSON." }]
    })
  });
  logTiming("openrouter briefing", t0);
  if (!response.ok) return err(new Error(`LLM API error: ${response.statusText}`));

  const llmData = await response.json();
  try {
    return ok(JSON.parse(llmData.choices[0].message.content));
  } catch (e) {
    return err(new Error("LLM did not return valid JSON"));
  }
}

async function runPaperTrail(patientId: string, briefingText: string, claims: any[], drugResults: any[], audience: string): Promise<Result<any>> {
  const t0 = Date.now();
  const { response } = await fetchRender("/verify-briefing", {
    method: "POST",
    body: JSON.stringify({ patient_id: patientId, generated_briefing: briefingText, raw_claims: claims, layer5_results: drugResults, audience }),
  });
  logTiming("verify-briefing (PaperTrail)", t0);
  if (!response.ok) return err(new Error(`PaperTrail error: ${response.status}`));
  return ok(await response.json());
}

async function saveBriefing(client: SupaClient, briefingId: string, text: string, claims: any[], concerns: any[]): Promise<Result<void>> {
  const t0 = Date.now();
  const { error } = await client.from('briefings').update({
    status: 'complete', completed_at: new Date().toISOString(),
    briefing_text: text, claims, flagged_concerns: concerns
  }).eq('id', briefingId);
  logTiming("briefings.update", t0);
  if (error) return err(error);
  return ok(undefined);
}

async function completeJob(client: SupaClient, jobId: string): Promise<Result<void>> {
  const { error } = await client.from('jobs').update({ status: 'complete', completed_at: new Date().toISOString() }).eq('id', jobId);
  if (error) return err(error);
  return ok(undefined);
}

async function sendEmail(client: SupaClient, caregiverId: string): Promise<Result<void>> {
  if (!RESEND_API_KEY) return errStr("RESEND_API_KEY not configured")

  try {
    const { data: caregiver } = await client.from('caregivers').select('auth_user_id').eq('id', caregiverId).single()
    if (!caregiver?.auth_user_id) return errStr("Caregiver not found")

    const { data: authUser } = await client.auth.admin.getUserById(caregiver.auth_user_id)
    const email = authUser?.user?.email
    if (!email) return errStr("No email for caregiver")

    const t0 = Date.now()
    const { response } = await fetchWithRetry('https://api.resend.com/emails', {
      method: 'POST', timeoutMs: 30000, maxRetries: 1,
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Acme Care <onboarding@resend.dev>', to: [email],
        subject: 'Briefing ready — CareNote',
        html: '<p>Your requested medical briefing is now ready to view in the dashboard.</p>'
      })
    })
    logTiming("resend email", t0)
    if (!response.ok) return err(new Error(`Resend returned ${response.status}: ${await response.text().catch(() => '')}`))

    return ok(undefined)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(new Error(`Email send failed: ${msg}`))
  }
}
    }
  } catch (e) { console.error("Email error:", e); }
}

async function failJob(client: SupaClient, job: any, briefingId: string, message: string): Promise<void> {
  await Promise.allSettled([
    client.from('jobs').update({ status: 'failed', error_message: message }).eq('id', job?.id),
    client.from('briefings').update({ status: 'failed', error_message: message }).eq('id', briefingId),
  ]);
}

serve(async (req: Request) => {
  try {
    if (!SUPABASE_URL) return new Response(JSON.stringify({ error: 'SUPABASE_URL missing' }), { status: 500 });
    if (!SUPABASE_SERVICE_ROLE_KEY) return new Response(JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }), { status: 500 });

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const claimed = await claimJob(client);
    if (!claimed.ok) return new Response(JSON.stringify({ error: claimed.error.message }), { status: 500 });
    if (!claimed.value) return new Response(JSON.stringify({ message: 'No queued jobs' }), { status: 200 });

    const job = claimed.value;
    if (job.job_type !== 'generate_briefing') {
      await client.from('jobs').update({ status: 'queued', started_at: null, worker_id: null, attempts: job.attempts + 1 }).eq('id', job.id);
      return new Response(JSON.stringify({ message: 'Re-queued unsupported job' }), { status: 200 });
    }

    const briefingId = job.payload?.briefing_id;
    if (!briefingId || briefingId === 'undefined' || briefingId === 'null' || typeof briefingId !== 'string' || !briefingId.trim()) {
      return new Response(JSON.stringify({ error: "Missing or invalid briefing_id" }), { status: 400 });
    }

    const briefing = await fetchBriefing(client, briefingId);
    if (!briefing.ok) { await failJob(client, job, briefingId, briefing.error.message); return new Response(JSON.stringify({ error: briefing.error.message }), { status: 500 }); }

    await client.from('briefings').update({ status: 'processing' }).eq('id', briefingId);

    const state = await fetchPatientState(briefing.value.patient_id);
    if (!state.ok) { await failJob(client, job, briefingId, state.error.message); return new Response(JSON.stringify({ error: state.error.message }), { status: 500 }); }

    const medsResult = await fetchMedications(client, briefing.value.patient_id);
    const meds = medsResult.ok ? medsResult.value : new Set<string>();

    const drugResult = await checkDrugInteractions(meds);
    const { results: drugResults } = drugResult.value;

    const llmResult = await generateBriefingLLM(state.value.current_facts, state.value.trends, drugResults, briefing.value.audience);
    if (!llmResult.ok) { await failJob(client, job, briefingId, llmResult.error.message); return new Response(JSON.stringify({ error: llmResult.error.message }), { status: 500 }); }

    const briefingText = llmResult.value.briefing_text || "";
    const claims = llmResult.value.claims || [];
    const concerns = llmResult.value.flagged_concerns || [];

    const verified = await runPaperTrail(briefing.value.patient_id, briefingText, claims, drugResults, briefing.value.audience);

    let finalText = briefingText;
    let finalClaims = claims.map((c: any) => ({ ...c, flag: "UNVERIFIED", evidence: null }));
    let rejectedClaims: any[] = [];

    if (verified.ok) {
      finalText = verified.value.final_briefing_text || briefingText
      finalClaims = verified.value.verified_claims || finalClaims
      rejectedClaims = verified.value.rejected_claims || []
    } else {
      console.warn("PaperTrail verification FAILED — marking all claims UNVERIFIED:", verified.error.message)
      finalClaims = claims.map((c: any) => ({ ...c, flag: "UNVERIFIED", evidence: null }))
      finalText = briefingText + "\n\n---\n⚠ **Source verification was unavailable for this briefing.** Claims below have not been verified against source documents."
    }

    console.log(`PaperTrail: ${finalClaims.length} supported, ${rejectedClaims.length} rejected.`);

    await saveBriefing(client, briefingId, finalText, finalClaims, concerns);
    await completeJob(client, job.id);
    const emailResult = await sendEmail(client, briefing.value.caregiver_id);
    if (!emailResult.ok) console.error("[briefing] Email notification failed:", emailResult.error.message);

    return new Response(JSON.stringify({ message: 'Success', briefingId }), { status: 200 });

  } catch (error: any) {
    console.error('[FATAL]', error?.message || String(error));
    return new Response(JSON.stringify({ fatal_error: error?.message || String(error) }), { status: 500 });
  }
});
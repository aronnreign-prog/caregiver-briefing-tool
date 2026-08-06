import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry, fetchRender } from "../_shared/fetch.ts";
import { encodeBase64 } from "jsr:@std/encoding@^1/base64";
import { ok, err, errStr, logTiming, type Result } from "../_shared/result.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
const MODEL = Deno.env.get("METADATA_MODEL") || "meta-llama/llama-3.1-8b-instruct:free";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type SupabaseClient = ReturnType<typeof createClient>;

async function claimJob(client: SupabaseClient, workerName: string): Promise<Result<any>> {
  const t0 = Date.now();
  const { data, error } = await client.rpc("claim_next_job", {
    worker_name: workerName,
    job_type_filter: "process_document",
  });
  logTiming("claim_next_job", t0);
  if (error) return err(error);
  if (!data) return ok(null);
  return ok(data);
}

async function loadDocument(client: SupabaseClient, documentId: string): Promise<Result<{ storage_path: string; patient_id: string }>> {
  const t0 = Date.now();
  const { data, error } = await client
    .from("documents")
    .select("storage_path, patient_id")
    .eq("id", documentId)
    .single();
  logTiming("documents.select", t0);
  if (error || !data) return err(new Error(`Document not found: ${documentId}`));
  return ok(data);
}

async function downloadPdf(client: SupabaseClient, storagePath: string): Promise<Result<Uint8Array>> {
  const t0 = Date.now();
  const { data, error } = await client.storage.from("medical_records").download(storagePath);
  logTiming("storage.download", t0);
  if (error || !data) return err(new Error(`Failed to download file: ${error?.message}`));
  const arrayBuffer = await data.arrayBuffer();
  return ok(new Uint8Array(arrayBuffer));
}

async function processPdfBulk(pdfBase64: string, patientId: string, documentId: string): Promise<Result<{ extracted_text: string; extracted_entities: any }>> {
  const t0 = Date.now();
  const { response } = await fetchRender("/process-document", {
    method: "POST",
    body: JSON.stringify({
      pdf_base64: pdfBase64,
      patient_id: patientId,
      source_doc_id: documentId,
      source_doc_date: null,
      reference_time: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    return err(new Error(`process-document: ${response.status} ${errBody}`));
  }
  const data = await response.json();
  logTiming("process-document (bulk)", t0);
  if (!data.extracted_text) return err(new Error("PDF extraction returned no text"));
  return ok(data);
}

async function extractMetadata(text: string): Promise<Result<any>> {
  if (!OPENROUTER_API_KEY) return errStr("OPENROUTER_API_KEY is required");

  const t0 = Date.now();
  const { response } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    timeoutMs: 45000,
    maxRetries: 1,
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract metadata from this medical document as JSON.\nRequired fields:\n- document_date: ISO date (YYYY-MM-DD). Date of service/lab draw.\n- document_type: e.g. "lab result", "visit note", "prescription", "discharge summary".\n- provider_name: Name of the doctor/provider who wrote it.\nOutput valid JSON only.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  logTiming("openrouter metadata", t0);

  if (!response.ok) return ok({ document_date: null, document_type: "unknown", provider_name: "unknown" });
  const metaJson = await response.json();
  try {
    return ok(JSON.parse(metaJson?.choices?.[0]?.message?.content) || {});
  } catch {
    return ok({ document_date: null, document_type: "unknown", provider_name: "unknown" });
  }
}

async function saveResult(client: SupabaseClient, documentId: string, docData: any, metadata: any): Promise<Result<void>> {
  const t0 = Date.now();
  const { error } = await client.from("documents").update({
    extracted_text: docData.extracted_text,
    extracted_entities: docData.extracted_entities,
    document_date: metadata?.document_date ?? null,
    document_type: metadata?.document_type || "unknown",
    provider_name: metadata?.provider_name || "unknown",
    status: "extracted",
    processed_at: new Date().toISOString(),
  }).eq("id", documentId);
  logTiming("documents.update", t0);
  if (error) return err(error);
  return ok(undefined);
}

async function markComplete(client: SupabaseClient, jobId: string): Promise<Result<void>> {
  const t0 = Date.now();
  const { error } = await client.from("jobs").update({
    status: "complete",
    completed_at: new Date().toISOString(),
  }).eq("id", jobId);
  logTiming("jobs.update complete", t0);
  if (error) return err(error);
  return ok(undefined);
}

async function failJobAndDocument(client: SupabaseClient, jobId: string | null, documentId: string | null, message: string): Promise<void> {
  const tasks: Promise<any>[] = [];
  if (jobId) tasks.push(client.from("jobs").update({ status: "failed", error_message: message }).eq("id", jobId));
  if (documentId) tasks.push(client.from("documents").update({ status: "failed", error_message: message }).eq("id", documentId));
  await Promise.allSettled(tasks);
}

Deno.serve(async (req: Request) => {
  try {
    if (!SUPABASE_URL) return jsonResponse({ error: "SUPABASE_URL is required" }, 500);
    if (!SUPABASE_SERVICE_ROLE_KEY) return jsonResponse({ error: "SUPABASE_SERVICE_ROLE_KEY is required" }, 500);

    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const maybeJson = req.method === "POST" ? await req.json().catch(() => null) : null;
    const workerName = maybeJson?.worker_name ?? "edge-worker-1";

    const claimed = await claimJob(client, workerName);
    if (!claimed.ok) return jsonResponse({ error: claimed.error.message }, 500);
    if (!claimed.value) return jsonResponse({ message: "No queued jobs" }, 200);

    const job = claimed.value;
    let documentId: string | null = null;

    if (job.job_type !== "process_document") {
      await client.from("jobs").update({ status: "queued", started_at: null, worker_id: null, attempts: job.attempts + 1 }).eq("id", job.id);
      return jsonResponse({ message: "Re-queued unsupported job" }, 200);
    }

    const rawId = job.payload?.document_id;
    if (rawId == null || rawId === "undefined" || rawId === "null" || typeof rawId !== "string") {
      return jsonResponse({ error: "Job payload missing document_id" }, 400);
    }
    documentId = rawId;

    const doc = await loadDocument(client, documentId);
    if (!doc.ok) return jsonResponse({ error: doc.error.message }, 500);

    await client.from("documents").update({ status: "processing" }).eq("id", documentId);

    const pdfData = await downloadPdf(client, doc.value.storage_path);
    if (!pdfData.ok) { await failJobAndDocument(client, job.id, documentId, pdfData.error.message); return jsonResponse({ error: pdfData.error.message }, 500); }

    const pdfBase64 = encodeBase64(pdfData.value);

    const processed = await processPdfBulk(pdfBase64, doc.value.patient_id, documentId);
    if (!processed.ok) { await failJobAndDocument(client, job.id, documentId, processed.error.message); return jsonResponse({ error: processed.error.message }, 500); }

    const metadata = await extractMetadata(processed.value.extracted_text);
    const meta = metadata.value;

    const saved = await saveResult(client, documentId, processed.value, meta);
    if (!saved.ok) { await failJobAndDocument(client, job.id, documentId, saved.error.message); return jsonResponse({ error: saved.error.message }, 500); }

    const done = await markComplete(client, job.id);
    if (!done.ok) { await failJobAndDocument(client, job.id, documentId, done.error.message); return jsonResponse({ error: done.error.message }, 500); }

    return jsonResponse({ message: "Success", documentId }, 200);
  } catch (fatal: any) {
    console.error("[FATAL]", fatal?.message || String(fatal));
    return jsonResponse({ fatal_error: fatal?.message || String(fatal) }, 500);
  }
});
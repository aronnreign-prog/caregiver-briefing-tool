import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithRetry, fetchRender } from "../_shared/fetch.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
 try {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const maybeJson = req.method === "POST" ? await req.json().catch(() => null) : null;
  const workerName = maybeJson?.worker_name ?? "edge-worker-1";

  const { data: claimed, error: claimError } = await supabaseClient.rpc("claim_next_job", {
    worker_name: workerName,
    job_type_filter: "process_document",
  });

  if (claimError) {
    console.error("Error claiming job:", claimError);
    return jsonResponse({ error: claimError.message }, 500);
  }

  if (!claimed) {
    return jsonResponse({ message: "No queued jobs" }, 200);
  }

  const job = claimed;
  let documentId: string | number | null = null;

  try {
    if (job.job_type !== "process_document") {
      await supabaseClient
        .from("jobs")
        .update({ status: "queued", started_at: null, worker_id: null, attempts: job.attempts + 1 })
        .eq("id", job.id);
      return jsonResponse({ message: "Re-queued unsupported job" }, 200);
    }

    documentId = job.payload?.document_id;
    if (
      documentId == null ||
      documentId === "undefined" ||
      documentId === "null" ||
      typeof documentId !== "string"
    ) throw new Error("Job payload missing document_id");

    const { data: doc, error: docError } = await supabaseClient
      .from("documents")
      .select("storage_path, patient_id")
      .eq("id", documentId)
      .single();

    if (docError || !doc) throw new Error(`Document not found: ${documentId}`);

    await supabaseClient.from("documents").update({ status: "processing" }).eq("id", documentId);

    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from("medical_records")
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, Array.from(uint8.subarray(i, i + chunkSize)));
    }
    const pdfBase64 = btoa(binary);

    const { response: docResult } = await fetchRender("/process-document", {
      method: "POST",
      body: JSON.stringify({
        pdf_base64: pdfBase64,
        patient_id: doc.patient_id,
        source_doc_id: documentId,
        source_doc_date: null,
        reference_time: new Date().toISOString(),
      }),
    });

    if (!docResult.ok) {
      const errBody = await docResult.text().catch(() => "");
      throw new Error(`process-document error: ${docResult.status} ${docResult.statusText} ${errBody}`);
    }
    const docData = await docResult.json();
    const extractedText = docData.extracted_text || "";
    const extractedEntities = docData.extracted_entities || {};

    if (!extractedText) throw new Error("PDF extraction returned no text");

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");

    const MODEL = Deno.env.get("METADATA_MODEL") || "meta-llama/llama-3.1-8b-instruct:free";

    const { response: metaResponse } = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
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
          { role: "user", content: extractedText },
        ],
      }),
    });

    let metadata: any = {
      document_date: null,
      document_type: "unknown",
      provider_name: "unknown",
    };

    if (metaResponse.ok) {
      const metaDataJSON = await metaResponse.json();
      try {
        metadata = JSON.parse(metaDataJSON?.choices?.[0]?.message?.content);
      } catch {
        // keep defaults
      }
    }

    await supabaseClient.from("documents").update({
      extracted_text: extractedText,
      extracted_entities: extractedEntities,
      document_date: metadata?.document_date ?? null,
      document_type: metadata?.document_type || "unknown",
      provider_name: metadata?.provider_name || "unknown",
      status: "extracted",
      processed_at: new Date().toISOString(),
    }).eq("id", documentId);

    await supabaseClient.from("jobs").update({
      status: "complete",
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);

    return jsonResponse({ message: "Success", documentId }, 200);
  } catch (error: any) {
    console.error("Job failed:", error);

    if (job?.id != null) {
      await supabaseClient.from("jobs").update({
        status: "failed",
        error_message: error?.message || String(error),
      }).eq("id", job.id);
    }

    if (documentId != null) {
      await supabaseClient.from("documents").update({
        status: "failed",
        error_message: error?.message || String(error),
      }).eq("id", documentId);
    }

    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
  } catch (fatal: any) {
    return jsonResponse(
      { fatal_error: fatal?.message || String(fatal), stack: String(fatal?.stack || "") },
      500,
    );
  }
});
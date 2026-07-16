import { createClient } from "npm:@supabase/supabase-js@2";
import * as pdfjsLib from "npm:pdfjs-dist@3.11.174";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is required");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const maybeJson = req.method === "POST" ? await req.json().catch(() => null) : null;
  const workerName = maybeJson?.worker_name ?? "edge-worker-1";

  const { data: jobs, error: claimError } = await supabaseClient.rpc("claim_next_job", {
    worker_name: workerName,
  });

  if (claimError) {
    console.error("Error claiming job:", claimError);
    return jsonResponse({ error: claimError.message }, 500);
  }

  if (!jobs || jobs.length === 0) {
    return jsonResponse({ message: "No queued jobs" }, 200);
  }

  const job = jobs[0];
  let documentId: string | number | null = null;

  try {
    if (job.job_type !== "process_document") {
      await supabaseClient
        .from("jobs")
        .update({ status: "failed", error_message: "Worker does not support this job type" })
        .eq("id", job.id);
      return jsonResponse({ message: "Skipped unsupported job" }, 200);
    }

    documentId = job.payload?.document_id;
    if (documentId == null) throw new Error("Job payload missing document_id");

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

    const pdf = await (pdfjsLib as any).getDocument(uint8).promise;
    console.log(`PDF loaded. Pages: ${pdf.numPages}`);

    let fullRawText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullRawText += `\n--- Page ${i} ---\n${pageText}`;
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required");

    const MODEL = Deno.env.get("LAYER_1_VISION_MODEL") || "nvidia/nemotron-nano-12b-v2-vl:free";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `You are a medical document analyzer. Extract ALL text from this medical document.\nInclude:\n- All medications (name, dose, frequency, prescriber)\n- All lab values (test name, value, unit, reference range, date)\n- All diagnoses/conditions\n- All allergies\n- Provider names and specialties\n- Dates (of service, of lab draw, of prescription)\n- Patient demographics\nPreserve the structure. Output as structured text.`,
          },
          { role: "user", content: fullRawText },
        ],
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter API error: ${response.statusText}`);

    const data = await response.json();
    const extractedText = data?.choices?.[0]?.message?.content;
    if (!extractedText) throw new Error("OpenRouter response missing extracted text");

    const metaResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
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

    // NOTE (Rule M2): never fall back to now() for document_date. If the
    // model can't extract the real date of service, leave it null so the gap
    // is visible instead of falsified with the ingestion timestamp.
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

    const GRAPHITI_WRAPPER_URL = Deno.env.get("GRAPHITI_WRAPPER_URL") || "http://host.docker.internal:8000";

    const entityResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/extract-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: extractedText }),
    });

    let extractedEntities: any = { medications: [], lab_values: [] };
    if (entityResponse.ok) extractedEntities = await entityResponse.json();

    await supabaseClient.from("documents").update({
      extracted_text: extractedText,
      extracted_entities: extractedEntities,
      document_date: metadata?.document_date ?? null,
      document_type: metadata?.document_type || "unknown",
      provider_name: metadata?.provider_name || "unknown",
      status: "extracted",
      processed_at: new Date().toISOString(),
    }).eq("id", documentId);

    const graphitiResponse = await fetch(`${GRAPHITI_WRAPPER_URL}/add-facts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: doc.patient_id,
        episode_text: extractedText,
        source_doc_id: documentId,
        source_doc_date: metadata?.document_date ?? null,
        entities: [
          ...(extractedEntities?.medications || []),
          ...(extractedEntities?.lab_values || []),
        ],
        reference_time: new Date().toISOString(),
      }),
    });

    if (!graphitiResponse.ok) {
      throw new Error(`Graphiti wrapper error: ${graphitiResponse.statusText}`);
    }

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
});
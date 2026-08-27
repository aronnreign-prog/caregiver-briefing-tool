# Pipeline Orchestration Spec

> **End-to-End Pipeline in Pure TypeScript.**
> Executed via Next.js Server Actions with Google Gemini 2.5 Flash, Zep Cloud v2, Neon (Drizzle), and Vercel Blob.

---

## 1. Document Ingestion Pipeline

**Trigger:** Caregiver selects and uploads one or more PDF records in `DocumentUploader.tsx`.

```
User uploads PDF → Vercel Blob (client upload via /api/upload)
    ↓
Document row created via createDocumentRecord() (status: 'uploaded')
    ↓
DocumentUploader triggers ingestDocument(documentId) [Server Action]
    ↓
1. Download PDF Buffer:
   fetch(doc.blob_url) -> Buffer from raw file arrayBuffer
    ↓
2. Gemini 2.5 Flash Multimodal Extraction (src/lib/ai/extract.ts):
   extractClinicalFacts(pdfBuffer, filename) -> ClinicalExtractionSchema
   Extracts:
   - documentDate & documentType
   - medications (name, dose, frequency, prescribedDate)
   - lab_values (name, value, unit, date)
   - conditions (name, status)
    ↓
3. Zep Cloud Memory Ingestion (src/lib/zep/ingest.ts):
   ingestDocumentFacts(caregiverId, patientId, documentId, filename, extraction)
   Calls Zep client.graph.add({ data, type: 'text', userId })
   userId format: "caregiver-{caregiverId}-patient-{patientId}"
    ↓
4. Neon Database Update:
   documents table updated with status: 'extracted', document_date, document_type,
   processed_at timestamp.
```

---

## 2. Briefing Generation Pipeline

**Trigger:** Caregiver clicks "Generate Briefing" and selects an audience target (Specialist, GP, Family, ER, Second Opinion) in `PatientDetailClient.tsx`.

```
User clicks "Generate Briefing"
    ↓
Briefings row created via createBriefingRecord() (status: 'queued')
    ↓
PatientDetailClient calls generateBriefing(patientId, briefingId, audience) [Server Action]
    ↓
1. Query Patient Memory (src/lib/zep/ingest.ts):
   buildZepQuery(audience) -> Dynamic targeted query based on audience (ER, Specialist, GP, etc.)
   queryPatientMemory(caregiverId, patientId, zepQuery):
   - Layer 1: Longitudinal Entity Summaries via client.graph.node.getByUserId(userId) (uncapped timeline backstop)
   - Layer 2: Chronological Episodes via client.graph.episode.getByUserId(userId, { lastn: 30 }) (with [doc_id] & [page] tags)
   - Layer 3: Concurrent Multi-Domain Search via Promise.allSettled(client.graph.search({ query, userId })) (with [valid_from] & [SUPERSEDED] temporal invalidation tags)
   Fallback: If Zep memory is empty, automatically re-extracts from Vercel Blob PDFs and rebuilds Zep graph memory.
    ↓
2. Structured Synthesis via Gemini 2.5 Flash:
   generateObject({
     model: google('gemini-2.5-flash'),
     schema: BriefingOutputSchema,
     system: Clinical Triage & Synthesis prompt adapted to audience target + multi-trend & PaperTrail instructions,
     messages: Patient header + 3-layer clinical context facts
   })
   Returns structured object:
   - briefing_text (Markdown clinical summary with inline [claim:cN] tokens)
   - claims (array of claim_text, claim_type, flag, evidence[])
   - flagged_concerns (array of concern, severity, related_claims)
    ↓
3. Neon Database Update:
   briefings table updated with status: 'complete', briefing_text, claims,
   flagged_concerns, completed_at timestamp.
```

---

## 3. Error Handling & Recovery

- **Document Ingestion Failure**:
  If Gemini extraction or Blob download fails, document status is set to `'failed'` and `error_message` is populated. Zep ingestion failures are logged non-fatally to preserve extracted facts in Neon.
- **Briefing Generation Failure**:
  If all clinical facts are missing or synthesis fails, briefing status is set to `'failed'` with `error_message` for inline display in the UI with a Retry action.
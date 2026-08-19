# Pipeline Orchestration Spec

> **End-to-End Pipeline in Pure TypeScript.**
> Executed via Next.js Server Actions with Google Gemini 2.0 Flash and Zep Cloud v2.

---

## 1. Document Ingestion Pipeline

**Trigger:** Caregiver selects and uploads one or more PDF records in `DocumentUploader.tsx`.

```
User uploads PDF → Supabase Storage (medical_records bucket)
    ↓
Document row created (status: 'uploaded')
    ↓
DocumentUploader triggers ingestDocument(documentId) [Server Action]
    ↓
1. Download PDF Buffer:
   Supabase Storage -> Buffer from raw file arrayBuffer
    ↓
2. Gemini 2.0 Flash Multimodal Extraction (src/lib/ai/extract.ts):
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
4. Supabase Update:
   documents table updated with status: 'extracted', document_date, document_type,
   extracted_entities JSON, processed_at timestamp.
```

---

## 2. Briefing Generation Pipeline

**Trigger:** Caregiver clicks "Generate Briefing" and selects an audience target (Specialist, GP, Family, ER, Second Opinion) in `PatientDetailClient.tsx`.

```
User clicks "Generate Briefing"
    ↓
Briefings row created (status: 'queued')
    ↓
PatientDetailClient calls generateBriefing(patientId, briefingId, audience, caregiverId) [Server Action]
    ↓
1. Query Patient Memory (src/lib/zep/ingest.ts):
   queryPatientMemory(caregiverId, patientId, 'medications lab values conditions diagnoses vital signs allergies')
   Calls Zep client.graph.search({ query, userId, limit: 20 })
   Aggregates graph facts and episodes into clinical context text.
    ↓
2. Structured Synthesis via Gemini 2.0 Flash:
   generateObject({
     model: google('gemini-2.0-flash'),
     schema: BriefingOutputSchema,
     system: Prompt adapted to audience target,
     messages: Patient header + Zep clinical memory context
   })
   Returns structured object:
   - briefing_text (Markdown clinical summary)
   - claims (array of claim_text, claim_type, flag, evidence)
   - flagged_concerns (array of concern, severity, related_claims)
    ↓
3. Supabase Update:
   briefings table updated with status: 'complete', briefing_text, claims,
   flagged_concerns, completed_at timestamp.
```

---

## 3. Error Handling & Recovery

- **Document Ingestion Failure**:
  If Gemini extraction or Storage download fails, document status is set to `'failed'` and `error_message` is populated. Zep ingestion failures are logged non-fatally to preserve extracted facts in Supabase.
- **Briefing Generation Failure**:
  If memory query returns empty or synthesis fails, briefing status is set to `'failed'` with `error_message` for inline display in the UI with a Retry button.
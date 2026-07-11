# PaperTrail: Atomic Claim-Evidence Verification Spec

> **This is the ONLY genuinely novel logic in the MVT.** Everything else is integration or boilerplate. This spec defines the algorithm the coding agent must implement.

---

## What PaperTrail Does

PaperTrail is Layer 4 of the pipeline. It takes the LLM's briefing output and VERIFIES every claim against the source documents. It's the hallucination firewall — the part that makes the briefing trustworthy enough for medical use.

**The principle:** Every claim in the briefing must be grounded in a verifiable source span from the patient's uploaded documents OR from an authoritative medical database (Layer 5). Claims without grounding are REJECTED.

## The Two-Stage Algorithm

### Stage 1: Atomic Claim Decomposition

**Input:** The LLM's briefing text (the output of Layer 3).

**Process:** Break the briefing into ATOMIC CLAIMS — single-fact statements that can be individually verified.

**What is an atomic claim?**
- A single statement that asserts one fact
- Cannot be further decomposed without losing meaning
- Each atomic claim should be verifiable independently

**Examples:**

Briefing sentence: "Your mom's GFR has been declining for 18 months, from 65 to 47, and her new cardiologist prescribed Lisinopril which is contraindicated in declining kidney function."

Atomic claims:
1. "Mom's GFR was 65 [at some point in the past]"
2. "Mom's GFR is currently 47"
3. "Mom's GFR has declined over 18 months"
4. "Mom's new cardiologist prescribed Lisinopril"
5. "The prescription was recent (yesterday)"
6. "Lisinopril is an ACE inhibitor"
7. "ACE inhibitors are contraindicated in declining kidney function"
8. "This combination should be flagged for the cardiologist"

**Implementation:**
- Use Claude Haiku with a structured output prompt
- Prompt: "Decompose the following briefing into atomic claims. Each claim should be a single verifiable fact. Output as JSON array of {claim_id, claim_text, claim_type}."
- claim_type: "source_document" (verifiable from patient's PDFs) or "medical_knowledge" (verifiable from drug databases) or "reasoning" (derived from other claims)

**Output format:**
```json
{
  "claims": [
    {
      "claim_id": "c1",
      "claim_text": "Mom's GFR was 65 on 2024-03-15",
      "claim_type": "source_document",
      "expected_evidence": "lab result showing GFR 65 dated 2024-03-15"
    },
    {
      "claim_id": "c7",
      "claim_text": "ACE inhibitors are contraindicated in declining kidney function",
      "claim_type": "medical_knowledge",
      "expected_evidence": "DDInter drug-disease contraindication entry"
    }
  ]
}
```

### Stage 2: Atomic Evidence Extraction

**Input:** All source documents (PDFs) that were uploaded, already extracted to text by Layer 1.

**Process:** Break each source document into ATOMIC EVIDENCE — single-fact statements from the source.

**What is atomic evidence?**
- A single verifiable fact extracted from a source document
- Includes the EXACT source quote (for string-match verification)
- Includes document ID, page number, and position

**Examples from a lab result PDF:**

Source text: "Patient: Jane Doe, DOB: 1958-04-12. Date of service: 2024-03-15. GFR 65 mL/min/1.73m² (ref range: >60). Next: Creatinine 1.1 mg/dL."

Atomic evidence:
```json
{
  "evidence_id": "e1",
  "evidence_text": "GFR was 65 on 2024-03-15",
  "source_doc_id": "lab_001.pdf",
  "source_page": 1,
  "source_quote": "GFR 65 mL/min/1.73m²",
  "source_date": "2024-03-15"
}
```

**Implementation:**
- Use Claude Haiku with structured output
- Prompt: "Extract atomic evidence from the following source document text. Each evidence should be a single fact with the exact source quote. Output as JSON array."
- For medical-knowledge claims, the "evidence" comes from Layer 5 (DDInter/RxNorm API responses), not from PDFs

---

## Stage 3: Claim-Evidence Matching

**Input:** The atomic claims (Stage 1) + atomic evidence (Stage 2).

**Process:** For each claim, find matching evidence. Use TWO matching strategies:

### Strategy A: String-Match Verification (for verbatim quotes)
- For each claim, the LLM should have produced an expected `source_quote`
- Search the source documents for that exact string (case-insensitive, whitespace-normalized)
- If found → claim is GROUNDED
- If not found → fall back to Strategy B

### Strategy B: Semantic-Match Verification (for paraphrased claims)
- Use Claude Haiku to semantically match claims to evidence
- Prompt: "For each claim, find the evidence that supports it. A claim is supported if the evidence asserts the same fact, even if worded differently. Output as {claim_id, evidence_id, match_type, confidence}."
- match_type: "exact" (string match), "semantic" (paraphrased), "none" (no match)
- confidence: 0.0 to 1.0

### Strategy C: Medical-Knowledge Verification (for claim_type = "medical_knowledge")
- These claims are NOT verified against PDFs
- They're verified against Layer 5 (DDInter/RxNorm)
- Layer 5 returns a citation (e.g., "DDInter entry #12345")
- The claim is grounded if Layer 5 confirms it

---

## Stage 4: Flagging

**For each claim, assign a flag:**

| Flag | Meaning | Action |
|---|---|---|
| **SUPPORTED** | Matching evidence found (string or semantic, confidence > 0.8) | Include in briefing with citation chip |
| **PARTIALLY SUPPORTED** | Some evidence found but incomplete (confidence 0.5-0.8) | Include in briefing with "partial support" warning + citation chip |
| **UNSUPPORTED** | No matching evidence found (confidence < 0.5) | REJECT — do not include in briefing. Log as potential hallucination. |
| **MEDICAL_KNOWLEDGE** | Verified via Layer 5 (DDInter/RxNorm) | Include with DDInter/RxNorm citation |
| **REASONING** | Derived from other claims (not directly verifiable) | Include only if all source claims are SUPPORTED. Mark as "derived." |

---

## Output Format

```json
{
  "briefing_id": "uuid",
  "patient_id": "uuid",
  "generated_at": "2026-07-10T12:00:00Z",
  "claims": [
    {
      "claim_id": "c1",
      "claim_text": "Mom's GFR was 65 on 2024-03-15",
      "claim_type": "source_document",
      "flag": "SUPPORTED",
      "evidence": {
        "evidence_id": "e1",
        "source_doc_id": "lab_001.pdf",
        "source_page": 1,
        "source_quote": "GFR 65 mL/min/1.73m²",
        "match_type": "exact",
        "confidence": 0.98
      }
    },
    {
      "claim_id": "c7",
      "claim_text": "ACE inhibitors are contraindicated in declining kidney function",
      "claim_type": "medical_knowledge",
      "flag": "MEDICAL_KNOWLEDGE",
      "evidence": {
        "source": "DDInter",
        "entry_id": "12345",
        "entry_text": "ACE inhibitors should be used with caution in CKD stage 3+",
        "url": "https://ddinter.scbdd.com/interaction/12345"
      }
    }
  ],
  "flagged_concerns": [
    {
      "concern": "Potential contraindication: Lisinopril (ACE inhibitor) prescribed despite declining GFR",
      "related_claims": ["c4", "c7"],
      "severity": "high",
      "recommendation": "Flag for cardiologist review"
    }
  ],
  "rejected_claims": [
    {
      "claim_id": "c9",
      "claim_text": "Patient has diabetes",
      "reason": "No evidence found in source documents",
      "flag": "UNSUPPORTED"
    }
  ]
}
```

---

## The Citation Chip UI

Each SUPPORTED or MEDICAL_KNOWLEDGE claim renders as a "citation chip" in the briefing UI:

```
[GFR declined from 65 to 47 over 18 months] [📄 lab_001.pdf p.1] [📄 lab_004.pdf p.1]

[Lisinopril prescribed by cardiologist] [📄 cardiologist_note.pdf p.2]

⚠️ FLAG: ACE inhibitor contraindicated in declining kidney function [💊 DDInter #12345]
```

Clicking a chip:
- 📄 chips → opens the source PDF at the relevant page, highlights the source_quote
- 💊 chips → opens the DDInter/RxNorm entry in a new tab

---

## Implementation Notes

### Language: TypeScript (Supabase Edge Function)
- PaperTrail runs as a Supabase Edge Function
- Calls Claude Haiku via Anthropic SDK for claim/evidence decomposition
- Calls Postgres for source document text (already extracted by Layer 1)
- Returns JSON to the frontend

### Cost per briefing:
- Claude Haiku calls:
  - 1 call for claim decomposition (~500 input tokens, ~300 output tokens)
  - 1 call per source document for evidence extraction (~2000 input tokens, ~500 output tokens per doc, ~5 docs = 10K input, 2.5K output)
  - 1 call for semantic matching (~3000 input tokens, ~500 output tokens)
  - Total: ~15.5K input tokens, ~3.3K output tokens
  - Cost at Claude Haiku pricing ($1/$5 per 1M): ~$0.015 input + ~$0.017 output = **~$0.03 per briefing**
- For 50 briefings/month: ~$1.50/month

### Error handling:
- If Claude Haiku fails to decompose claims → retry once, then return error
- If no source documents available → skip Stage 2, all claims become UNSUPPORTED
- If Layer 5 (DDInter) is down → medical_knowledge claims become "UNVERIFIED" (different from UNSUPPORTED — show with warning)

### Testing:
- Use Synthea synthetic patient records
- Generate 5-10 documents per patient
- Verify that PaperTrail correctly:
  - Decomposes the briefing into atomic claims
  - Finds matching evidence in source documents
  - Flags the kidney function example correctly (GFR trend + ACE inhibitor contraindication)
  - Rejects hallucinated claims (inject fake claims, verify they're flagged UNSUPPORTED)

---

## What PaperTrail Does NOT Do

- Does NOT verify the LLM's reasoning (if claims A, B, C are true, is conclusion D valid?) — that's the human caregiver + doctor's job
- Does NOT check for omissions (things the briefing should mention but didn't) — that's the caregiver + doctor's job
- Does NOT make medical judgments — it only verifies that claims are grounded in sources
- Does NOT replace Layer 5 — medical_knowledge claims still need DDInter/RxNorm citations

PaperTrail is the STRUCTURAL verification. The human judges are the SEMANTIC verification. Both are needed.

# Project Brief: Caregiver Medical Briefing Tool

> **This document captures every design decision and its WHY. The coding agent reads this first. Do not deviate from these decisions without explicit user approval.**

---

## 1. The Problem (What We're Solving)

The most universal medical pain is NOT "I can't understand this document." It's **fragmentation** — a patient's medical history scattered across providers, time, and systems.

The same patient sees a PCP, then a cardiologist, then an ER doc, then a specialist, then has a hospitalization. Each visit generates records. Each provider has their own portal. Medications change. Allergies accumulate. Family history updates. Hospitalizations require recounting the entire history to a new doctor who has zero context.

Caregivers of aging parents feel this pain most acutely. Every cancer family has a physical binder of records. Top cancer centers (MD Anderson, Cleveland Clinic, Stanford) still publish PDF guides in 2026 telling patients to organize records in physical paper binders. The clinical gold standard for polypharmacy review is the "Brown Bag Review" — patients literally put all their meds in a brown paper bag and bring them to a doctor.

**ChatGPT can interpret any ONE document. It cannot hold the whole.** ChatGPT forgets between sessions, can't accumulate new documents over time, can't reliably cite which document each fact came from.

---

## 2. The Moat (Why This Isn't a ChatGPT Wrapper)

### The Signature Value Example

> "Your mom's GFR has been declining for 18 months across 6 lab draws from 3 different providers (65 → 58 → 51 → 47), and her new cardiologist prescribed Lisinopril yesterday — an ACE inhibitor that is contraindicated in declining kidney function. Flag this for the cardiologist."

This is what ChatGPT CANNOT do. ChatGPT can interpret any single lab. It cannot:
- Hold 6 labs across 18 months in persistent memory (it forgets between sessions)
- Reliably cite which document each value came from
- Cross-reference a temporal trend against a new prescription
- Accumulate new documents over months without re-pasting everything

### The Three-Layer Moat

The moat is the COMBINATION of three layers, not any single one:

1. **Layer 3 (LLM Synthesis)** — reasons across multiple documents to detect trends, conflicts, contraindications. Generates CLAIMS.
2. **Layer 4 (PaperTrail Verification)** — decomposes each claim into atomic units, finds source spans in original documents, verifies by string-match + semantic-match. Flags as SUPPORTED / UNSUPPORTED / PARTIALLY SUPPORTED. The verification IS the product.
3. **Layer 7 (Persistent Bi-Temporal Storage)** — stores medical facts with valid_from / valid_to / observed / recorded timestamps. Old facts are INVALIDATED, not deleted. Enables "what was true on date X" queries. Graphiti (with FalkorDB backend) handles this.

**ChatGPT can do Layer 3 alone** (if you paste documents in). It CANNOT do Layer 4 (string-match verification against stored documents) or Layer 7 (persistent accumulation across sessions). The combination is the moat.

### What This Is NOT

- NOT a ChatGPT wrapper (fails the ChatGPT-upload test — users can't get the same value by pasting documents into ChatGPT)
- NOT lab result interpretation (ChatGPT does that — wrapper)
- NOT visit note translation (ChatGPT does that — wrapper)
- NOT insurance denial appeal drafting (ChatGPT does that — wrapper)
- NOT a generic medical chatbot

---

## 3. The MVT Boundary (Per v26)

### MUST Include (the moat — build seriously):
- Multi-document upload and processing over time
- Bi-temporal storage of medical facts (via Graphiti + FalkorDB)
- LLM reasoning over facts to detect trends, conflicts, contraindications
- Atomic claim-evidence verification (PaperTrail pattern)
- Layer 5 external knowledge citations (RxNorm + DDInter for drug-disease contraindications)
- Citation chips in the output (clickable source quotes)
- **The kidney function example must work end-to-end on 5-10 documents from one patient**

### CAN Simplify (acceptable imperfection for MVT):
- Entity resolution: case-insensitive exact match. Will fail on "Lisinopril" vs "Prinivil" (same drug, different names). Acceptable.
- Conflict detection: simple rule (same entity_name + patient_id + different value → invalidate old, insert new). Won't catch subtle conflicts. Acceptable.
- Fact extraction: AWS Comprehend Medical + one LLM pass. Won't be perfect. Acceptable.
- Multi-hop queries: not needed. Simple temporal queries are enough.

### MUST NOT Include (production-grade — skip):
- FHIR / EHR integration (skip OAuth hell — caregivers upload PDFs directly)
- Multi-tenant enterprise features
- Sophisticated entity resolution with RxNorm cross-referencing
- Complex multi-hop graph queries
- Scale infrastructure for thousands of patients
- Layer 6 (LLM-as-judge) — four verification layers are enough, adding a fifth adds cost + latency without value

### The MVT Success Test

> "The kidney function example works end-to-end on 5-10 documents from one patient, with citation chips, and the caregiver can show it to a doctor without embarrassment."

If it passes: moat is real, validate with real caregivers.
If it fails: kill it, learn cheaply.

---

## 4. Architecture Decisions (The WHY Behind Each)

### Decision 1: Graphiti with FALKORDB backend (NOT Neo4j)

**WHY:** Graphiti supports two backends: Neo4j (heavy, 2GB+ RAM) and FalkorDB (Redis-based, ~300MB RAM, 7x lighter per FalkorDB V4.8 benchmarks). Our entire stack RAM drops from 4GB to 2.3GB with FalkorDB. This unlocks hosting on AWS t4g.small (2GB free) or any small VPS.

**Source:** Graphiti's official docs at help.getzep.com/graphiti/configuration/falkor-db-configuration confirm FalkorDB as a first-class supported backend. Practitioners (per falkordb.com/blog/graphiti-get-started) use FalkorDB for exactly this reason.

**DO NOT use Neo4j.** It's the "famous" default but wrong for cost-constrained MVT.

### Decision 2: Supabase Edge Functions (NOT Vercel API routes)

**WHY:** Supabase Edge Functions free tier has a 150-second wall-clock timeout. Vercel Hobby has 10s default / 60s max. Our pipeline takes 30-70 seconds per briefing (PDF processing + LLM calls + Graphiti + PaperTrail). 150s > 70s = fits with room to spare. ONE Edge Function can run the entire pipeline in one call. No chunking, no queue, no QStash.

**Source:** Supabase docs (supabase.com/docs/guides/functions/limits) confirm 150s on Free, 400s on Pro.

**DO NOT use Vercel API routes for the pipeline.** They'll timeout.

### Decision 3: Postgres for operational data + queue (NOT separate queue service)

**WHY:** Postgres `FOR UPDATE SKIP LOCKED` handles 50K jobs/sec as a queue. The queue is just a `jobs` table with status column. Eliminates QStash, Inngest, Trigger.dev as separate services.

**Source:** Microsoft tech community blog + multiple practitioner posts confirm Postgres-as-queue pattern works up to 50K jobs/sec.

**DO NOT add a separate queue service.** Postgres handles it.

### Decision 4: NO Layer 6 (LLM-as-judge)

**WHY:** Per v29, four verification layers are enough for MVT:
1. PaperTrail (structural verification of each claim against source documents)
2. Layer 5 (external knowledge grounding via DDInter/RxNorm)
3. Human caregiver (reads briefing, clicks citation chips, decides whether to bring to doctor)
4. Human doctor (applies clinical judgment, ultimate authority)

Adding LLM-as-judge is redundant with PaperTrail, weak for omissions/reasoning (LLMs share blind spots), and might REDUCE trust (false sense of "AI verified this"). Layer 6 earns its place at production scale (10,000+ briefings/day) when automated quality gates are needed. NOT at MVT.

**DO NOT add LLM-as-judge.** It's a v18 layer we explicitly cut.

### Decision 5: Multimodal PDF extraction (NOT text-only OCR)

**WHY:** Per v20, text-only OCR (pdfjs-dist, tesseract) gets 83-91% accuracy on medical records — loses 9-17% of medical content. Medical records have visual elements (handwritten signatures, multi-column lab tables, scanned forms, clinical shorthand) that text OCR can't capture. The whole pipeline fails downstream if Layer 1 loses medications.

**Solution:** pdfjs-dist renders PDF pages to PNG images, then GPT-4o-mini vision extracts structured text. Cost: ~$1 per 1,000 pages. HiOscar (real insurance company) proved this approach wins on medical in production.

**DO NOT use text-only OCR for medical PDFs.** Use multimodal.

### Decision 6: AWS Comprehend Medical for entity extraction

**WHY:** $0.01 per 100 chars, free tier 85,000 units (~1,000 5-page docs) first month. Extracts meds, conditions, dosages with ICD-10/RxNorm/SNOMED codes. HIPAA-eligible.

**Alternative (skip for MVT):** Open-source Bio_ClinicalBERT (free, self-hosted, ~$50/mo on RunPod). Not needed at MVT scale.

### Decision 7: Claude Haiku 4.5 for LLM synthesis + DeepSeek V4 Pro for coding

**WHY:** Claude Haiku is $1/$5 per 1M tokens — one thousand briefings = $5 in LLM costs. Strong at multi-document reasoning. For CODING the MVT, use DeepSeek V4 Pro (80.6% SWE-bench, $0.27/$1.10 per 1M) via ZCode or Claude Code.

### Decision 8: Bi-temporal tracking via Graphiti (NOT custom Postgres schema)

**WHY:** Per v27/v38, Graphiti already solves: bi-temporal tracking, entity resolution, conflict detection, multi-hop queries. Building these ourselves is months of work. Graphiti has 20K+ GitHub stars because it solves real problems.

**The MVT uses Graphiti's simpler capabilities** (bi-temporal storage + basic queries). The sophisticated capabilities (entity resolution, multi-hop) earn their place at production scale.

**DO NOT write custom bi-temporal query logic.** Call Graphiti's API.

---

## 5. The Stack (Final, Per v33-v38)

### Hosting (Pattern F + FalkorDB):
| Component | Hosting | Cost |
|---|---|---|
| Frontend (Next.js) | Cloudflare Pages or Vercel free | $0 |
| API/compute (pipeline) | AWS t4g.small (2GB ARM, free until Dec 2026) OR Supabase Edge Functions | $0 |
| Operational database | Supabase Postgres free tier (500MB, 50K MAU) | $0 |
| Graph database (the moat) | FalkorDB on Upstash Redis free tier (256MB, 10K commands/day) OR self-hosted on the VPS | $0 |
| File storage (PDFs) | Supabase Storage (1GB free) | $0 |
| Auth | Supabase Auth (50K MAU free) | $0 |
| Queue | Postgres SKIP LOCKED (no separate service) | $0 |
| Email | Resend free tier (3K/mo) | $0 |
| SSL/CDN | Cloudflare free | $0 |
| **Total hosting** | | **$0/mo** |
| AWS Comprehend Medical | (within free tier) | ~$5/mo |
| OpenAI GPT-4o-mini vision | (~$1/1000 pages) | ~$1/mo |
| Anthropic Claude Haiku | ($1/$5 per 1M tokens) | ~$1-2/mo |
| **Total monthly** | | **~$7-8/mo for 10 caregivers** |

### Languages:
- **TypeScript** end-to-end (Next.js + Supabase Edge Functions + all orchestration)
- **Python** ONLY for the Graphiti wrapper (~50 lines of FastAPI, calls Graphiti's Python SDK)

### Coding agent:
- **ZCode** (free ADE) + **DeepSeek V4 Pro** via API (~$2-5 one-time for MVT build)
- Alternative: Claude Code (free CLI) + DeepSeek V4 Pro
- **NOT** Antigravity CLI (closed source, Google-locked)

---

## 6. What NOT to Do (Common Mistakes the Agent Might Make)

These are mistakes the coding agent will likely make by default. The AGENTS.md file enforces these rules, but listing them here for clarity:

1. **DO NOT use Neo4j.** Use FalkorDB as Graphiti's backend. (v36/v38)
2. **DO NOT add LLM-as-judge (Layer 6).** Four verification layers are enough. (v29)
3. **DO NOT write custom bi-temporal query logic.** Graphiti handles this. Just call the API. (v27)
4. **DO NOT use Vercel API routes for the pipeline.** 60s timeout is too short. Use Supabase Edge Functions (150s) or AWS t4g.small. (v33)
5. **DO NOT add FHIR/EHR integration.** Caregivers upload PDFs directly. (v6 Escape 3)
6. **DO NOT use text-only OCR for medical PDFs.** Use multimodal (PDF → image → GPT-4o-mini vision). (v20)
7. **DO NOT add features not in the MVT boundary.** No multi-tenant, no scale infrastructure, no sophisticated entity resolution. (v26)
8. **DO NOT add a separate queue service.** Postgres SKIP LOCKED handles the queue. (v33)
9. **DO NOT use ChatGPT as the source of truth for medical knowledge.** Layer 5 (RxNorm + DDInter) is the source of truth. LLM is the orchestrator. (v18/v28)
10. **DO NOT skip the citation chips.** Every claim in the briefing must have a clickable source citation. This is the trust layer. (v23)

---

## 7. The Four-Layer Verification (Why We Trust the Output)

Per v29, verification comes from four layers — that's enough for MVT:

1. **PaperTrail atomic claim-evidence matching** (Layer 4) — structural verification of each claim against source documents. Catches hallucinations mechanically.
2. **Layer 5 database citations** (DDInter, RxNorm) — external knowledge grounding for domain-knowledge claims ("Lisinopril contraindicated in CKD"). Without this, domain-knowledge claims are "the AI said so."
3. **Human caregiver** — reads briefing, clicks citation chips, decides whether to bring to doctor.
4. **Human doctor** — applies clinical judgment, ultimate authority.

**Two kinds of claims:**
- Source-document claims ("Patient is on Lisinopril 10mg") → grounded in PDFs
- Medical-knowledge claims ("Lisinopril contraindicated in declining GFR") → grounded in DDInter/RxNorm

Both need grounding sources. Layer 4 grounds user-data claims. Layer 5 grounds domain-knowledge claims.

---

## 8. The Pipeline (End-to-End Flow)

```
Caregiver uploads PDFs (over time, multiple sessions)
  ↓
Layer 1: pdfjs-dist renders PDF → PNG images → GPT-4o-mini vision extracts structured text
  ↓
Layer 2: AWS Comprehend Medical extracts medical entities (meds, labs, conditions, with RxNorm/ICD-10 codes)
  ↓
Layer 7 (THE MOAT): Graphiti (FalkorDB backend) stores facts as bi-temporal:
  - valid_from, valid_to (when true in real world)
  - observed, recorded (provenance: which document, when ingested)
  - Old facts INVALIDATED, not deleted — full history preserved
  ↓
Layer 3: Claude Haiku queries Graphiti to reason across facts:
  - Detect trends (GFR 65→58→51→47 over 18 months = decline)
  - Detect conflicts (Lisinopril 10mg in March, 20mg in Sept = dose change, not contradiction)
  - Detect contraindications (new ACE inhibitor + declining GFR = flag)
  ↓
Layer 5: Layer 3 calls RxNorm + DDInter as tools to verify medical-knowledge claims
  - "Is Lisinopril contraindicated in declining GFR?" → DDInter returns: yes, with citation
  ↓
Layer 4 (PaperTrail): Atomic claim-evidence verification
  - Decompose LLM briefing into atomic claims
  - Decompose source documents into atomic evidence
  - Map each claim to evidence
  - Flag: SUPPORTED / UNSUPPORTED / PARTIALLY SUPPORTED
  - String-match verification for verbatim quotes
  ↓
Output: Briefing with citation chips + flagged concerns + temporal context
  ↓
Caregiver reads, clicks citation chips, decides whether to bring to doctor
  ↓
Doctor reads, applies clinical judgment, decides what to do
```

---

## 9. Test Data

Use **Synthea** (MITRE, open-source, github.com/synthetichealth/synthea) to generate synthetic patient records with complete medical histories — medications, allergies, encounters, conditions. Generate 10-20 synthetic patients with multi-year histories. Run them through the pipeline. Verify the temporal graph captures state changes correctly. No real PHI needed for testing.

---

## 10. Constraints

- Hosting cost target: $0-10/month. $18/month is the absolute maximum.
- AI API cost: ~$7-8/month for 10 caregivers.
- Coding cost: ~$5-15 one-time (no monthly subscriptions for coding tools).
- The coding agent starts with zero context — all decisions are captured in these artifacts.

# Project Brief: Caregiver Medical Briefing Tool (CareNote)

> **This document captures the architectural decisions and design rationale for the CareNote platform.**
> **Architecture Status:** 100% TypeScript Next.js App Router (Gemini 2.0 Flash + Zep Cloud v2 + Supabase).

---

## 1. The Problem

The most universal medical pain is NOT "I can't understand this document." It's **fragmentation** — a patient's medical history scattered across providers, time, and systems.

The same patient sees a primary care provider, then a cardiologist, an ER doc, a specialist, and undergoes hospitalizations. Each visit generates records across disparate portals. Medications change, allergies accumulate, and lab trends develop over years.

Caregivers of aging parents or chronically ill relatives carry the burden of recounting comprehensive histories to new doctors with zero initial context.

**Generic chatbots can interpret any single document, but cannot hold the whole across time.** They lack persistent longitudinal memory, deterministic citation tracing, and bi-temporal awareness.

---

## 2. The Moat & Signature Value

### Signature Clinical Value Example

> "Your mom's GFR has been declining for 18 months across 6 lab draws from 3 different providers (65 → 58 → 51 → 47), and her new cardiologist prescribed Lisinopril — an ACE inhibitor that is contraindicated in declining kidney function. Flag this for the doctor."

### The Core Architectural Pillars

1. **Direct Multimodal Ingestion (Gemini 2.0 Flash + Zod)**:
   Extracts structured clinical facts (medications, lab values, diagnosed conditions, document dates/types) directly from raw PDF bytes without intermediate multi-step OCR pipelines.
2. **Bi-Temporal Clinical Graph Memory (Zep Cloud v2)**:
   Maintains longitudinal facts tied to document dates (`valid_from`). Enables temporal queries ("what was true on date X") and accumulates context across multiple visits.
3. **PaperTrail Grounding & Verification**:
   Every claim in the synthesized briefing is traceable to source facts with flags (`SUPPORTED`, `PARTIALLY SUPPORTED`, `UNVERIFIED`). Flagged concerns highlight contraindications and severe clinical trends.

---

## 3. Simplified TypeScript Architecture

```
Browser (React 19) → Next.js 16.2 Server Actions → Supabase Postgres + Storage
                            ↓ ingestDocument()
                    Gemini 2.0 Flash (multimodal PDF → Zod schema)
                            ↓
                    Zep Cloud (graph.add — bi-temporal clinical memory)
                            ↓ generateBriefing()
                    Gemini 2.0 Flash (generateObject → structured briefing)
```

- **Runtime**: 100% TypeScript (Next.js App Router + Server Actions).
- **No legacy multi-runtime bloat**: No Python, no Deno Edge Functions, no Docker containers, no custom job queue tables or cron triggers.
- **Data Layer**: Supabase Postgres (Auth, Patient records, Document metadata, Briefings) + Supabase Storage (`medical_records` bucket).
- **AI & Memory**: Google Gemini 2.0 Flash via `@ai-sdk/google` + Zep Cloud v2 graph API (`@getzep/zep-cloud`).
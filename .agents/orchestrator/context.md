# Context & Baseline Environment Knowledge

## Project Overview
Caregiver Briefing Tool: Clinical medical briefing generator that ingests medical PDFs, extracts text via Vision OCR/Extraction, builds a FalkorDB knowledge graph of entities & facts, generates clinical briefing state/trends/summaries, and verifies citations via PaperTrail.

## Live Endpoints & Service Map
1. **Supabase Cloud Serverless Functions**:
   - URL base: `https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/`
   - Functions: `process-document`, `extract-pdf`, `extract-entities`, `patient-state`, `trend`, `process-briefing`, `papertrail-verify`
   - Auth: Anon Key / Service Role Key from `.env.local`

2. **Render Python FastAPI Wrapper**:
   - URL base: `https://caregiver-briefing-tool.onrender.com`
   - Health / Graph / NLP endpoints: `/health`, `/add-facts`, `/patient-state`, `/trend`
   - FalkorDB Instance: `r-6jissuruar.instance-ql5fhbodg.hc-7up0crkyn.ap-south-1.aws.f2e0a955bb84.cloud:49277`

3. **Vercel Frontend / API Routes**:
   - Live URL: `https://caregiver-briefing-tool.vercel.app` (or Vercel project deployment)

4. **Test Data**:
   - Synthea test records in `synthea-test-data/` directory

## Non-Destructive Audit Constraints
- Do NOT delete or corrupt live production tables/graphs.
- Use dedicated test patient IDs (e.g. `audit-test-patient-*` or Synthea sample IDs).
- Measure response latency, HTTP status codes, edge function execution, and error handling.

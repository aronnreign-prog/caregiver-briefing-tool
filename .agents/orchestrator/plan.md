# Project Plan: Caregiver Briefing Tool Live Validation & Diagnostic Audit

## Executive Overview
This project executes an autonomous end-to-end validation and diagnostic audit across the live deployed Caregiver Briefing Tool infrastructure (Vercel Frontend, Supabase Cloud Serverless & DB, Render Python FastAPI Service).

## Architecture & Deployment Layers
1. **Frontend / Web API**: Vercel Next.js deployment (`https://caregiver-briefing-tool.vercel.app` or project Vercel endpoints)
2. **Serverless Platform**: Supabase Cloud (`https://qtwxthxhwwqovpcqrdqj.supabase.co` Edge Functions & PostgreSQL DB)
3. **Graph & NLP Service**: Render Python FastAPI Service (`https://caregiver-briefing-tool.onrender.com` / Graphiti Wrapper / FalkorDB cloud instance)

## Pipeline Layers to Validate
- **Layer 1**: PDF Document Ingestion & Vision Text Extraction (`/extract-pdf` / `process-document`)
- **Layer 2**: Medical Entity Extraction (`/extract-entities`) & FalkorDB Knowledge Graph Ingestion (`/add-facts`)
- **Layer 3**: Patient State (`/patient-state`), Trend Retrieval (`/trend`), and Briefing Generation (`process-briefing`)
- **Layer 4**: PaperTrail Citation Verification (Claim decompose, evidence match, status check)

## Milestones & Execution Topology

| Milestone | Scope | Deliverables | Gate Criteria |
|-----------|-------|--------------|---------------|
| **M1: Discovery & Baseline** | Discover live endpoints, auth tokens, test datasets, environment settings | Endpoint topology map, environment audit, test dataset inventory in `context.md` | Endpoint map verified, test PDFs identified, no destructive risk |
| **M2: Layers 1 & 2 Audit** | Live testing of PDF extraction, entity extraction, FalkorDB ingestion | Live HTTP telemetry, latency benchmarks, payload schema validation | Zero unhandled 500 errors, HTTP 200/201 on valid requests, genuine responses verified by Auditor |
| **M3: Layers 3 & 4 Audit** | Live testing of Patient State, Trend Retrieval, Briefing Generation, PaperTrail Citations | E2E briefing pipeline telemetry, citation integrity audit | 100% successful briefing generation & citation match, zero uncaught validation errors |
| **M4: Report Synthesis** | Synthesize all telemetry and write `docs/reports/live_deployment_audit.md` | Published audit report at `docs/reports/live_deployment_audit.md` | Report complete, passes Reviewer, Challenger, and Forensic Auditor verification |

## Verification Strategy
- Non-destructive payload testing using Synthea test dataset (`synthea-test-data`)
- HTTP response logging, latency measuring, edge function execution tracing
- Mandatory Forensic Auditor check (`teamwork_preview_auditor`) at every milestone gate

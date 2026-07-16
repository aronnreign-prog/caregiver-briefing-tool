---
name: model_routing
description: >
  Activate when choosing which AI coding tool to use for a task on the caregiver-briefing-tool project.
  Tells the agent when to recommend ZCode (DeepSeek V4 Pro), Claude Sonnet (Antigravity), or Gemini (Antigravity).
  Trigger on any message that starts a new task or asks "which model" / "should I switch".
---

# Model Routing — Caregiver Briefing Tool

> **Runtime (pipeline) models** (OpenRouter, env-driven) are defined in
> `.agents/MODELS.md`. This skill covers only *which coding agent* to use.

## Quick Reference

| Signal in task | → Use |
|---|---|
| "scaffold", "create page", "add route", "docker", "SQL migration", "env file", "component" | **ZCode** |
| "PaperTrail", "claim verification", "Graphiti", "bi-temporal", "pipeline orchestration", "debug", "fix error" | **Claude Sonnet** |
| "read the docs", "check the API", "research", "plan", "review" | **Gemini** |

## Format for Signaling a Switch

Always open the response with:

```
> 💡 MODEL SWITCH: Use [MODEL] for this task. Reason: [≤15 words].
```

## Task → Model Mapping (Full)

### ZCode (DeepSeek V4 Pro) — default for boilerplate
- Task 1: Next.js scaffold, docker-compose.yml, .env files → **ZCode**
- Task 2: SQL schema migration, Supabase Auth setup pages → **ZCode**
- Task 3: Patient form, file upload UI, Realtime subscription wiring → **ZCode**
- Task 4 (partial): Edge Function shell, SKIP LOCKED queue worker pattern → **ZCode**
- Task 5 (partial): AWS Comprehend Medical API call wiring → **ZCode**
- Task 8: Graphiti HTTP client calls (once the wrapper is built) → **ZCode**
- Task 11 (partial): shadcn/ui briefing layout, severity badges → **ZCode**
- Task 12: Synthea data scripts, test runners → **ZCode**
- Task 13: Deployment config, env var setup → **ZCode**

### Claude Sonnet (Antigravity) — for novel / reasoning-heavy work
- Task 4 (partial): GPT-4o-mini vision prompt engineering, multimodal extraction logic → **Claude Sonnet**
- Task 6: Python FastAPI Graphiti wrapper — novel, Graphiti API not well-known → **Claude Sonnet**
- Task 7: Feeding Comprehend Medical output into Graphiti correctly → **Claude Sonnet**
- Task 9: LLM reasoning prompt (Layer 3), DDInter/RxNorm integration logic → **Claude Sonnet**
- Task 10: **Entire PaperTrail algorithm** (Stage 1-4, claim-evidence matching) → **Claude Sonnet**
- Task 11 (partial): Citation chip interactivity (PDF highlight, chip linking) → **Claude Sonnet**
- Any debugging session → **Claude Sonnet**

### Gemini (Antigravity) — for research only
- Reading Graphiti docs before Task 6 → **Gemini**
- Checking DDInter API shape before Task 9 → **Gemini**
- Reviewing a plan before coding → **Gemini**
- Understanding why something failed at a conceptual level → **Gemini**

## Cost Intuition
- ZCode: ~$0.27/$1.10 per 1M tokens — use freely for boilerplate
- Claude Sonnet: more expensive — reserve for complex reasoning
- Gemini: free/cheap — use freely for research, not code generation

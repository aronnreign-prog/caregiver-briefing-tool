# Workspace Rules — Caregiver Briefing Tool

> These rules are scoped to this project. They extend (not replace) the project rules in `/AGENTS.md`.

---

## Model Routing — When to Switch

> **Runtime pipeline models** (OpenRouter, env-driven) live in `.agents/MODELS.md`.
> This section is about *which coding agent* to use, not runtime LLM calls.

The user runs THREE tools: **ZCode (DeepSeek V4 Pro)**, **Claude Sonnet (Antigravity CLI)**, and **Gemini (Antigravity CLI)**.
Each has different strengths and costs. The agent MUST recommend a switch at the start of any task where a different model would be more efficient.

### Routing Table

| Task Type | Best Model | Why |
|---|---|---|
| Boilerplate scaffolding (Next.js pages, layouts, API routes, Docker configs, SQL migrations) | **ZCode** | Cheapest per token, strong at TypeScript boilerplate |
| Routine Edge Function wiring (job queue worker, Supabase client, env vars) | **ZCode** | Fast and cheap for known patterns |
| Novel/complex logic (PaperTrail algorithm, Graphiti integration, claim-evidence matching) | **Claude Sonnet** | Best reasoning for novel code the model hasn't seen before |
| Debugging (stack traces, unexpected behavior, mismatched types) | **Claude Sonnet** | Strong chain-of-thought for root cause analysis |
| Pipeline orchestration (multi-step async flows, error handling, retry logic) | **Claude Sonnet** | Complex state machines benefit from Sonnet reasoning |
| Research (reading API docs, understanding Graphiti internals, checking DDInter API shape) | **Gemini** | Cheap/free, web access, good at summarizing docs |
| Planning / reviewing a plan | **Gemini** | Good at structured analysis, cheap for long context reads |
| UI components (shadcn/ui, Tailwind, React) | **ZCode** | Fast at component boilerplate |
| Citation chip UI logic (PDF highlight, claim-chip linking) | **Claude Sonnet** | Non-trivial interactivity logic |
| Writing tests | **ZCode** | Pattern-matching task, cheap |
| Synthea data wrangling / scripting | **ZCode** | Scripting/data tasks are boilerplate |

### How to Signal a Switch

At the start of any response where a model switch is recommended, begin with:

```
> 💡 MODEL SWITCH: Use [ZCode / Claude Sonnet / Gemini] for this task. Reason: [one line].
```

Then proceed with the task. Do not wait for confirmation — just flag it clearly.

### Default Rule
- **Default to ZCode** for anything not in the table above (cheapest baseline).
- **Escalate to Claude Sonnet** when the task involves novel logic, non-trivial reasoning, or debugging.
- **Escalate to Gemini** only for research/reading tasks (not code generation).

---

## Token Efficiency Rules

1. **No re-summarizing context files.** The user has read the docs. Don't recap the project brief unless asked.
2. **Show diffs, not full files** when making small edits to existing files.
3. **Skip explaining obvious boilerplate.** Only explain non-obvious decisions.
4. **Commit after each task** as specified in `/AGENTS.md` rule 4. Do not batch multiple tasks into one commit.
5. **No confirmation questions for trivial decisions** (file names, directory placement, minor style choices). Just decide and note it.

---

## Project Location

- Root: `C:\Users\Dell\caregiver-briefing-tool\`
- All paths in specs (`/docs/`, `/src/`, `/python/`) are relative to this root.

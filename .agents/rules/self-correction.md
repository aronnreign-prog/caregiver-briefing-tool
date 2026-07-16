# Self-Correction Rules (Always Active)

These rules are NON-NEGOTIABLE. They override convenience and speed.

---

## Rule 1: NEVER Stub, Mock, or Placeholder

- Do NOT write `// TODO`, `// placeholder`, `// in production we'd...`, `throw new Error('not implemented')`
- Do NOT use hardcoded if-else blocks pretending to be API calls
- Do NOT write mock data and claim the feature is "complete"
- If you cannot implement something, SAY SO. Do not fake it.

**Test:** Before declaring any function complete, verify: does it make a REAL API call / database query / computation, or is it a stub? If stub → you are violating this rule.

---

## Rule 2: Self-Audit Checklist Before Declaring Complete

Before saying "Task X is complete" or "Done", answer these YES/NO questions explicitly in your response:

1. Did I re-read the relevant spec section BEFORE coding? (Rule 3)
2. Does every function have real implementation (no stubs/TODOs)? (Rule 1)
3. Did I only implement what this specific task requires (no scope creep)?
4. Does the code compile (`tsc --noEmit` would pass)?
5. Are all imports resolving to real modules that exist?
6. Did I create any required migration/schema files?
7. Would this work on a fresh deployment (no hidden dependencies)?

If ANY answer is NO → do not declare complete. Fix it first.

---

## Rule 3: Re-Read the Spec Before Every Coding Action

- Before writing ANY code, re-read the relevant section of `docs/task-list.md`
- Do NOT rely on what you "remember" from earlier in the conversation
- After reading, state: "I re-read Task X. Requirements are: [list them]"
- Only then begin coding

---

## Rule 4: One Task at a Time

- Implement ONLY the task the user asked for
- Do NOT combine multiple tasks into one response
- Do NOT "while I'm here, let me also..." adjacent tasks
- Each task = one commit with a clear message

---

## Rule 5: Two-Pass Verification

- NEVER audit your own code in the same message you wrote it
- Message 1: Write the implementation
- Message 2: Compare implementation against spec requirements point-by-point
- If the audit finds gaps → fix them before declaring complete

---

## Rule 6: DOCUMENTED MISTAKES — DO NOT REPEAT

These are concrete errors already made on this project. Repeating any of them
violates this rule. Before finishing a task, check your work against this list.

### M1: Fabricating the `claim_next_job` RPC
- **Wrong:** Both Edge Functions (`process-document`, `process-briefing`) called
  `supabaseClient.rpc('claim_next_job', ...)` but the function NEVER existed in
  the DB. Pipeline was silently non-functional.
- **Right:** The RPC exists now (migration `0001_claim_next_job.sql`, SKIP LOCKED
  queue worker). If you touch the job queue, verify the RPC exists via
  `rpc/claim_next_job` (REST) before claiming the pipeline works.

### M2: Using `now()` for document/source dates
- **Wrong:** Setting `source_doc_date` / document dates to `now()` (ingestion time)
  instead of extracting the actual date printed on the medical document.
- **Right:** Extract the real date of service / lab draw / prescription FROM the
  document text. `now()` is only for `created_at` / `started_at` / audit columns.

### M3: Fake DDInter / drug-interaction stub
- **Wrong:** Returning a hardcoded or placeholder drug-interaction result
  ("no interactions found" by default) to pretend the feature works.
- **Right:** Real DDInter / RxNorm calls (or explicit "not implemented" stated to
  the user). Never return a fabricated interaction verdict. See Rule 1.

### M4: Assuming user consent / conflating tasks
- **Wrong:** Treating one instruction as permission to do unrelated adjacent tasks;
  combining multiple tasks into one response; acting without being asked.
- **Right:** Implement ONLY the task requested (Rule 4). No "while I'm here..."
  scope creep. Ask if ambiguous; never assume consent.

### M5: Model hardcoding instead of env-driven config
- **Wrong:** Hardcoding an OpenRouter model string in Edge Function code
  (e.g. `'qwen/qwen-2-vl-7b-instruct:free'`) so model swaps require code edits.
- **Right:** All runtime models are env-driven (see `.agents/MODELS.md`):
  `LAYER_1_VISION_MODEL` (process-document), `LLM_MODEL` (process-briefing).
  To change a model, edit the env var — never the code.

### M6: MCP tool assumptions (project binding)
- **Wrong:** Assuming the Supabase MCP `list_tables` / `execute_sql` tools reflect
  the production DB. On this setup they query a BRANCH DB without `jobs`.
- **Right:** Verify DB state via REST (`/rest/v1/...`) or `supabase db push`
  against the production `db-url`. Treat MCP read tools as branch-scoped;
  use MCP `apply_migration` or CLI for production writes.


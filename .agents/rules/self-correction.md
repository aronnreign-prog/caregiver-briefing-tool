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

### M7: Blind-retry loops + trusting wrong-version docs (the "context sink" anti-pattern)
- **Wrong:** Re-ran `docker compose build` 4+ times against the SAME broken
  `requirements.txt` (`en_core_med7_lg==any`, then wrong `graphiti_core.driver.falkordb`
  import, then `pydantic` `ResolutionImpossible` conflict) — with NO websearch and
  NO package introspection between attempts. Trusted `main`-branch Graphiti docs
  that described a different version than the one pip resolved. Also hand-rolled an
  MCP SSE client in PowerShell instead of using the already-connected MCP tools.
- **Right:**
  1. **Introspect the installed package, not the doc.** Before any import, verify
     the real module path inside the built image (`docker run --rm <img> python -c
     "import pkg; print(pkg.__version__, pkg.__file__)"` + dir() the submodule).
  2. **websearch the EXACT error string on first failure.** `ResolutionImpossible`,
     `ModuleNotFoundError`, etc. are almost always documented with a one-line fix.
  3. **Hard stop after 2 identical failures.** If attempt 2 still fails the same
     way, you are looping — use docs/search/introspection, never a 3rd blind build.
  4. **Use the connected tools.** MCP tools + `supabase` CLI already exist; never
     hand-roll an SSE/MCP client in PowerShell (type-name parsing & SSE streams fail).
  5. **Preserve session essence.** Before context fills, keep a concise project
     essence (identity, verified-working state, key env, caveats) front-loaded so a
     fresh session doesn't re-derive everything. See `CONTEXT_ESSENCE.md`.

---

## Rule 7: USE YOUR TOOLS TO RESOLVE PROBLEMS — DON'T LOOP ON GUESSES

When a build/dependency/integration error appears, do NOT retry the same guess
or hand-edit blindly. Use the tools available to you to find the real answer
BEFORE editing:

1. **Version-grounded verification.** After pinning/installing a library, verify
   the actual installed version's API (e.g. `docker run --rm <img> python -c "import
   pkg; print(pkg.__file__)"` or introspect the module layout). Docs from `main`
   / latest often describe a DIFFERENT version than what pip resolved — trust the
   installed package, not the doc.
   - **Concrete (this project):** `graphiti-core` was pinned to `0.11.6` then
     `0.29.2`. The `main`-branch doc shows `graphiti_core.driver.falkordb`, but
     v0.29.2 uses `graphiti_core.driver.falkordb_driver.FalkorDriver`. Introspect
     the INSTALLED image BEFORE trusting any doc:
     `docker run --rm <img> python -c "import graphiti_core.driver, [m for m in dir(graphiti_core.driver) if 'falkor' in m.lower()]"`.
2. **Search the web for the exact error FIRST.** Paste the verbatim error string
   (e.g. `ResolutionImpossible: graphiti-core 0.29.2 depends on pydantic>=2.11.5`,
   `ModuleNotFoundError`, dependency conflict) into `websearch` to find the
   documented fix BEFORE editing. This session wasted enormous context re-running
   `docker compose build` on the SAME broken `requirements.txt` instead of
   searching `ResolutionImpossible` → the fix was simply "loosen the pydantic
   pin to `>=2.11.5`". A single websearch prevents most of these loops.
3. **Read the library's own docs/source** for the SPECIFIC version in use, not a
   generic latest-version doc. An import path valid in v0.29 may not exist in v0.11.
4. **One diagnosis, then one fix — HARD STOP after 2 identical failures.** Never
   do >2 blind retries of the same approach. If attempt 2 fails the same way,
   STOP and use docs/search/introspection. Re-running `docker compose build` with
   no code change between attempts is a blind retry — do not do it.
5. **Do NOT hand-roll tooling you already have.** This session wasted context
   building an MCP SSE client by hand in PowerShell (type-name parsing failures,
   SSE stream issues). The MCP tools and `supabase` CLI were already connected —
   use them. Never reinvent a connected tool.
6. **Know your MCP scope before debugging DB state.** On this project the Supabase
   MCP splits scope by feature: `apply_migration` writes to the **branch** DB,
   while `execute_sql` / `list_tables` read **production/main**. Don't burn
   context "discovering" that `public.jobs` "doesn't exist" in a branch context —
   it exists in prod. See M6.

**Penalty for violation:** repeated blind retries waste context and intelligence.
A single websearch or a one-line introspection command prevents most loops.

---

## Rule 8: KEEP THE USER INFORMED WHEN BLOCKED, STUCK, OR SLOW

- **If an operation is taking long, looping, or stuck, tell the user what is
  happening, the current stage, and the likely cause** — do NOT silently burn
  many tool calls. Surface progress proactively (e.g. "tunnel died → function
  500ing; need you to restart cloudflared in your terminal").
- **If you hit the same error 2+ times, STOP and report** the exact error + what
  you've tried, then offer/ask options. Never continue blind retries.
- A blocked step that needs the USER (restart a tunnel, run a terminal command)
  must be stated plainly with the exact command to run.

---

## New lessons from the pipeline E2E test (2026-07-16)

### M8: Supabase Edge Function 500 blind-retry loop
- **Wrong:** Triggered `process-document` 25× in a row, every call returning
  `{"code":"WORKER_ERROR","message":"Function exited due to an error"}`. Wasted
  a full tool call per attempt with no new information. The generic body means
  the real error is ONLY in the function logs (MCP `get_logs` edge-function
  returned empty on this project — use the dashboard Log Explorer instead).
- **Right:**
  1. A bare `WORKER_ERROR` 500 with no custom message = an **unhandled throw**,
     usually at **module-load time** (bad `import`, or a top-level
     `GlobalWorkerOptions.workerSrc = <cdn>` assignment that throws in Deno),
     NOT in request logic. The handler's inner try/catch can't catch
     module-level throws.
  2. **Surface the error in the response.** Wrap the handler in try/catch that
     returns `error.message` / `error.stack` as JSON. Then ONE call reveals the
     real cause instead of a generic 500.
  3. **Prefer local `supabase functions serve --debug`** to see the stack —
     but note it requires `supabase start` (a local stack), which this project
     does NOT run (cloud-only). So rely on error-surfacing + dashboard logs.
  4. **Never retry a 500 >2× without new info.** After 2 identical 500s, change
     the code to expose the error or read the logs.

### M9: Missing environment awareness + redundant work
- **Wrong:** Re-running the full ingest script (which re-uploads + re-enqueues)
  when only the queued jobs needed triggering. Also didn't tell the user a step
  was taking many calls.
- **Right:** Check existing DB state first (`documents`/`jobs` counts). If data
  already exists, write a trigger-only script that drains the existing queue
  without re-uploading. Keep the user informed of progress/stage at all times
  (see Rule 8).

### Tooling notes (verified this session)
- Python is at `C:\Users\Dell\AppData\Local\Programs\Python\Python313\python.exe`
  (3.13, `reportlab` 5.0.0, `requests` installed). The `python` on PATH is a
  Windows Store alias stub — use the full path.
- `supabase functions download` did not persist files on this CLI version;
  inspect deployed code via `supabase functions deploy` of known-local source
  instead.
- Synthea FHIR R4 sample (81MB) extracted to
  `C:\Users\Dell\AppData\Local\Temp\opencode\synthea\extracted\fhir\`.
  Rich test patient: `Floyd420_Jerde200_0979f4fe-...json` (8690 obs, 1275 meds).
- 17 synthetic PDFs generated by `tools/fhir_to_pdf.py` →
  `C:\Users\Dell\AppData\Local\Temp\opencode\pipeline_pdfs\`.
- Test auth user (confirmed): `pipeline.test.agent@gmail.com` /
  `pipeline-test-password-123!`.
- Seeded caregiver `42ff81b3-...`, patient `9d2333b4-...` in prod.


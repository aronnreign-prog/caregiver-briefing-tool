# Supabase Task Agent — Instructions

Reusable prompt template for launching a subagent that handles all Supabase
tasks for this project (DB queries, secrets, Edge Functions, RLS, migrations).

## How to launch
Use the Task tool with `subagent_type: general` and paste the prompt below,
filling in the `<TASK>` section.

## Fixed context (always include)
- Project root: C:\Users\Dell\caregiver-briefing-tool
- Supabase project ref: `qtwxthxhwwqovpcqrdqj` (linked via Supabase CLI 2.109.1)
- FIRST load the Supabase skill by reading
  `C:\Users\Dell\caregiver-briefing-tool\.agents\skills\supabase\SKILL.md`
  and follow its guidance (use `supabase db query --linked` for SQL, never paste
  API keys into curl, manage secrets via `supabase secrets set`).
- DB access: `supabase db query --linked "<SQL>"` (CLI v2.109 supports this).
- Secrets: `supabase secrets set KEY=VALUE --project-ref qtwxthxhwwqovpcqrdqj`
  and `supabase secrets list --project-ref qtwxthxhwwqovpcqrdqj`.
- Edge Function invoke: `supabase functions invoke process-document --project-ref qtwxthxhwwqovpcqrdqj` (or via the linked project).

## Known schema
- `jobs` columns: id, job_type, payload(jsonb with `document_id`), status,
  created_at, started_at, completed_at, worker_id, attempts, max_attempts,
  error_message, result(jsonb). NO `claimed_at`/`worker_name` columns;
  claiming uses RPC `claim_next_job(worker_name)`.
- `documents` columns: id, patient_id, caregiver_id, filename, storage_path,
  file_size, mime_type, status, uploaded_at, processed_at, extracted_text,
  extracted_entities(jsonb), document_date(date), document_type, provider_name,
  error_message.
- Patient Alpha: `9d2333b4-2e40-4565-bcc4-fb73e4c2cb9c`.

## Rules
- Never expose/print the service_role key.
- Verify every change with a follow-up query.
- Report concisely (<250 words) with the actions taken and results.
- Do NOT start/stop the Docker stack or the Cloudflare tunnel unless asked.

## <TASK>
(insert the specific Supabase task here)

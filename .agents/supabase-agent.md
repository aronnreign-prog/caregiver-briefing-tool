# Supabase Task Agent — Instructions

Reusable prompt template for launching a subagent that handles all Supabase
tasks for this project (DB queries, secrets, RLS, schema inspection).

## How to launch
Use the Task tool with `subagent_type: general` and paste the prompt below,
filling in the `<TASK>` section.

## Fixed context (always include)
- Project root: C:\Users\Dell\caregiver-briefing-tool
- Supabase project ref: `qtwxthxhwwqovpcqrdqj` (linked via Supabase CLI)
- FIRST load the Supabase skill by reading
  `C:\Users\Dell\caregiver-briefing-tool\.agents\skills\supabase\SKILL.md`
  and follow its guidance (use `supabase db query --linked` for SQL, manage
  secrets via `supabase secrets set`).
- DB access: `supabase db query --linked "<SQL>"` (CLI v2.109+).
- Secrets: `supabase secrets set KEY=VALUE --project-ref qtwxthxhwwqovpcqrdqj`

## Known schema (2026-08-19 — post-migration)

**Active tables:**
- `caregivers`: id, auth_user_id, email, name, created_at
- `patients`: id, caregiver_id, name, date_of_birth, relationship, created_at
- `documents`: id, patient_id, caregiver_id, filename, storage_path, file_size,
  mime_type, status (uploaded|extracting|extracted|failed), uploaded_at,
  processed_at, extracted_entities(jsonb), document_date, document_type,
  error_message
- `briefings`: id, patient_id, caregiver_id, audience, status
  (queued|processing|complete|failed), created_at, completed_at,
  source_doc_ids(jsonb), briefing_text, claims(jsonb), flagged_concerns(jsonb),
  error_message

**Deleted tables (no longer exist):**
- `jobs` — job queue removed in 2026-08-19 migration
- `audit_log` — if existed, not used by current code

**Storage:** `medical_records` bucket (private, PDFs per patient)

## Rules
- Never expose/print the service_role key.
- Verify every change with a follow-up query.
- Report concisely (<250 words) with the actions taken and results.
- Do NOT reference jobs table, Edge Functions, or Python wrapper — all deleted.

## <TASK>
(insert the specific Supabase task here)
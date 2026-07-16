-- Migration: create claim_next_job RPC (SKIP LOCKED job queue worker)
-- Fixes documented mistake #5: pipeline was non-functional because both
-- Edge Functions call supabaseClient.rpc('claim_next_job', ...) but the
-- function never existed. This implements the Postgres-as-queue pattern
-- from docs/specs/bi-temporal-schema.sql (THE SKIP LOCKED QUEUE PATTERN).

drop function if exists public.claim_next_job(text);

create or replace function public.claim_next_job(worker_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job jsonb;
begin
  -- Atomically claim the oldest queued job and mark it processing.
  -- FOR UPDATE SKIP LOCKED lets multiple Edge Function instances
  -- run in parallel without double-claiming the same job.
  select jsonb_build_object(
    'id', j.id,
    'job_type', j.job_type,
    'payload', j.payload,
    'attempts', j.attempts,
    'max_attempts', j.max_attempts
  )
  into claimed_job
  from public.jobs j
  where j.status = 'queued'
  order by j.created_at asc
  for update skip locked
  limit 1;

  if claimed_job is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing',
      started_at = now(),
      worker_id = worker_name
  where id = (claimed_job->>'id')::uuid;

  return claimed_job;
end;
$$;

-- Grant to the postgres role used by the Edge Functions (service role).
grant execute on function public.claim_next_job(text) to service_role;

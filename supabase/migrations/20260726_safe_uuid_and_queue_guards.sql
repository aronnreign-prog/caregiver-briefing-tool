-- Migration: Safe UUID casting and Queue Guards
-- Prevents Postgres crashes on invalid input syntax for type uuid (e.g. 'undefined', 'null')

drop function if exists public.safe_cast_uuid(text);

create or replace function public.safe_cast_uuid(text_value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if text_value is null or text_value = '' or text_value = 'undefined' or text_value = 'null' then
    return null;
  end if;
  if text_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return text_value::uuid;
  else
    return null;
  end if;
exception when others then
  return null;
end;
$$;

grant execute on function public.safe_cast_uuid(text) to authenticated, service_role, anon;

-- Update claim_next_job with safe UUID casting
create or replace function public.claim_next_job(worker_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_job jsonb;
  target_id uuid;
begin
  select jsonb_build_object(
    'id', j.id,
    'job_type', j.job_type,
    'payload', j.payload,
    'attempts', j.attempts,
    'max_attempts', j.max_attempts
  )
  into claimed_job
  from public.jobs j
  where j.status in ('queued', 'UPLOADED')
  order by j.created_at asc
  for update skip locked
  limit 1;

  if claimed_job is null then
    return null;
  end if;

  target_id := public.safe_cast_uuid(claimed_job->>'id');
  if target_id is null then
    return null;
  end if;

  update public.jobs
  set status = 'processing',
      started_at = now(),
      worker_id = worker_name
  where id = target_id;

  return claimed_job;
end;
$$;

grant execute on function public.claim_next_job(text) to authenticated, service_role, anon;

-- Update reset_stale_jobs with safe execution
create or replace function public.reset_stale_jobs(timeout_minutes int default 15)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_updated int;
begin
  update public.jobs
  set status = 'queued',
      started_at = null,
      worker_id = null,
      attempts = attempts + 1
  where status = 'processing'
    and started_at < now() - (timeout_minutes || ' minutes')::interval
    and attempts < max_attempts;

  get diagnostics rows_updated = row_count;
  return rows_updated;
end;
$$;

grant execute on function public.reset_stale_jobs(int) to authenticated, service_role, anon;

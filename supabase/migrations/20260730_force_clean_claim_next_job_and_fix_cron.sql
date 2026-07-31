-- Migration: force-clean claim_next_job overloads, add pg_cron reset job,
--            and fix the wake-process timeout so the queue can recover.

-- =============================================================================
-- 1. Drop ALL overloads of claim_next_job, then recreate the canonical version
--    with the job_type_filter capability and safe_cast_uuid.
-- =============================================================================

drop function if exists public.claim_next_job(text);
drop function if exists public.claim_next_job(text, text);

create or replace function public.claim_next_job(worker_name text, job_type_filter text default null)
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
  where j.status = 'queued'
    and (job_type_filter is null or j.job_type = job_type_filter)
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

grant execute on function public.claim_next_job(text, text) to authenticated, service_role, anon;
grant execute on function public.claim_next_job(text) to authenticated, service_role, anon;

-- =============================================================================
-- 2. Schedule reset_stale_jobs every 5 minutes to recover jobs stuck in
--    'processing' because of Edge Function crashes or pg_cron timeouts.
-- =============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reset-stale-jobs') then
    perform cron.unschedule('reset-stale-jobs');
  end if;
end $$;

select cron.schedule(
  'reset-stale-jobs',
  '*/5 * * * *',
  $$SELECT public.reset_stale_jobs(15)$$
);

-- =============================================================================
-- 3. Remove old single-param pg_cron wakes and reschedule with safe timeouts
-- =============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wake-process-document') then
    perform cron.unschedule('wake-process-document');
  end if;
  if exists (select 1 from cron.job where jobname = 'wake-process-briefing') then
    perform cron.unschedule('wake-process-briefing');
  end if;
end $$;

select cron.schedule(
  'wake-process-document',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url => 'https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-document',
    headers => '{"Content-Type":"application/json"}'::jsonb,
    body => '{"worker_name":"pgcron-worker"}'::jsonb,
    timeout_milliseconds := 300000
  )$$
);

select cron.schedule(
  'wake-process-briefing',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url => 'https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-briefing',
    headers => '{"Content-Type":"application/json"}'::jsonb,
    body => '{"worker_name":"pgcron-worker"}'::jsonb,
    timeout_milliseconds := 300000
  )$$
);

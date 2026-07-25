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

  update public.jobs
  set status = 'processing',
      started_at = now(),
      worker_id = worker_name
  where id = (claimed_job->>'id')::uuid;

  return claimed_job;
end;
$$;

grant execute on function public.claim_next_job(text) to authenticated, service_role, anon;

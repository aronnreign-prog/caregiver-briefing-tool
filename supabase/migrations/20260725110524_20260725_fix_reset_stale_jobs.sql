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

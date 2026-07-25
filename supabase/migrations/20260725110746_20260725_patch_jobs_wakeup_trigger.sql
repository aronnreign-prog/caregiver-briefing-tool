create or replace function public.jobs_after_insert_wakeup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.status in ('queued', 'UPLOADED') then
    begin
      perform net.http_post(
        'https://caregiver-briefing-tool.onrender.com',
        '{"Content-Type":"application/json"}'::jsonb,
        jsonb_build_object(
          'source', 'supabase',
          'event', 'jobs.insert',
          'status', NEW.status,
          'job_type', NEW.job_type,
          'job_id', NEW.id
        ),
        3000
      );
    exception
      when undefined_function then
        null;
      when others then
        null;
    end;
  end if;

  return NEW;
end;
$$;

drop trigger if exists jobs_after_insert_wakeup on public.jobs;

create trigger jobs_after_insert_wakeup
  after insert on public.jobs
  for each row
  execute function public.jobs_after_insert_wakeup();

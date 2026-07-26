drop trigger if exists jobs_after_insert_wakeup on public.jobs;
drop function if exists public.jobs_after_insert_wakeup();
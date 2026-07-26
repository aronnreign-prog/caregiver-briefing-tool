select cron.schedule(
  'wake-process-document',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url => 'https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-document',
    headers => '{"Content-Type":"application/json"}'::jsonb,
    body => '{"worker_name":"pgcron-worker"}'::jsonb,
    timeout_milliseconds := 10000
  )$$
);

select cron.schedule(
  'wake-process-briefing',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url => 'https://qtwxthxhwwqovpcqrdqj.supabase.co/functions/v1/process-briefing',
    headers => '{"Content-Type":"application/json"}'::jsonb,
    body => '{"worker_name":"pgcron-worker"}'::jsonb,
    timeout_milliseconds := 10000
  )$$
);

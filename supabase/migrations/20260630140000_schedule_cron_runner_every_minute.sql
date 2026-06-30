-- Migration: Schedule cron-runner every minute
-- This triggers the jobs-processor which handles BEEIA_PROCESS_MESSAGE, META_PUBLISH, etc.

select cron.schedule(
  'cron-runner-every-minute',
  '* * * * *',
  $$
  select net.http_post(
      url:='https://pryoirzeghatrgecwrci.supabase.co/functions/v1/cron-runner',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYxNzMwMSwiZXhwIjoyMDg1MTkzMzAxfQ.vJtrz5lWyGMiqXOkLhM6eqF-A_j2HNeXqwPOjDdMrks"}'::jsonb
  ) as request_id;
  $$
);

-- Remove old incorrect cron job
select cron.unschedule('invoke-meta-publisher');

-- Add new correct cron job
select cron.schedule(
  'invoke-meta-publish',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-publish'
  );
  $$
);

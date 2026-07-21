-- Remove the incorrect one
select cron.unschedule('invoke-meta-publish');

-- Add back the correct one for the planner
select cron.schedule(
  'invoke-meta-publisher',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-publisher'
  );
  $$
);

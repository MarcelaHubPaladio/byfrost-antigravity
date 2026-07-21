create extension if not exists pg_cron;

select cron.schedule(
  'invoke-meta-publisher',
  '*/5 * * * *',
  $$
  select net.http_post(
      url:='https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-publisher'
  );
  $$
);

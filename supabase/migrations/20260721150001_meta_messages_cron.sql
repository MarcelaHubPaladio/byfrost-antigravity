select cron.schedule(
  'invoke-meta-dms-ingestion',
  '* * * * *',
  $$
  select net.http_post(
      url:='https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-dms-ingestion'
  );
  $$
);

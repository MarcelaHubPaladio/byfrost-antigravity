fetch("https://pryoirzeghatrgecwrci.supabase.co/functions/v1/meta-dms-ingestion", { method: "POST" })
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

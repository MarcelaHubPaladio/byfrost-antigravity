import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: bg } = await supabase
    .from("beeia_cs_groups")
    .select("*")
    .limit(1)
    .single();

  console.log("Group:", bg.group_name, bg.commitment_id);

  const res = await fetch(`${supabaseUrl}/functions/v1/m30-operational-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`
    },
    body: JSON.stringify({ tenantId: bg.tenant_id, commitmentId: bg.commitment_id })
  });
  
  const opContextRes = await res.json();

  console.log("Operational Context Response:");
  console.log(JSON.stringify(opContextRes, null, 2));
}

main();

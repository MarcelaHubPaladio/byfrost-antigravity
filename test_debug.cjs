const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: pData } = await supabase.from('incentive_participants').select('id, user_id, tenant_id').limit(3);
  console.log("participants:", pData);
  
  const { data: cpData } = await supabase.from('campaign_participants').select('id, participant_id, campaign_id').limit(3);
  console.log("campaign participants:", cpData);

  const { data: eData } = await supabase.from('incentive_events').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("latest events:", eData);
}
run();

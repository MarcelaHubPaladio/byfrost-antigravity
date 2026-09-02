require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const caseId = 'b0d4ace5-3d26-4525-92f0-f08cb561d40d';
  const { data, error } = await supabase.from('cases').select('*').eq('id', caseId).single();
  console.log("Case:", data);
  if (error) console.error("Error:", error);
  
  const { data: logs, error: logsErr } = await supabase.from('case_journey_logs').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
  console.log("Logs:", logs);
  if (logsErr) console.error("Logs Error:", logsErr);
}
run();

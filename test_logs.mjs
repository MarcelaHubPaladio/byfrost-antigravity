import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length) {
    env[key.trim()] = value.join('=').trim().replace(/(^'|'$|^"|"$)/g, '');
  }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const caseId = 'b0d4ace5-3d26-4525-92f0-f08cb561d40d';
  console.log("Fetching case:", caseId);
  const { data: c, error: errC } = await supabase.from('cases').select('*').eq('id', caseId).single();
  if (errC) console.error("Error cases:", errC);
  console.log("Case:", c);
  
  const { data: logs, error: errLogs } = await supabase.from('case_journey_logs').select('*').eq('case_id', caseId).order('created_at', { ascending: false });
  if (errLogs) console.error("Error logs:", errLogs);
  console.log("Logs:", logs);
}
run();

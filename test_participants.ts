import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('incentive_participants').select('*').limit(5);
  console.log("participants:", data);
  const { data: d2, error: e2 } = await supabase.from('incentive_events').select('*').limit(5);
  console.log("events:", d2);
}
run();

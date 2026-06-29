import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('commercial_commitments').select('id, metadata').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
run();

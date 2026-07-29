import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  // try to insert a record with null contract_id
  const { data, error } = await supabaseAdmin.from('entity_reports').insert({
    tenant_id: '11111111-1111-1111-1111-111111111111', // dummy UUID
    entity_id: '11111111-1111-1111-1111-111111111111', // dummy UUID
    contract_id: null,
    period_name: 'Test',
    start_date: new Date().toISOString(),
    end_date: new Date().toISOString()
  }).select();
  
  console.log("Error:", error);
}
check();

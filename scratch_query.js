import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  for (let i = 0; i < 6; i++) {
    const { data } = await supabase
      .from("job_queue")
      .select("status, payload_json")
      .eq("id", "c17bc487-1f58-4a06-bd5b-0bc1b4e8dbac")
      .single();

    console.log(`[${i}] Status: ${data.status}`);
    if (data.status !== 'pending') {
      console.log('Result payload:', JSON.stringify(data.payload_json, null, 2));
      break;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
}

main();

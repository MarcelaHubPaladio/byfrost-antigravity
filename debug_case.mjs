import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://pryoirzeghatrgecwrci.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const caseId = "631cb0e5-0655-4c04-9181-744b26e78b44";
  const { data: c, error: ce } = await supabase.from("cases").select("*, journeys(*)").eq("id", caseId).single();

  // Try to find by any case if specific ID fails due to permissions (though ID should work if shared)
  // But wait, if I can't read cases, I can at least read JOURNEYS.

  const { data: journeys, error: jErr } = await supabase.from("journeys").select("*").eq("key", "sales_order");
  if (jErr) {
    console.error("Journeys Error:", jErr);
    return;
  }

  console.log("--- Journeys found ---");
  journeys.forEach(j => {
    console.log(`ID: ${j.id}, Key: ${j.key}, Name: ${j.name}`);
    console.log("Config:", JSON.stringify(j.default_state_machine_json?.status_configs || {}, null, 2));
  });
}

check();

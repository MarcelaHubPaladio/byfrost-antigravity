import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing ENV vars:", { url: !!url, key: !!key });
  process.exit(1);
}

const supabase = createClient(url, key);
const targetCaseId = "631cb0e5-0655-4c04-9181-744b26e78b44";

async function main() {
  console.log("Checking case:", targetCaseId);
  try {
    const { data: caseData, error: caseError } = await supabase
      .from("cases")
      .select("id, state, tenant_id, journey_id, journeys(default_state_machine_json)")
      .eq("id", targetCaseId)
      .maybeSingle();

    if (caseError) {
      console.error("Error fetching case:", caseError);
    } else if (!caseData) {
      console.log("Case not found (maybe RLS?)");
    } else {
      console.log("Case State:", caseData.state);
      console.log("Journey Config:", JSON.stringify(caseData.journeys?.default_state_machine_json?.status_configs, null, 2));
    }
  } catch (err) {
    console.error("Execution error:", err);
  }
}
main();

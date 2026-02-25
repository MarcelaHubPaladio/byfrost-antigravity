import { createClient } from "@supabase/supabase-js";
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase
    .from("journeys")
    .select("id, name, default_state_machine_json")
    .eq("key", "sales_order")
    .single();

  if (error) {
    console.log("Error:", JSON.stringify(error));
  } else {
    console.log("States:", JSON.stringify(data.default_state_machine_json.states));
    console.log("Status Config Keys:", JSON.stringify(Object.keys(data.default_state_machine_json.status_configs || {})));
  }
}
main();

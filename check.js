const { createClient } = require("@supabase/supabase-js");
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);
const id = "631cb0e5-0655-4c04-9181-744b26e78b44";

async function main() {
  console.log("Starting check for ID:", id);
  const { data, error } = await supabase.from("cases").select("id, state, journeys(default_state_machine_json)").eq("id", id).maybeSingle();
  if (error) {
     console.log("Data Error:", error.message);
  } else if (!data) {
     console.log("No data found - RLS might be active for ANON key.");
  } else {
     console.log("State in DB:", data.state);
     const configs = data.journeys?.default_state_machine_json?.status_configs || {};
     console.log("Config keys available:", Object.keys(configs));
  }
}
main();

import { supabase } from "./src/lib/supabase";

async function check() {
  const { data, error } = await supabase.from("case_fields").select("source").limit(100);
  if (error) {
    console.error("Error fetching sources:", error);
    return;
  }
  const sources = Array.from(new Set(data.map(d => d.source)));
  console.log("Existing sources in case_fields:", sources);
}

check();

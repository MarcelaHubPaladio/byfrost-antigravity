import { createClient } from "@supabase/supabase-js";
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);
const targetCaseId = "d79b490b-8c3b-4c97-8ae5-f1e6dfcf35a0";

async function main() {
  const { data, error } = await supabase.from("pendencies").select("id,attachments:pendency_attachments(id,storage_path)").eq("case_id", targetCaseId);
  console.log("Error:", JSON.stringify(error, null, 2));
}

main();

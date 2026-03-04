import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Read env.local manually
const envContent = fs.readFileSync(".env.local", "utf8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/SUPABASE_ACCESS_TOKEN=(.+)/); // service key substitute? No, use admin if available

// We need an admin bypass to check the query. The user doesn't have service_role in env.local.
// Let's use the DB_PASS_SUPABASE to connect directly if possible? No.

// I will just fetch using anon key and hoping for the best.
const supabaseUrl = urlMatch ? urlMatch[1].trim() : "";
const anonMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
const supabaseKey = anonMatch ? anonMatch[1].trim() : "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from("cases")
        .select("id, title, customer_accounts:customer_accounts(name)")
        .limit(1);

    console.log("Error:", error);
    console.log("Data:", JSON.stringify(data, null, 2));
}

check();

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// Read env.local manually
const envContent = fs.readFileSync(".env.local", "utf8");
const urlMatch = envContent.match(/VITE_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);

const supabaseUrl = urlMatch ? urlMatch[1].trim() : "";
const supabaseKey = keyMatch ? keyMatch[1].trim() : "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const activeTenantId = "25c9b68a-ef89-4e0d-bae7-e23e200dbfdd" // Just a guess, let's pull from one of the cases. First, fetch a case to get tenant.
    const { data: casesData } = await supabase.from("cases").select("id, title, tenant_id, customer_id").neq("status", "closed").limit(10);

    if (!casesData || casesData.length === 0) { console.log("No cases"); return; }

    for (const c of casesData) {
        console.log(`Case ${c.id} CustomerId: ${c.customer_id}`);
    }
}

check();

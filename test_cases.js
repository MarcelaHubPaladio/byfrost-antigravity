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
    const { data, error } = await supabase
        .from("cases")
        .select("id, title, customer_id, customer_entity_id, status")
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(10);

    if (error) {
        console.error("Join error:", error.message);
    } else {
        // print out IDs safely
        for (const row of data) {
            console.log(`[CASE ${row.id}] Title: ${row.title} | Cust: ${row.customer_id} | Entity: ${row.customer_entity_id}`);
        }
    }
}

check();


import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://pryoirzeghatrgecwrci.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("--- DEBUG START (Node ESM) ---");

    // 1. Find Tenant (m30)
    const { data: tenant } = await supabase.from("tenants").select("id, slug").eq("slug", "m30").single();

    if (!tenant) {
        console.log("Tenant m30 not found. Listing first active:");
        const { data: anyTenant } = await supabase.from("tenants").select("id, slug").limit(1).single();
        if (!anyTenant) { console.error("No tenants."); return; }
        console.log("Using fallback tenant:", anyTenant);
        var tenantId = anyTenant.id;
    } else {
        console.log("Tenant found:", tenant);
        var tenantId = tenant.id;
    }

    // 2. Find Entity (Bruno Songs)
    const { data: entities } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", tenantId)
        .ilike("display_name", "%Bruno Songs%")
        .limit(5);

    console.log("Entity Search Result:", entities);
    const entityId = entities?.[0]?.id;

    if (entityId) {
        // 3. Find Cases 
        const { data: cases } = await supabase
            .from("cases")
            .select("id, title, status, journey_id, customer_entity_id, meta_json")
            .eq("tenant_id", tenantId)
            .eq("customer_entity_id", entityId);

        console.log(`Cases for Entity ${entityId}:`, cases?.length);

        const caseIds = cases?.map(c => c.id) || [];
        if (caseIds.length > 0) {
            // Check tasks 
            const { data: tasks } = await supabase
                .from("tasks")
                .select("id, title, case_id")
                .in("case_id", caseIds);

            console.log("Tasks linked to cases:", tasks);
        }

        // 4. Check Chat Messages (Group ID check)
        const groupIdFragment = "kO0KnrbKlzGGnVARCsVa5";
        const { data: msgs } = await supabase
            .from("wa_messages")
            .select("id, from_phone, to_phone, body_text")
            .eq("tenant_id", tenantId)
            .or(`from_phone.ilike.%${groupIdFragment}%,to_phone.ilike.%${groupIdFragment}%`)
            .limit(10);

        console.log(`Messages matching '${groupIdFragment}':`, msgs);

        // 5. Check actual status of group messages
        // Z-API might ignore them if we don't have this group mapped? 
        // User says "messages not showing".
    }

    console.log("--- DEBUG END ---");
}

run();

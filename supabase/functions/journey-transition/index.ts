import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Shared Types (duplicated because we can't easily import from src/lib inside edge functions without complex build steps)
interface ActionConfig {
    type: string;
    params: Record<string, any>;
    condition?: string;
}

interface StateMachine {
    states: string[];
    default: string;
    transitions?: Record<string, ActionConfig[]>;
}

// Handler Logic
serve(async (req) => {
    try {
        const { record, old_record, tenant_id } = await req.json();

        // Basic validation
        if (!record || !tenant_id) {
            return new Response("Missing record or tenant_id", { status: 400 });
        }

        const newState = record.state;
        const oldState = old_record?.state || null;
        const caseId = record.id;

        // If state didn't change (and we have old_record), skip
        if (old_record && newState === oldState) {
            return new Response(JSON.stringify({ message: "No state change" }), { headers: { "Content-Type": "application/json" } });
        }

        console.log(`[JourneyTransition] Case ${caseId} moved from ${oldState} to ${newState}`);

        // Initialize Supabase Client (Service Role for reading configs/writing logs)
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Fetch Journey Config
        // 1. Get case journey_id/details first (if not in record) or get tenant journey config
        // Actually, 'cases' table has 'journey_id' usually. Let's check if we need to fetch it.
        // Assuming record has journey_id. If not, we might need to fetch case. Let's trust record for now.
        // Wait, the case record structure might not have full journey config json.
        // We need to fetch the 'journeys' definition AND 'tenant_journeys' config.

        // Fetch case with journey relation to get key, and tenant_journeys for config
        const { data: caseData, error: caseError } = await supabaseClient
            .from("cases")
            .select(`
                journey_id,
                journeys:journey_id (
                    default_state_machine_json
                )
            `)
            .eq("id", caseId)
            .single();

        if (caseError || !caseData) {
            console.error("Failed to fetch case data", caseError);
            return new Response("Failed to fetch case data", { status: 500 });
        }

        const journeyConfig = caseData.journeys?.default_state_machine_json as StateMachine;

        if (!journeyConfig?.transitions) {
            return new Response(JSON.stringify({ message: "No transitions configured" }), { headers: { "Content-Type": "application/json" } });
        }

        // Action Logic (Ported from actions.ts)
        const exactMatch = oldState ? `${oldState}->${newState}` : `->${newState}`;
        const wildcardMatch = `->${newState}`; // Any to New

        const actions = [
            ...(journeyConfig.transitions[exactMatch] || []),
            ...(oldState && exactMatch !== wildcardMatch ? (journeyConfig.transitions[wildcardMatch] || []) : [])
        ];

        if (actions.length === 0) {
            return new Response(JSON.stringify({ message: "No actions for this transition" }), { headers: { "Content-Type": "application/json" } });
        }

        console.log(`[JourneyTransition] Executing ${actions.length} actions...`);

        const results = [];

        for (const action of actions) {
            try {
                // Execute Action
                await executeAction(action, { tenantId: tenant_id, caseId, record }, supabaseClient);
                results.push({ type: action.type, status: "success" });
            } catch (e: any) {
                console.error(`Action ${action.type} failed`, e);
                results.push({ type: action.type, status: "error", error: e.message });
            }
        }

        return new Response(JSON.stringify({ results }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (e: any) {
        console.error("Error processing request", e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
});

async function executeAction(action: ActionConfig, ctx: { tenantId: string; caseId: string, record: any }, supabase: any) {
    const { tenantId, caseId } = ctx;

    if (action.type === 'send_whatsapp') {
        const { template, to } = action.params;
        console.log(`[Action:send_whatsapp] Sending ${template} to ${to}`);
        // Log to timeline as evidence
        await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "automation_executed",
            actor_type: "system",
            message: `Automação (Edge): Enviar WhatsApp (${template})`,
            meta_json: { action, source: "edge_function" },
            occurred_at: new Date().toISOString(),
        });
    }
    else if (action.type === 'create_trello_card') {
        console.log(`[Action:create_trello_card] List: ${action.params.list_id}`);
        await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "automation_executed",
            actor_type: "system",
            message: `Automação (Edge): Criar Card Trello`,
            meta_json: { action, source: "edge_function" },
            occurred_at: new Date().toISOString(),
        });
    }
    else if (action.type === 'webhook') {
        if (action.params.url) {
            const res = await fetch(action.params.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId,
                    caseId,
                    action: action.type,
                    params: action.params,
                    record: ctx.record,
                    timestamp: new Date().toISOString()
                })
            });
            console.log(`[Action:webhook] Status ${res.status}`);
        }
    }
}

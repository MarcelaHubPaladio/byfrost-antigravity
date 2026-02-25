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
        const payload = await req.json();
        const record = payload.record;
        const old_record = payload.old_record || null;
        const tenant_id = payload.tenant_id || record?.tenant_id;

        // Basic validation
        if (!record || !tenant_id) {
            console.error("Missing record or tenant_id. Payload:", JSON.stringify(payload));
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
        // 1. Get case details
        const { data: caseData, error: caseError } = await supabaseClient
            .from("cases")
            .select(`
                journey_id,
                tenant_id
            `)
            .eq("id", caseId)
            .single();

        if (caseError || !caseData) {
            console.error("Failed to fetch case data", caseError);
            return new Response("Failed to fetch case data", { status: 500 });
        }

        // 2. Fetch tenant-specific journey config (merging default + tenant overrides)
        const { data: tenantJourney, error: tjError } = await supabaseClient
            .from("tenant_journeys")
            .select(`
                config_json,
                journeys (
                    default_state_machine_json
                )
            `)
            .eq("tenant_id", tenant_id)
            .eq("journey_id", caseData.journey_id)
            .single();

        if (tjError) {
            console.warn("[JourneyTransition] Failed to fetch tenant_journey config", tjError);
        }

        const defaultJson = (tenantJourney?.journeys as any)?.default_state_machine_json || {};
        const tenantJson = (tenantJourney?.config_json as any) || {};

        // Simple deep merge (labels, status_configs, transitions)
        const journeyConfig = {
            ...defaultJson,
            ...tenantJson,
            labels: { ...(defaultJson.labels || {}), ...(tenantJson.labels || {}) },
            status_configs: { ...(defaultJson.status_configs || {}), ...(tenantJson.status_configs || {}) },
            transitions: { ...(defaultJson.transitions || {}), ...(tenantJson.transitions || {}) },
        };

        // --- Execute Status Configs Logic ---
        const statusConfigs = journeyConfig.status_configs || {};

        // Normalization: Try exact, then lowercase, then typo-tolerance
        const normalizedNewState = newState.toLowerCase();
        let configForNext = statusConfigs[newState] || statusConfigs[normalizedNewState];

        if (!configForNext && (normalizedNewState === "em_anlise" || normalizedNewState === "em_analise")) {
            configForNext = statusConfigs["em_analise"] || statusConfigs["em_anlise"];
        }

        if (oldState !== newState) {
            console.log(`[JourneyTransition] State changed to: ${newState}. configForNext present: ${!!configForNext}`);

            // 1. Update responsible_id (Always sync with config: set ID or set NULL if missing)
            // This ensures "Sem Responsável" if the state has no config or no responsible_id
            const targetResponsibleId = configForNext?.responsible_id || null;

            try {
                const { error: updateErr } = await supabaseClient.from("cases").update({
                    assigned_user_id: targetResponsibleId
                }).eq("id", caseId);

                if (updateErr) throw updateErr;

                await supabaseClient.from("timeline_events").insert({
                    tenant_id,
                    case_id: caseId,
                    event_type: "case_updated",
                    actor_type: "system",
                    message: targetResponsibleId
                        ? `Responsável atualizado automaticamente pela entrada no status ${newState}.`
                        : `Responsável removido automaticamente (entrada no status ${newState}).`,
                    meta_json: { responsible_id: targetResponsibleId },
                    occurred_at: new Date().toISOString(),
                });
            } catch (err: any) {
                console.error("[JourneyTransition] Failed to update responsible_id", err);
                if (targetResponsibleId) {
                    await supabaseClient.from("timeline_events").insert({
                        tenant_id,
                        case_id: caseId,
                        event_type: "automation_executed",
                        actor_type: "system",
                        message: `Falha na atribuição automática: O responsável configurado (${targetResponsibleId}) não é um Usuário válido.`,
                        meta_json: { error: err.message, config: targetResponsibleId },
                        occurred_at: new Date().toISOString(),
                    });
                }
            }
        }

        if (configForNext && oldState !== newState) {
            console.log(`[JourneyTransition] Applying additional status_configs (tasks) for state: ${newState}`);
            // 2. Create mandatory tasks as pendencies
            if (Array.isArray(configForNext.mandatory_tasks) && configForNext.mandatory_tasks.length > 0) {
                try {
                    // Fetch existing pendencies to avoid duplicates
                    const { data: existingPendencies } = await supabaseClient
                        .from("pendencies")
                        .select("question_text, status")
                        .eq("case_id", caseId);

                    const existingTexts = new Set((existingPendencies || []).map(p => p.question_text));

                    const pendenciesToInsert = configForNext.mandatory_tasks
                        .filter((task: any) => !existingTexts.has(task.description))
                        .map((task: any) => ({
                            // REMOVED tenant_id as it is missing from remote DB schema for this table
                            case_id: caseId,
                            // Using 'need_location' as a safe default type because 'text' is blocked by a check constraint
                            type: task.type || "need_location",
                            assigned_to_role: task.assigned_to_role || "admin",
                            question_text: task.description,
                            required: task.required !== false,
                            status: "open",
                            answered_payload_json: {
                                ...(task.require_attachment ? { require_attachment: true } : {}),
                                ...(task.require_justification ? { require_justification: true } : {})
                            },
                        }));

                    if (pendenciesToInsert.length > 0) {
                        console.log(`[JourneyTransition] Inserting ${pendenciesToInsert.length} new pendencies for case ${caseId}`);
                        const { error: pendErr } = await supabaseClient.from("pendencies").insert(pendenciesToInsert);
                        if (pendErr) throw pendErr;

                        await supabaseClient.from("timeline_events").insert({
                            tenant_id,
                            case_id: caseId,
                            event_type: "automation_executed",
                            actor_type: "system",
                            message: `${pendenciesToInsert.length} novas tarefas obrigatórias criadas para o status ${newState}.`,
                            meta_json: {
                                task_count: pendenciesToInsert.length,
                                tasks: pendenciesToInsert.map((t: any) => t.question_text)
                            },
                            occurred_at: new Date().toISOString(),
                        });
                    } else {
                        console.log(`[JourneyTransition] All ${configForNext.mandatory_tasks.length} mandatory tasks already exist for case ${caseId}. Skipping.`);
                    }
                } catch (err: any) {
                    console.error("[JourneyTransition] Failed to create mandatory pendencies", err);
                    await supabaseClient.from("timeline_events").insert({
                        tenant_id,
                        case_id: caseId,
                        event_type: "automation_executed",
                        actor_type: "system",
                        message: `Falha ao criar tarefas obrigatórias: ${err.message}`,
                        meta_json: { error: err.message, config: configForNext.mandatory_tasks },
                        occurred_at: new Date().toISOString(),
                    });
                }
            }
        }
        // --- End Status Configs Logic ---

        if (!journeyConfig?.transitions) {
            return new Response(JSON.stringify({ message: "Processed status_configs. No transitions configured." }), { headers: { "Content-Type": "application/json" } });
        }

        // Action Logic (Ported from actions.ts)
        const exactMatch = oldState ? `${oldState}->${newState}` : `->${newState}`;
        const wildcardMatch = `->${newState}`; // Any to New

        const actions = [
            ...(journeyConfig.transitions[exactMatch] || []),
            ...(oldState && exactMatch !== wildcardMatch ? (journeyConfig.transitions[wildcardMatch] || []) : [])
        ];

        if (actions.length === 0) {
            return new Response(JSON.stringify({ message: "Processed status_configs. No actions for this transition" }), { headers: { "Content-Type": "application/json" } });
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

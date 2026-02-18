import { ActionConfig, ActionType, StateMachine } from "./types";
import { supabase } from "@/lib/supabase";

export interface ActionContext {
    tenantId: string;
    caseId: string;
    action: ActionConfig;
    user?: { id: string; email?: string };
}

type ActionHandler = (ctx: ActionContext) => Promise<void>;

const handlers: Record<ActionType, ActionHandler> = {
    send_whatsapp: async ({ tenantId, caseId, action }) => {
        // Exemplo: { template: 'welcome', to_role: 'customer' }
        // Implementação real viria aqui (chamar Edge Function ou tabela de mensagens)
        console.log(`[Action:send_whatsapp] Case ${caseId} (${tenantId})`, action.params);

        // Por enquanto, apenas loga no timeline para evidência
        await supabase.from("timeline_events").insert({
            tenant_id: tenantId,
            case_id: caseId,
            event_type: "automation_executed",
            actor_type: "system",
            message: `Automação executada: Enviar WhatsApp (${action.params.template || 'default'})`,
            meta_json: { action },
            occurred_at: new Date().toISOString(),
        });
    },

    create_trello_card: async ({ tenantId, caseId, action }) => {
        console.log(`[Action:create_trello_card] Case ${caseId}`, action.params);
    },

    update_case_field: async ({ tenantId, caseId, action }) => {
        console.log(`[Action:update_case_field] Case ${caseId}`, action.params);
    },

    webhook: async ({ tenantId, caseId, action }) => {
        console.log(`[Action:webhook] Case ${caseId}`, action.params);
        if (action.params.url) {
            try {
                await fetch(action.params.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tenantId, caseId, params: action.params, timestamp: new Date() })
                });
            } catch (e) {
                console.error("Webhook failed", e);
            }
        }
    },
};

export async function executeTransitionActions(
    tenantId: string,
    caseId: string,
    oldState: string | null,
    newState: string,
    journeyConfig: StateMachine,
    user?: { id: string }
) {
    if (!journeyConfig.transitions) return;

    // Busca transições que batem com "origem->destino" ou "->destino"
    const exactMatch = oldState ? `${oldState}->${newState}` : `->${newState}`;
    const wildcardMatch = `->${newState}`;

    const actions = [
        ...(journeyConfig.transitions[exactMatch] || []),
        ...(oldState && exactMatch !== wildcardMatch ? (journeyConfig.transitions[wildcardMatch] || []) : [])
    ];

    if (actions.length === 0) return;

    console.log(`[JourneyActions] Found ${actions.length} actions for transition ${oldState} -> ${newState}`);

    for (const action of actions) {
        const handler = handlers[action.type];
        if (handler) {
            try {
                await handler({ tenantId, caseId, action, user });
            } catch (e) {
                console.error(`[JourneyActions] Failed to execute ${action.type}`, e);
                // Opcional: registrar erro no timeline
            }
        } else {
            console.warn(`[JourneyActions] No handler for action type: ${action.type}`);
        }
    }
}

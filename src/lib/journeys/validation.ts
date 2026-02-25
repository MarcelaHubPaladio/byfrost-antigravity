import { SupabaseClient } from "@supabase/supabase-js";

export type TransitionBlockReason =
    | { type: "missing_fields"; fields: string[] }
    | { type: "open_pendencies"; missingTypes: string[] }
    | { type: "missing_attachments"; missingTypes: string[] }
    | { type: "missing_justifications"; missingTypes: string[] };

export async function checkTransitionBlocks(
    supabase: SupabaseClient,
    tenantId: string,
    caseId: string,
    currentState: string,
    nextState: string,
    journeyConfig: any,
    preFetched?: {
        fields?: any[];
        pendencies?: any[];
    }
): Promise<TransitionBlockReason[]> {
    const statusConfigs = journeyConfig?.status_configs ?? {};

    const getConfig = (st: string) => {
        if (statusConfigs[st]) return statusConfigs[st];
        if (st === "em_anlise") return statusConfigs["em_analise"];
        if (st === "em_analise") return statusConfigs["em_anlise"];
        return {};
    };

    const configForNext = getConfig(nextState);
    const configForCurrent = getConfig(currentState);

    const requiredFields = Array.isArray(configForNext.required_case_fields) ? configForNext.required_case_fields : [];
    const mandatoryTasks = Array.isArray(configForCurrent.mandatory_tasks) ? configForCurrent.mandatory_tasks : [];

    let fields = preFetched?.fields;
    let pendencies = preFetched?.pendencies;

    if (!fields && requiredFields.length > 0) {
        const { data } = await supabase.from("case_fields").select("*").eq("case_id", caseId);
        fields = data ?? [];
    }

    if (!pendencies) {
        const { data } = await supabase.from("pendencies").select("*").eq("case_id", caseId);
        pendencies = data ?? [];
    }

    const blocks: TransitionBlockReason[] = [];

    if (requiredFields.length > 0) {
        const missingFields = requiredFields.filter((reqKey: string) => {
            const field = fields?.find((f: any) => f.key === reqKey);
            const val = typeof field?.value_text === "string" ? field.value_text.trim() : "";
            const hasJson = field?.value_json !== null && field?.value_json !== undefined;
            return !val && !hasJson;
        });
        if (missingFields.length > 0) {
            blocks.push({ type: "missing_fields", fields: missingFields });
        }
    }

    // Filter to check only pendencies that are MANDATORY for the CURRENT state transition
    const isMandatoryForCurrentState = (p: any) => {
        if (!p.required) return false;
        return mandatoryTasks.some((mt: any) => {
            // Match by type (preferred) or by precise description (fallback for UI-configured tasks)
            const typeMatch = mt.type && mt.type === p.type;
            const descriptionMatch = mt.description === p.question_text;
            return typeMatch || descriptionMatch;
        });
    };

    const getLabel = (p: any) => {
        // Try to find a human-readable name from the config first
        const configTask = mandatoryTasks.find((mt: any) => mt.type === p.type);
        return p.question_text || configTask?.name || p.type;
    };

    const openRequiredPendencies = (pendencies ?? []).filter((p: any) => isMandatoryForCurrentState(p) && p.status === "open");
    if (openRequiredPendencies.length > 0) {
        blocks.push({ type: "open_pendencies", missingTypes: openRequiredPendencies.map(getLabel) });
    }

    const missingAttachments = (pendencies ?? []).filter((p: any) => {
        const requireAtt = p.answered_payload_json?.require_attachment === true;
        const hasAtts = !!p.answered_payload_json?.answered_attachment;
        return isMandatoryForCurrentState(p) && requireAtt && !hasAtts;
    });
    if (missingAttachments.length > 0) {
        blocks.push({ type: "missing_attachments", missingTypes: missingAttachments.map(getLabel) });
    }

    const missingJustifications = (pendencies ?? []).filter((p: any) => {
        const requireJust = p.answered_payload_json?.require_justification === true;
        const hasText = typeof p.answered_text === "string" && p.answered_text.trim().length > 0;
        return isMandatoryForCurrentState(p) && requireJust && !hasText;
    });
    if (missingJustifications.length > 0) {
        blocks.push({ type: "missing_justifications", missingTypes: missingJustifications.map(getLabel) });
    }

    return blocks;
}

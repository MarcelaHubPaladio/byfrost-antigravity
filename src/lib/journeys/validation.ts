import { SupabaseClient } from "@supabase/supabase-js";

export type TransitionBlockReason =
    | { type: "missing_fields"; fields: string[] }
    | { type: "open_pendencies" }
    | { type: "missing_attachments" }
    | { type: "missing_justifications" };

export async function checkTransitionBlocks(
    supabase: SupabaseClient,
    tenantId: string,
    caseId: string,
    nextState: string,
    journeyConfig: any,
    preFetched?: {
        fields?: any[];
        pendencies?: any[];
    }
): Promise<TransitionBlockReason[]> {
    const statusConfigs = journeyConfig?.status_configs ?? {};
    const configForNext = statusConfigs[nextState] ?? {};

    const requiredFields = Array.isArray(configForNext.required_case_fields) ? configForNext.required_case_fields : [];

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

    const openRequiredPendencies = (pendencies ?? []).filter((p: any) => p.required && p.status === "open");
    if (openRequiredPendencies.length > 0) {
        blocks.push({ type: "open_pendencies" });
    }

    const missingAttachments = (pendencies ?? []).filter((p: any) => {
        const requireAtt = p.answered_payload_json?.require_attachment === true;
        const hasAtts = !!p.answered_payload_json?.answered_attachment;
        return p.required && requireAtt && !hasAtts;
    });
    if (missingAttachments.length > 0) {
        blocks.push({ type: "missing_attachments" });
    }

    const missingJustifications = (pendencies ?? []).filter((p: any) => {
        const requireJust = p.answered_payload_json?.require_justification === true;
        const hasText = typeof p.answered_text === "string" && p.answered_text.trim().length > 0;
        return p.required && requireJust && !hasText;
    });
    if (missingJustifications.length > 0) {
        blocks.push({ type: "missing_justifications" });
    }

    return blocks;
}

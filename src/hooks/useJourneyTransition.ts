import { useState } from "react";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { supabase } from "@/lib/supabase";
import { getStateLabel } from "@/lib/journeyLabels";
import { executeTransitionActions } from "@/lib/journeys/actions";
import { StateMachine } from "@/lib/journeys/types";
import { showError, showSuccess } from "@/utils/toast";
import { useQueryClient } from "@tanstack/react-query";

export function useJourneyTransition() {
    const { activeTenantId } = useTenant();
    const { user } = useSession();
    const qc = useQueryClient();
    const [updating, setUpdating] = useState(false);

    const transitionState = async (
        caseId: string,
        oldState: string,
        newState: string,
        journeyConfig: StateMachine | undefined | null
    ) => {
        if (!activeTenantId) return;
        if (updating) return;
        if (!newState || newState === oldState) return;

        setUpdating(true);
        try {
            // 1. Atualiza estado no banco
            // O Trigger 'trg_journey_transition' irá detectar a mudança e chamar a Edge Function via pg_net.
            const { error } = await supabase
                .from("cases")
                .update({ state: newState })
                .eq("tenant_id", activeTenantId)
                .eq("id", caseId);

            if (error) throw error;

            const label = getStateLabel(journeyConfig as any, newState);
            showSuccess(`Movido para ${label}.`);

            // 2. Invalida queries para refletir mudança de estado
            await Promise.all([
                qc.invalidateQueries({ queryKey: ["case", activeTenantId, caseId] }),
                qc.invalidateQueries({ queryKey: ["timeline", activeTenantId, caseId] }), // Timeline updates async, but we invalidate anyway
                qc.invalidateQueries({ queryKey: ["cases_by_tenant", activeTenantId] }),
                qc.invalidateQueries({ queryKey: ["crm_cases_by_tenant", activeTenantId] }),
            ]);

        } catch (e: any) {
            showError(`Falha ao mover: ${e?.message ?? "erro"}`);
            // Revert optimistic update? (Not implemented here, rely on react-query re-fetch on error if needed)
            throw e;
        } finally {
            setUpdating(false);
        }
    };

    return {
        transitionState,
        updating
    };
}

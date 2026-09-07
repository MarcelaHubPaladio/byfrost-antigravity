import { SupabaseClient } from '@supabase/supabase-js';

export interface M30OperationalContext {
  client: { id: string; name: string };
  contract: { id: string; status: string; start: string | null; end: string | null };
  scope: { type: string; contracted: number; allocated: number; completed: number; available: number }[];
  current_cycle: {
    id: string;
    name: string;
    start: string | null;
    end: string | null;
    objective: string | null;
    progress: number;
    activeCasesCount: number;
    pendingApprovalsCount: number;
    date_planning: string | null;
    date_recording: string | null;
    date_approval: string | null;
    date_posting: string | null;
    date_report: string | null;
  } | null;
  next_events: { name: string; date: string }[];
  cases: any[];
  operational_notes: string;
  account_context: {
    objective?: string;
    positioning?: string;
    products?: string;
    audience?: string;
    tone?: string;
    included?: string;
    not_included?: string;
    rules?: string;
    client_responsibles?: string;
    commercial_notes?: string;
    production_notes?: string;
  };
}

export async function getClientOperationalContext(
  supabase: SupabaseClient,
  tenantId: string,
  commitmentId: string
): Promise<M30OperationalContext | null> {
  if (!tenantId || !commitmentId) return null;

  try {
    const { data, error } = await supabase.functions.invoke("m30-operational-context", {
      body: { tenantId, commitmentId }
    });

    if (error) {
      console.error("[getClientOperationalContext] Edge Function error:", error);
      return null;
    }

    if (data && data.ok && data.context) {
      return data.context as M30OperationalContext;
    }

    return null;
  } catch (err) {
    console.error("[getClientOperationalContext] Invocation error:", err);
    return null;
  }
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { PublicEntityHistory, type PublicCase, type PublicTimelineEvent } from "@/components/public/PublicEntityHistory";

type CaseRow = {
  id: string;
  case_type: string;
  title: string | null;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
};

type TimelineEventRow = {
  id: string;
  case_id: string | null;
  event_type: string;
  actor_type: string;
  message: string | null;
  occurred_at: string;
  meta_json: any;
};

type CoreEntityEventRow = {
  id: string;
  event_type: string;
  before: any;
  after: any;
  actor_user_id: string | null;
  created_at: string;
};

function safe(s: any) {
  return String(s ?? "").trim();
}

export function EntityHistory({ tenantId, entityId }: { tenantId: string; entityId: string }) {
  const casesQ = useQuery({
    queryKey: ["entity_history_cases", tenantId, entityId],
    enabled: Boolean(tenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id,case_type,title,status,state,created_at,updated_at")
        .eq("tenant_id", tenantId)
        .eq("customer_entity_id", entityId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CaseRow[];
    },
    staleTime: 5_000,
  });

  const caseIds = useMemo(() => {
    return (casesQ.data ?? []).map((c) => String(c.id)).filter(Boolean);
  }, [casesQ.data]);

  const caseEventsQ = useQuery({
    queryKey: ["entity_history_timeline_events", tenantId, caseIds.join(",")],
    enabled: Boolean(tenantId && caseIds.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,case_id,event_type,actor_type,message,occurred_at,meta_json")
        .eq("tenant_id", tenantId)
        .in("case_id", caseIds)
        .order("occurred_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as TimelineEventRow[];
    },
    staleTime: 5_000,
  });

  const entityEventsQ = useQuery({
    queryKey: ["entity_history_core_entity_events", tenantId, entityId],
    enabled: Boolean(tenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entity_events")
        .select("id,event_type,before,after,actor_user_id,created_at")
        .eq("tenant_id", tenantId)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as CoreEntityEventRow[];
    },
    staleTime: 5_000,
  });

  const proposalEventsQ = useQuery({
    queryKey: ["entity_history_proposal_events", tenantId, entityId],
    enabled: Boolean(tenantId && entityId),
    queryFn: async () => {
      // We store party_entity_id in meta_json for proposal lifecycle events.
      const { data, error } = await supabase
        .from("timeline_events")
        .select("id,case_id,event_type,actor_type,message,occurred_at,meta_json")
        .eq("tenant_id", tenantId)
        .is("case_id", null)
        .eq("meta_json->>party_entity_id", entityId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TimelineEventRow[];
    },
    staleTime: 5_000,
  });

  const allEvents = useMemo(() => {
    const entityAsTimeline: TimelineEventRow[] = (entityEventsQ.data ?? []).map((r) => ({
      id: `ce:${String(r.id)}`,
      case_id: null,
      event_type: `entity:${String(r.event_type)}`,
      actor_type: r.actor_user_id ? "admin" : "system",
      message: `Evento da entidade: ${String(r.event_type)}`,
      occurred_at: String(r.created_at),
      meta_json: { before: r.before ?? null, after: r.after ?? null, actor_user_id: r.actor_user_id ?? null },
    }));

    const combined = [...(proposalEventsQ.data ?? []), ...(entityAsTimeline ?? []), ...(caseEventsQ.data ?? [])];
    return combined
      .sort((a, b) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime())
      .slice(0, 800);
  }, [caseEventsQ.data, entityEventsQ.data, proposalEventsQ.data]);

  const isLoading = casesQ.isLoading || caseEventsQ.isLoading || entityEventsQ.isLoading || proposalEventsQ.isLoading;

  const casesForRender: PublicCase[] = useMemo(() => {
    return (casesQ.data ?? []) as any;
  }, [casesQ.data]);

  const eventsForRender: PublicTimelineEvent[] = useMemo(() => {
    const base = allEvents.map((ev) => ({
      ...(ev as any),
      message: safe(ev.message) || "(sem mensagem)",
    }));

    if (isLoading && base.length === 0) {
      return [
        {
          id: "loading",
          case_id: null,
          event_type: "loading",
          actor_type: "system",
          message: "Carregando…",
          occurred_at: new Date().toISOString(),
          meta_json: {},
        },
      ];
    }

    return base as any;
  }, [allEvents, isLoading]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{casesForRender.length} caso(s)</Badge>
        <Badge variant="secondary">{allEvents.length} evento(s)</Badge>
        {isLoading ? <span className="text-xs text-slate-500">Carregando…</span> : null}
      </div>

      {/* IMPORTANT: keep the internal timeline using the exact same visual configuration as the public portal timeline. */}
      <PublicEntityHistory cases={casesForRender} events={eventsForRender} />
    </div>
  );
}
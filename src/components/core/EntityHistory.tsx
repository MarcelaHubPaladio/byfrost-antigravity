import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

function fmtDate(ts: string) {
  try {
    return new Date(ts).toLocaleDateString("pt-BR", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return ts;
  }
}

function fmtTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

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

  const byCase = useMemo(() => {
    const m = new Map<string, CaseRow>();
    for (const c of casesQ.data ?? []) m.set(String(c.id), c);
    return m;
  }, [casesQ.data]);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{(casesQ.data ?? []).length} caso(s)</Badge>
        <Badge variant="secondary">{allEvents.length} evento(s)</Badge>
        {isLoading ? <span className="text-xs text-slate-500">Carregando…</span> : null}
      </div>

      {/* Timeline layout: center line, alternating sides */}
      <div className="relative rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="absolute bottom-6 left-1/2 top-6 hidden w-px -translate-x-1/2 bg-slate-200 md:block" />

        {allEvents.length === 0 && !isLoading ? (
          <div className="p-4 text-sm text-slate-600">Sem eventos.</div>
        ) : (
          <div className="grid gap-6">
            {(allEvents.length ? allEvents : [{
              id: "loading",
              case_id: null,
              event_type: "loading",
              actor_type: "system",
              message: "Carregando…",
              occurred_at: new Date().toISOString(),
              meta_json: {},
            } as TimelineEventRow]).map((ev, idx) => {
              const c = ev.case_id ? byCase.get(String(ev.case_id)) : null;
              const side: "left" | "right" = idx % 2 === 0 ? "left" : "right";

              const dateBlock = (
                <div className={cn("space-y-1", side === "left" ? "text-right" : "text-left")}>
                  <div className="text-2xl font-extrabold tracking-tight md:text-3xl">{fmtDate(ev.occurred_at)}</div>
                  <div className="text-xs font-semibold text-slate-500">{fmtTime(ev.occurred_at)}</div>
                </div>
              );

              const contentBlock = (
                <Card className="rounded-[26px] border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{safe(ev.event_type) || "evento"}</Badge>
                    <span className="text-xs text-slate-500">actor: {safe(ev.actor_type) || "—"}</span>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-slate-900">{safe(ev.message) || "(sem mensagem)"}</div>

                  {c ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <div className="font-semibold text-slate-900">
                        {c.title || "(sem título)"} • {c.case_type}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-600">
                        status: {c.status} • state: {c.state} • atualizado: {fmtDate(c.updated_at)} {fmtTime(c.updated_at)}
                      </div>
                    </div>
                  ) : null}
                </Card>
              );

              return (
                <div key={ev.id} className="relative">
                  {/* Mobile: stack */}
                  <div className="grid gap-2 md:hidden">
                    {dateBlock}
                    {contentBlock}
                  </div>

                  {/* Desktop: alternate sides around a center line */}
                  <div className="hidden md:grid md:grid-cols-[1fr_56px_1fr] md:items-start md:gap-6">
                    <div className="flex justify-end">{side === "left" ? dateBlock : contentBlock}</div>

                    <div className="relative flex items-start justify-center">
                      <div className="mt-3 h-3 w-3 rounded-full bg-[hsl(var(--byfrost-accent))] shadow-sm" />
                      <div className="absolute left-1/2 top-[18px] hidden h-px w-6 -translate-x-[calc(100%+8px)] bg-slate-200 md:block" />
                      <div className="absolute left-1/2 top-[18px] hidden h-px w-6 translate-x-[8px] bg-slate-200 md:block" />
                    </div>

                    <div className="flex justify-start">{side === "left" ? contentBlock : dateBlock}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

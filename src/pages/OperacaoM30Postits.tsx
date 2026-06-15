import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutGrid, List } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

type CaseRow = {
  id: string;
  title: string | null;
  status: string | null;
  state: string;
  assigned_user_id: string | null;
  customer_entity_id: string | null;
  customer_id: string | null;
  meta_json: any;
  updated_at: string;
  users_profile?: { display_name: string | null; email: string | null } | null;
};

export default function OperacaoM30Postits() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [layout, setLayout] = useState<"vertical" | "horizontal">("horizontal");

  const journeyQ = useQuery({
    queryKey: ["tenant_journeys_enabled", activeTenantId],
    enabled: Boolean(activeTenantId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_journeys")
        .select("journey_id, journeys(id,key,name,is_crm)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => r.journeys)
        .filter(Boolean);
    },
  });

  const selectedJourney = useMemo(() => {
    return (journeyQ.data ?? []).find((j) => j.key === "operacao_m30") ?? null;
  }, [journeyQ.data]);

  const casesQ = useQuery({
    queryKey: ["cases_by_tenant_journey_postits", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney?.id),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,title,status,state,updated_at,assigned_user_id,customer_entity_id,customer_id,users_profile(display_name,email),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  // Supabase Real-time
  useEffect(() => {
    if (!activeTenantId) return;
    const channel = supabase
      .channel("m30-postits")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cases",
          filter: `tenant_id=eq.${activeTenantId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["cases_by_tenant_journey_postits"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenantId, qc]);

  const caseEntityIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of casesQ.data ?? []) {
      const eid = r.customer_entity_id || (r.meta_json as any)?.entity_id || r.customer_id;
      if (eid && typeof eid === "string") s.add(eid);
    }
    return Array.from(s);
  }, [casesQ.data]);

  const caseEntitiesQ = useQuery({
    queryKey: ["m30_case_entities_postits", activeTenantId, caseEntityIds.join(",")],
    enabled: Boolean(activeTenantId && caseEntityIds.length > 0),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", activeTenantId!)
        .in("id", caseEntityIds)
        .is("deleted_at", null);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const d of data ?? []) m.set(d.id, d.display_name);
      return m;
    },
  });

  const postItGroups = useMemo(() => {
    if (!casesQ.data) return [];

    const map = new Map<
      string,
      { responsibleName: string; entityName: string; items: CaseRow[] }
    >();

    for (const c of casesQ.data) {
      const isFinal = (s: string) => {
        const up = s.toUpperCase();
        return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
      };

      const eid = c.customer_entity_id || (c.meta_json as any)?.entity_id || c.customer_id;
      const metaName =
        (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
      const entityName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null) || "Sem Cliente";

      const respId = c.assigned_user_id || "unassigned";
      const respName =
        c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";

      const key = `${respId}::${eid}`;

      if (!map.has(key)) {
        map.set(key, { responsibleName: respName, entityName, items: [] });
      }

      map.get(key)!.items.push(c);
    }

    // Sort items inside groups by date
    const groups = Array.from(map.values()).map((g) => {
      const sortedItems = [...g.items].sort((a, b) => {
        const dateA = new Date((a.meta_json as any)?.due_at || a.updated_at).getTime();
        const dateB = new Date((b.meta_json as any)?.due_at || b.updated_at).getTime();
        return dateA - dateB;
      });
      return { ...g, items: sortedItems };
    });

    // Sort groups by Responsible Name -> Entity Name
    return groups.sort((a, b) => {
      const cmp = a.responsibleName.localeCompare(b.responsibleName);
      if (cmp !== 0) return cmp;
      return a.entityName.localeCompare(b.entityName);
    });
  }, [casesQ.data, caseEntitiesQ.data]);

  return (
    <RequireAuth>
      <AppShell>
        <div className="rounded-[28px] border border-slate-200 bg-slate-50/50 p-4 shadow-sm backdrop-blur md:p-6 min-h-[80vh]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="icon" className="h-10 w-10 rounded-2xl">
                <Link to="/app/operacao-m30">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  Quadro de Post-its (M30)
                </h2>
                <p className="text-sm text-slate-500">Agrupamento de tarefas por Responsável + Cliente</p>
              </div>
            </div>

            <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm self-start sm:self-auto">
              <button
                onClick={() => setLayout("horizontal")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all",
                  layout === "horizontal"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Lado a lado
              </button>
              <button
                onClick={() => setLayout("vertical")}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all",
                  layout === "vertical"
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <List className="h-4 w-4" />
                Lista
              </button>
            </div>
          </div>

          <div
            className={cn(
              "gap-6",
              layout === "horizontal"
                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 items-start"
                : "flex flex-col max-w-4xl mx-auto"
            )}
          >
            {postItGroups.map((group, i) => {
              // Alternate slight rotations for realistic feel
              const rotations = ["-rotate-1", "rotate-1", "-rotate-2", "rotate-2", "rotate-0"];
              const rot = layout === "horizontal" ? rotations[i % rotations.length] : "rotate-0";

              return (
                <div
                  key={`${group.responsibleName}-${group.entityName}`}
                  className={cn(
                    "flex flex-col rounded-sm bg-yellow-100/90 shadow-md border border-yellow-200/50 p-5 transition-transform hover:scale-[1.01] hover:shadow-lg hover:z-10",
                    rot
                  )}
                  style={{
                    boxShadow: "2px 4px 10px rgba(0,0,0,0.08), inset 0 0 40px rgba(255,255,200,0.5)",
                  }}
                >
                  <div className="border-b border-yellow-200/60 pb-3 mb-4">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest line-clamp-2">
                      {group.responsibleName} <span className="text-yellow-600 mx-1">/</span>{" "}
                      {group.entityName}
                    </h3>
                  </div>

                  <div className="flex flex-col gap-3">
                    {group.items.map((c) => {
                      const isFinal = (s: string) => {
                        const up = s.toUpperCase();
                        return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
                      };
                      const concluded = isFinal(c.state);
                      
                      const rawDate = (c.meta_json as any)?.due_at;
                      const d = rawDate ? new Date(rawDate) : null;
                      const dateStr = d && isValid(d) ? format(d, "dd/MM", { locale: ptBR }) : "";

                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "group flex flex-col gap-0.5",
                            concluded ? "opacity-60" : "opacity-100"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={cn(
                                "text-[13px] font-bold text-slate-800 leading-tight",
                                concluded && "line-through decoration-red-500/50 decoration-2"
                              )}
                              style={{ fontFamily: "'Inter', sans-serif" }} // You can change to a handwritten font if added to the project
                            >
                              {c.title || "Sem título"}
                            </span>
                            {dateStr && (
                              <span className="text-[10px] font-bold text-slate-600 bg-yellow-200/50 px-1.5 py-0.5 rounded-sm shrink-0 whitespace-nowrap">
                                {dateStr}
                              </span>
                            )}
                          </div>
                          {concluded && (
                            <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">
                              Concluído
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {postItGroups.length === 0 && (
              <div className="col-span-full py-20 text-center">
                <p className="text-slate-500">Nenhum caso encontrado para a Operação M30.</p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

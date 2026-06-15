import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LayoutGrid, List, Monitor } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isValid, parseISO } from "date-fns";
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

// Types for grouping
type ResponsibleGroup = {
  responsibleName: string;
  items: Array<{
    id: string;
    title: string;
    entityName: string;
  }>;
};

type DateGroup = {
  dateKey: string;
  dateObj: Date | null;
  formattedDate: string;
  responsibles: Record<string, ResponsibleGroup>;
};

export default function OperacaoM30Postits() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [layout, setLayout] = useState<"horizontal" | "vertical">("horizontal");

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
      .channel("m30-postits-tv")
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

    const dateMap = new Map<string, DateGroup>();

    for (const c of casesQ.data) {
      // Filtrar concluídos (não listam)
      const isFinal = (s: string) => {
        const up = s.toUpperCase();
        return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
      };
      if (isFinal(c.state)) continue;

      // Definir a data do caso
      const rawDate = (c.meta_json as any)?.due_at;
      const d = rawDate ? new Date(rawDate) : null;
      
      let dateKey = "SEM DATA";
      let formattedDate = "SEM DATA";
      
      if (d && isValid(d)) {
        dateKey = format(d, "yyyy-MM-dd");
        formattedDate = `GRAV. ${format(d, "dd/MM", { locale: ptBR })}`;
      }

      // Definir entidade e responsável
      const eid = c.customer_entity_id || (c.meta_json as any)?.entity_id || c.customer_id;
      const metaName = (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
      const entityName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null) || "Sem Cliente";

      const respId = c.assigned_user_id || "unassigned";
      const respName = c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";
      const firstName = respName.split(" ")[0].toUpperCase();

      // Agrupar no Map
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          dateKey,
          dateObj: d && isValid(d) ? d : null,
          formattedDate,
          responsibles: {},
        });
      }

      const dateGroup = dateMap.get(dateKey)!;

      if (!dateGroup.responsibles[respId]) {
        dateGroup.responsibles[respId] = {
          responsibleName: firstName,
          items: [],
        };
      }

      dateGroup.responsibles[respId].items.push({
        id: c.id,
        title: c.title || "Sem título",
        entityName,
      });
    }

    // Transformar em array e ordenar por data
    const groupsArray = Array.from(dateMap.values());
    groupsArray.sort((a, b) => {
      if (!a.dateObj) return 1;
      if (!b.dateObj) return -1;
      return a.dateObj.getTime() - b.dateObj.getTime();
    });

    return groupsArray;
  }, [casesQ.data, caseEntitiesQ.data]);

  return (
    <RequireAuth>
      {/* Removido o AppShell para ocupar 100% da tela (estilo Dashboard/TV) */}
      <div className="min-h-screen bg-slate-100 p-4 sm:p-8 font-sans overflow-y-auto">
        
        {/* Cabeçalho minimalista que pode ser ignorado na TV, mas útil para navegação */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 pb-4 border-b border-slate-200/60">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-slate-200">
              <Link to="/app/operacao-m30">
                <ArrowLeft className="h-5 w-5 text-slate-600" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
                <Monitor className="h-6 w-6 text-slate-500" />
                Painel de Gravações (M30)
              </h1>
              <p className="text-sm text-slate-500 font-medium">Atualização em tempo real</p>
            </div>
          </div>

          <div className="flex bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm self-start sm:self-auto">
            <button
              onClick={() => setLayout("horizontal")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all",
                layout === "horizontal"
                  ? "bg-slate-800 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              Parede (Horizontal)
            </button>
            <button
              onClick={() => setLayout("vertical")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all",
                layout === "vertical"
                  ? "bg-slate-800 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <List className="h-4 w-4" />
              Lista (Vertical)
            </button>
          </div>
        </div>

        {/* Quadro de Post-its */}
        <div
          className={cn(
            "gap-8",
            layout === "horizontal"
              ? "flex flex-wrap items-start justify-start"
              : "flex flex-col max-w-2xl mx-auto"
          )}
        >
          {postItGroups.map((group, i) => {
            // Pequenas rotações para dar aspecto físico
            const rotations = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0"];
            const rot = layout === "horizontal" ? rotations[i % rotations.length] : "rotate-0";

            return (
              <div
                key={group.dateKey}
                className={cn(
                  "flex flex-col rounded-sm bg-[#FDFFB6] shadow-md border border-[#f0f2a1] p-6 transition-transform hover:scale-[1.02] hover:shadow-xl hover:z-10",
                  layout === "horizontal" ? "w-[300px]" : "w-full",
                  rot
                )}
                style={{
                  boxShadow: "3px 5px 15px rgba(0,0,0,0.08), inset 0 0 50px rgba(255,255,180,0.5)",
                }}
              >
                {/* Título do Post-it (DATA) */}
                <div className="border-b-2 border-red-500/20 pb-2 mb-4">
                  <h3 
                    className="text-xl font-black text-red-700 uppercase tracking-widest"
                    style={{ fontFamily: "'Caveat', 'Comic Sans MS', cursive, sans-serif" }} // Fonte que lembra escrita manual se disponível
                  >
                    {group.formattedDate}
                  </h3>
                </div>

                {/* Agrupamentos por Responsável */}
                <div className="flex flex-col gap-5">
                  {Object.values(group.responsibles).map((resp) => (
                    <div key={resp.responsibleName} className="flex flex-col gap-1">
                      {/* Nome do Responsável - Qtd */}
                      <div className="flex items-baseline gap-2">
                        <span 
                          className="text-base font-bold text-slate-800 uppercase"
                          style={{ fontFamily: "'Caveat', 'Comic Sans MS', cursive, sans-serif" }}
                        >
                          {resp.responsibleName} - {resp.items.length}
                        </span>
                      </div>

                      {/* Lista de itens deste responsável */}
                      <div className="pl-2 border-l-2 border-slate-800/10 flex flex-col gap-1 mt-1">
                        {resp.items.map((item) => (
                          <div key={item.id} className="text-sm text-slate-700 leading-tight">
                            <span className="font-bold">{item.entityName}</span>
                            {item.title && <span className="opacity-75"> - {item.title}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {postItGroups.length === 0 && (
            <div className="w-full py-20 text-center">
              <p className="text-xl text-slate-400 font-bold">Nenhuma gravação ou entrega pendente.</p>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

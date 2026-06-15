import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Monitor } from "lucide-react";
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

// Types for grouping
type EntityGroup = {
  entityName: string;
  items: Array<{
    id: string;
    title: string;
    dateObj: Date | null;
    formattedDate: string;
  }>;
};

type ResponsibleGroup = {
  responsibleName: string;
  entities: Record<string, EntityGroup>;
};

export default function OperacaoM30Postits() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  // Detecta se a TV está na vertical ou horizontal para ajustar as colunas
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

  const parentGroups = useMemo(() => {
    if (!casesQ.data) return [];

    const respMap = new Map<string, ResponsibleGroup>();

    for (const c of casesQ.data) {
      // Filtrar concluídos (não listam)
      const isFinal = (s: string) => {
        const up = s.toUpperCase();
        return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
      };
      if (isFinal(c.state)) continue;

      // Responsável (Pai)
      const respId = c.assigned_user_id || "unassigned";
      const respName = c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";
      const firstName = respName.split(" ")[0].toUpperCase();

      // Entidade (Filho / Post-it)
      const eid = c.customer_entity_id || (c.meta_json as any)?.entity_id || c.customer_id;
      const metaName = (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
      const entityName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null) || "Sem Cliente";

      if (!respMap.has(respId)) {
        respMap.set(respId, {
          responsibleName: firstName,
          entities: {},
        });
      }

      const group = respMap.get(respId)!;

      if (!group.entities[entityName]) {
        group.entities[entityName] = {
          entityName,
          items: [],
        };
      }

      // Definir a data do item
      const rawDate = (c.meta_json as any)?.due_at;
      const d = rawDate ? new Date(rawDate) : null;

      group.entities[entityName].items.push({
        id: c.id,
        title: c.title || "Sem título",
        dateObj: d && isValid(d) ? d : null,
        formattedDate: d && isValid(d) ? format(d, "dd/MM", { locale: ptBR }) : "",
      });
    }

    // Converter para array e ordenar alfabeticamente
    const groupsArray = Array.from(respMap.values());
    groupsArray.sort((a, b) => a.responsibleName.localeCompare(b.responsibleName));

    // Ordenar as entidades e seus itens (por data)
    for (const g of groupsArray) {
      for (const eKey of Object.keys(g.entities)) {
        g.entities[eKey].items.sort((a, b) => {
          if (!a.dateObj) return 1;
          if (!b.dateObj) return -1;
          return a.dateObj.getTime() - b.dateObj.getTime();
        });
      }
    }

    return groupsArray;
  }, [casesQ.data, caseEntitiesQ.data]);

  return (
    <RequireAuth>
      {/* Wrapper principal: 100% da tela sempre, com scroll flexível se precisar, sem barras pretas */}
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 overflow-x-hidden font-sans">
        
        {/* Cabeçalho */}
        <div className="w-full flex items-center justify-between p-6 sm:p-8 border-b-2 border-slate-200/60 bg-white/50 backdrop-blur-md shadow-sm sticky top-0 z-50">
          <div className="flex items-center gap-6">
            <Button asChild variant="outline" size="icon" className="h-14 w-14 rounded-full bg-white shadow-sm hover:bg-slate-100 border-slate-200">
              <Link to="/app/operacao-m30">
                <ArrowLeft className="h-7 w-7 text-slate-600" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-800 flex items-center gap-3">
                <Monitor className="h-8 w-8 sm:h-12 sm:w-12 text-indigo-500" />
                Painel de Operações (M30)
              </h1>
              <p className="text-lg sm:text-2xl text-slate-500 font-bold mt-1">
                Responsáveis e seus Clientes
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4 px-6 py-3 bg-indigo-50 text-indigo-700 rounded-full font-black text-xl border border-indigo-100">
            {isPortrait ? "Modo Vertical (Lousa)" : "Modo Horizontal (Painel)"}
          </div>
        </div>

        {/* Quadro Principal */}
        <div className="w-full p-6 sm:p-10 flex flex-col gap-12 sm:gap-20">
          {parentGroups.map((parent) => (
            <div key={parent.responsibleName} className="flex flex-col gap-8 w-full">
              
              {/* Título do Grupo Pai (Responsável) em Linha Completa */}
              <div className="flex items-center gap-4 border-b-4 border-indigo-500/20 pb-4 w-full">
                <div className="h-16 w-16 bg-gradient-to-tr from-indigo-600 to-blue-500 text-white rounded-2xl shadow-md flex items-center justify-center text-4xl font-black">
                  {parent.responsibleName.charAt(0)}
                </div>
                <h2 className="text-5xl sm:text-6xl font-black tracking-tighter text-slate-800 uppercase">
                  {parent.responsibleName}
                </h2>
                <span className="ml-4 bg-slate-800 text-white font-bold px-5 py-2 rounded-full text-xl sm:text-2xl shadow-sm whitespace-nowrap">
                  {Object.keys(parent.entities).length} Entidades
                </span>
              </div>

              {/* Grid Flexível e Responsivo para os Post-its */}
              <div className={cn(
                "grid gap-8 sm:gap-10",
                // Se for retrato na TV, usa 2 colunas. Se for horizontal, usa 4 ou mais dependendo da largura.
                isPortrait ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
              )}>
                {Object.values(parent.entities).map((entityGroup, i) => {
                  const rotations = ["-rotate-1", "rotate-1", "rotate-0", "-rotate-2", "rotate-2"];
                  const rot = rotations[i % rotations.length];

                  return (
                    <div
                      key={entityGroup.entityName}
                      className={cn(
                        "relative flex flex-col rounded-sm bg-[#FFFAB3] p-8 transition-transform hover:scale-[1.03] hover:z-10",
                        rot
                      )}
                      style={{
                        boxShadow: "4px 8px 24px rgba(0,0,0,0.12), inset 0 0 40px rgba(255,255,180,0.3)",
                        borderRight: "1px solid rgba(0,0,0,0.05)",
                        borderBottom: "2px solid rgba(0,0,0,0.1)",
                      }}
                    >
                      {/* Efeito de Fita Adesiva */}
                      <div className="absolute top-[-15px] left-1/2 -translate-x-1/2 w-24 h-8 bg-white/40 shadow-sm rotate-2 backdrop-blur-sm z-10" />

                      {/* Título do Post-it (ENTIDADE) */}
                      <div className="border-b-2 border-yellow-500/20 pb-4 mb-6 pt-2">
                        <h3 
                          className="text-3xl sm:text-4xl font-black text-slate-800 uppercase leading-snug"
                          style={{ fontFamily: "'Caveat', 'Comic Sans MS', cursive, sans-serif" }}
                        >
                          {entityGroup.entityName}
                        </h3>
                      </div>

                      {/* Lista de itens (entregáveis) da entidade */}
                      <div className="flex flex-col gap-5">
                        {entityGroup.items.map((item) => (
                          <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 group border-b border-yellow-500/10 pb-3 last:border-0 last:pb-0">
                            <span 
                              className="text-2xl sm:text-[1.7rem] font-bold text-slate-800 leading-tight"
                              style={{ fontFamily: "'Caveat', 'Comic Sans MS', cursive, sans-serif" }}
                            >
                              {item.title}
                            </span>
                            
                            {item.formattedDate && (
                              <span className="text-xl sm:text-2xl font-black text-red-600 bg-red-100/60 px-3 py-1 rounded shadow-sm shrink-0 mt-1 sm:mt-0">
                                {item.formattedDate}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {parentGroups.length === 0 && (
            <div className="w-full py-40 flex flex-col items-center justify-center col-span-full opacity-60">
              <Monitor className="h-32 w-32 text-slate-300 mb-6" />
              <p className="text-5xl text-slate-400 font-black">Quadro limpo!</p>
              <p className="text-3xl text-slate-400 font-bold mt-2">Nenhuma entrega pendente.</p>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}

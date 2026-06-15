import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Monitor, RefreshCw, AlertCircle, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { format, isValid, isBefore, startOfDay } from "date-fns";
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
  users_profile?: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
};

type ItemData = {
  id: string;
  title: string;
  entityName: string;
  state: string;
  dateObj: Date | null;
  formattedDate: string;
  isOverdue: boolean;
  isPriority: boolean;
};

type UserGroup = {
  responsibleName: string;
  avatarUrl: string | null;
  items: ItemData[];
};

const STATE_LABELS: Record<string, string> = {
  'PLANEJAMENTO': 'Planejamento',
  'EDIO': 'Edição',
  'EDIÇÃO': 'Edição',
  'APROVAO': 'Aprovação',
  'APROVAÇÃO': 'Aprovação',
  'POSTAR': 'Postar',
  'FILA': 'Fila',
  'CONCLUIDO': 'Concluído',
  'CONCLUÍDO': 'Concluído',
  'FINALIZADO': 'Finalizado',
  'ENTREGUE': 'Entregue',
};

const formatStateLabel = (s: string) => STATE_LABELS[s.toUpperCase()] || s;

const getGridCols = (len: number) => {
  if (len <= 4) return "grid-cols-1";
  if (len <= 10) return "grid-cols-2";
  if (len <= 18) return "grid-cols-3";
  return "grid-cols-4";
};

export default function OperacaoM30Postits() {
  const { activeTenantId, activeTenant } = useTenant();
  const qc = useQueryClient();

  const primaryColorHex = useMemo(() => {
    return (activeTenant?.branding_json?.palette?.primary?.hex as string | undefined) || "#4f46e5"; // fallback indigo-600
  }, [activeTenant]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      return (data ?? []).map((r: any) => r.journeys).filter(Boolean);
    },
  });

  const selectedJourney = useMemo(() => {
    return (journeyQ.data ?? []).find((j) => j.key === "operacao_m30") ?? null;
  }, [journeyQ.data]);

  const casesQ = useQuery({
    queryKey: ["cases_by_tenant_journey_postits", activeTenantId, selectedJourney?.id],
    enabled: Boolean(activeTenantId && selectedJourney?.id),
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(
          "id,title,status,state,updated_at,assigned_user_id,customer_entity_id,customer_id,users_profile(display_name,email,avatar_url),meta_json"
        )
        .eq("tenant_id", activeTenantId!)
        .eq("journey_id", selectedJourney!.id)
        .is("deleted_at", null)
        .eq("is_chat", false);

      if (error) throw error;
      return (data ?? []) as any as CaseRow[];
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await casesQ.refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      casesQ.refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [casesQ]);

  useEffect(() => {
    if (!activeTenantId) return;
    const channel = supabase
      .channel("m30-postits-tv")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cases", filter: `tenant_id=eq.${activeTenantId}` },
        () => qc.invalidateQueries({ queryKey: ["cases_by_tenant_journey_postits"] })
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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

  const userGroups = useMemo(() => {
    if (!casesQ.data) return [];
    const todayStart = startOfDay(new Date());

    const respMap = new Map<string, UserGroup>();

    for (const c of casesQ.data) {
      const isFinal = (s: string) => {
        const up = s.toUpperCase();
        return up.includes("CONCLU") || up.includes("FINAL") || up.includes("ENTREG");
      };
      if (isFinal(c.state)) continue;

      const respId = c.assigned_user_id || "unassigned";
      const respName = c.users_profile?.display_name || c.users_profile?.email || "Sem Responsável";
      const avatarUrl = c.users_profile?.avatar_url || null;

      const eid = c.customer_entity_id || (c.meta_json as any)?.entity_id || c.customer_id;
      const metaName = (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name;
      const entityName = metaName || (eid ? caseEntitiesQ.data?.get(eid) : null) || "Sem Cliente";

      if (!respMap.has(respId)) {
        respMap.set(respId, {
          responsibleName: respName,
          avatarUrl,
          items: [],
        });
      }

      const group = respMap.get(respId)!;
      const rawDate = (c.meta_json as any)?.due_at;
      const d = rawDate ? new Date(rawDate) : null;
      const isOverdue = d && isValid(d) ? isBefore(startOfDay(d), todayStart) : false;
      const isPriority = Boolean((c.meta_json as any)?.priority || (c.meta_json as any)?.is_priority);

      group.items.push({
        id: c.id,
        title: c.title || "Sem título",
        entityName,
        state: formatStateLabel(c.state),
        dateObj: d && isValid(d) ? d : null,
        formattedDate: d && isValid(d) ? format(d, "dd/MM", { locale: ptBR }) : "",
        isOverdue,
        isPriority
      });
    }

    const groupsArray = Array.from(respMap.values());
    groupsArray.sort((a, b) => a.responsibleName.localeCompare(b.responsibleName));

    for (const g of groupsArray) {
      g.items.sort((a, b) => {
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj.getTime() - b.dateObj.getTime();
      });
    }

    return groupsArray;
  }, [casesQ.data, caseEntitiesQ.data]);

  // Hook mágico para escalar o conteúdo (zoom) se estourar a tela
  useEffect(() => {
    const calculateZoom = () => {
      const el = containerRef.current;
      if (!el) return;
      
      // Reseta para 1 para medir o tamanho natural
      el.style.zoom = "1";
      
      const scrollHeight = el.scrollHeight;
      const windowH = window.innerHeight;
      
      if (scrollHeight > windowH) {
         // Scale down
         const newZoom = windowH / scrollHeight;
         // Deixa uma pequena folga (2%)
         el.style.zoom = (newZoom * 0.98).toString();
      }
    };
    
    const timeoutId = setTimeout(calculateZoom, 50);
    window.addEventListener("resize", calculateZoom);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", calculateZoom);
    };
  }, [userGroups]);

  return (
    <RequireAuth>
      {/* fixed inset-0 guarantees it locks to the viewport and never scrolls natively */}
      <div className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden font-sans text-slate-100 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        
        {/* Glowing background orb for aesthetics */}
        <div 
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] blur-[120px] rounded-full pointer-events-none" 
          style={{ backgroundColor: primaryColorHex, opacity: 0.2 }}
        />

        {/* Minimal Header */}
        <div className="relative flex items-center justify-between py-2 px-4 lg:px-6 border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-400 hover:bg-slate-800 hover:text-white">
              <Link to="/app/operacao-m30">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-lg lg:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <Monitor className="h-5 w-5 lg:h-6 lg:w-6" style={{ color: primaryColorHex }} />
              Painel M30
            </h1>
          </div>
          <Button 
            onClick={handleRefresh} 
            size="sm"
            className="h-8 rounded-full text-white font-bold text-xs lg:text-sm px-4 shadow-sm"
            style={{ backgroundColor: primaryColorHex, opacity: 0.9 }}
          >
            <RefreshCw className={cn("h-3 w-3 lg:h-4 lg:w-4 mr-1.5", isRefreshing && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {/* Body - Masonry Layout and Intelligent Zoom */}
        <div 
          className="relative w-full overflow-visible z-10"
        >
          <div 
            ref={containerRef}
            className="p-3 lg:p-4 w-full"
            style={{ transformOrigin: "top center" }}
          >
            <div className={cn(
              "columns-1 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5 gap-3 lg:gap-4 w-full"
            )}>
              {userGroups.map((group) => (
                <div 
                  key={group.responsibleName} 
                  className="flex flex-col bg-slate-900/60 rounded-[16px] lg:rounded-[20px] border border-slate-800/80 shadow-2xl overflow-hidden backdrop-blur-md break-inside-avoid mb-3 lg:mb-4"
                >
                  {/* User Header Compacto */}
                  <div 
                    className="flex flex-row items-center justify-between p-2 lg:p-3 border-b border-slate-800/80 relative z-10 shrink-0"
                    style={{ background: `linear-gradient(to right, ${primaryColorHex}40, transparent)` }}
                  >
                    <div className="absolute inset-0 blur-xl rounded-full" style={{ backgroundColor: `${primaryColorHex}0D` }} />
                    <div className="flex flex-row items-center gap-2 relative z-10">
                      <div 
                        className="h-8 w-8 lg:h-10 lg:w-10 rounded-full border shadow-md bg-slate-800 overflow-hidden flex items-center justify-center shrink-0"
                        style={{ borderColor: `${primaryColorHex}80` }}
                      >
                        {group.avatarUrl ? (
                          <img src={group.avatarUrl} alt={group.responsibleName} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-sm lg:text-base font-black text-slate-500 uppercase">{group.responsibleName.charAt(0)}</span>
                        )}
                      </div>
                      <h2 className="text-base lg:text-lg font-black text-white tracking-tight line-clamp-1 drop-shadow-md uppercase">
                        {group.responsibleName.split(' ')[0]}
                      </h2>
                    </div>
                    <span 
                      className="bg-slate-800 font-bold px-2 py-0.5 rounded text-[10px] lg:text-[11px] border shadow-sm whitespace-nowrap z-10 relative"
                      style={{ color: primaryColorHex, borderColor: `${primaryColorHex}4D` }}
                    >
                      {group.items.length} cards
                    </span>
                  </div>

                  {/* Cards Dynamic Grid */}
                  <div className="p-1.5 lg:p-2">
                    {group.items.length === 0 && (
                      <div className="flex flex-col items-center justify-center opacity-30 py-6 w-full">
                        <Monitor className="h-8 w-8 text-slate-500 mb-1" />
                        <span className="text-xs font-bold text-slate-400">Nenhum card</span>
                      </div>
                    )}
                    <div className={cn("grid gap-1.5 lg:gap-2 auto-rows-max", getGridCols(group.items.length))}>
                    {group.items.map((item) => (
                      <div 
                        key={item.id} 
                        className={cn(
                          "relative p-1.5 lg:p-2 rounded-lg transition-all flex flex-col justify-between min-h-[52px]",
                          "bg-slate-800/50 border backdrop-blur-sm",
                          item.isPriority 
                            ? "border-yellow-500/50 shadow-[0_0_15px_rgba(234,179,8,0.15)] bg-yellow-950/20" 
                            : "border-slate-700/50 hover:bg-slate-800",
                          item.isOverdue && !item.isPriority 
                            ? "border-red-500/40 bg-red-950/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
                            : ""
                        )}
                      >
                        {item.isPriority && (
                          <div className="absolute -top-1 -right-1 h-3.5 w-3.5 bg-yellow-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(234,179,8,0.5)]">
                            <Star className="h-2 w-2 text-yellow-950 fill-current" />
                          </div>
                        )}
                        
                        <div className={cn(
                          "text-xs lg:text-sm font-bold tracking-tight leading-tight line-clamp-1 mb-1",
                          item.isPriority ? "text-yellow-400" : "text-slate-100"
                        )}>
                          {item.entityName}
                        </div>
                        
                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-[9px] lg:text-[10px] font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">
                            {item.state}
                          </span>
                          
                          {item.formattedDate && (
                            <div className={cn(
                              "flex items-center gap-0.5 px-1 rounded text-[9px] font-bold shadow-sm shrink-0",
                              item.isOverdue 
                                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                                : "bg-slate-700/50 text-slate-300 border border-slate-600/50"
                            )}>
                              {item.isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
                              {item.formattedDate}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    </div>
                  </div>
                </div>
              ))}

              {userGroups.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center h-full opacity-40 py-20">
                  <Monitor className="h-20 w-20 text-slate-500 mb-4" />
                  <p className="text-2xl text-slate-500 font-black">Nenhuma pendência</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}

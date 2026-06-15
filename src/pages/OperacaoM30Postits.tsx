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

export default function OperacaoM30Postits() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Polling secundário a cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      casesQ.refetch();
    }, 30000);
    return () => clearInterval(interval);
  }, [casesQ]);

  // Supabase Real-time
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
        state: c.state,
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
        // Prioridade primeiro
        if (a.isPriority && !b.isPriority) return -1;
        if (!a.isPriority && b.isPriority) return 1;

        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj.getTime() - b.dateObj.getTime();
      });
    }

    return groupsArray;
  }, [casesQ.data, caseEntitiesQ.data]);

  return (
    <RequireAuth>
      {/* 100% viewport width and height, dark premium aesthetic */}
      <div className="w-screen h-screen bg-slate-950 flex flex-col overflow-hidden font-sans text-slate-100">
        
        {/* Glowing background orb for aesthetics */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between p-4 sm:p-6 lg:p-8 border-b border-slate-800/60 bg-slate-900/50 backdrop-blur-xl shrink-0 z-10">
          <div className="flex items-center gap-4 lg:gap-6">
            <Button asChild variant="outline" size="icon" className="h-12 w-12 lg:h-16 lg:w-16 rounded-full bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors">
              <Link to="/app/operacao-m30">
                <ArrowLeft className="h-6 w-6 lg:h-8 lg:w-8" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-5xl font-black tracking-tight text-white flex items-center gap-3 lg:gap-4">
                <Monitor className="h-8 w-8 lg:h-12 lg:w-12 text-indigo-400" />
                Painel M30
              </h1>
              <p className="text-sm sm:text-base lg:text-xl text-slate-400 font-medium mt-1">
                Jornada de Entregáveis
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={handleRefresh} 
              className="h-12 lg:h-16 px-6 lg:px-8 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm lg:text-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all active:scale-95 flex items-center gap-2 lg:gap-3 border border-indigo-500"
            >
              <RefreshCw className={cn("h-5 w-5 lg:h-7 lg:w-7", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </div>

        {/* Body - Masonry Layout e Page Scroll escondido */}
        <div className="relative flex-1 w-full p-4 sm:p-6 lg:p-8 overflow-y-auto z-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className={cn(
            "columns-1 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5 gap-4 lg:gap-8 w-full"
          )}>
            {userGroups.map((group) => (
              <div 
                key={group.responsibleName} 
                className="flex flex-col bg-slate-900/60 rounded-[24px] lg:rounded-[32px] border border-slate-800/80 shadow-2xl overflow-hidden backdrop-blur-md break-inside-avoid mb-4 lg:mb-8"
              >
                {/* User Header Compacto */}
                <div className="flex flex-row items-center justify-between bg-gradient-to-r from-indigo-900/40 to-transparent p-3 lg:p-4 border-b border-slate-800/80 relative z-10 shrink-0">
                  <div className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-full" />
                  <div className="flex flex-row items-center gap-3 relative z-10">
                    <div className="h-10 w-10 lg:h-12 lg:w-12 rounded-full border lg:border-2 border-indigo-500/50 shadow-md bg-slate-800 overflow-hidden flex items-center justify-center shrink-0">
                      {group.avatarUrl ? (
                        <img src={group.avatarUrl} alt={group.responsibleName} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-lg lg:text-xl font-black text-slate-500 uppercase">{group.responsibleName.charAt(0)}</span>
                      )}
                    </div>
                    <h2 className="text-lg lg:text-2xl font-black text-white tracking-tight line-clamp-1 drop-shadow-md uppercase">
                      {group.responsibleName.split(' ')[0]}
                    </h2>
                  </div>
                  <span className="bg-slate-800 text-indigo-300 font-bold px-3 py-1 rounded text-[10px] lg:text-xs border border-indigo-500/30 shadow-sm whitespace-nowrap z-10 relative">
                    {group.items.length} cards
                  </span>
                </div>

                {/* Cards List 2 Colunas */}
                <div className="p-2 lg:p-3">
                  {group.items.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-30 py-10 w-full">
                      <Monitor className="h-10 w-10 text-slate-500 mb-2" />
                      <span className="text-sm font-bold text-slate-400">Nenhum card</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 lg:gap-3 auto-rows-max">
                  {group.items.map((item) => (
                    <div 
                      key={item.id} 
                      className={cn(
                        "relative p-2.5 lg:p-3 rounded-[12px] lg:rounded-[14px] transition-all flex flex-col gap-1",
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
                        <div className="absolute -top-1.5 -right-1.5 h-4 w-4 lg:h-5 lg:w-5 bg-yellow-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(234,179,8,0.5)]">
                          <Star className="h-2.5 w-2.5 text-yellow-950 fill-current" />
                        </div>
                      )}
                      
                      <div className={cn(
                        "text-sm lg:text-base font-bold tracking-tight leading-tight line-clamp-1",
                        item.isPriority ? "text-yellow-400" : "text-slate-100"
                      )}>
                        {item.entityName}
                      </div>
                      
                      <div className="flex items-center justify-between pt-1 border-t border-slate-700/50 mt-1">
                        <span className="text-[10px] lg:text-xs font-semibold text-slate-400 uppercase tracking-wider line-clamp-1">
                          {item.state}
                        </span>
                        
                        {item.formattedDate && (
                          <div className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] lg:text-[11px] font-bold shadow-sm shrink-0",
                            item.isOverdue 
                              ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                              : "bg-slate-700/50 text-slate-300 border border-slate-600/50"
                          )}>
                            {item.isOverdue && <AlertCircle className="h-2.5 w-2.5 lg:h-3 lg:w-3" />}
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
              <div className="col-span-full flex flex-col items-center justify-center h-full opacity-40">
                <Monitor className="h-24 w-24 lg:h-32 lg:w-32 text-slate-500 mb-6" />
                <p className="text-3xl lg:text-5xl text-slate-500 font-black">Nenhuma pendência</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}

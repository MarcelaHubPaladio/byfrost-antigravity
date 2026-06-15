import { useEffect, useLayoutEffect, useMemo, useState, useRef } from "react";
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

  // Screen sizing
  const [isPortrait, setIsPortrait] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    const handleScale = () => {
      if (!containerRef.current || !wrapperRef.current) return;
      const targetW = isPortrait ? 1080 : 1920;
      const targetH = isPortrait ? 1920 : 1080;
      const windowW = window.innerWidth;
      const windowH = window.innerHeight;

      const scaleW = windowW / targetW;
      const scaleH = windowH / targetH;
      setScale(Math.min(scaleW, scaleH));
    };
    handleScale();
    window.addEventListener("resize", handleScale);
    return () => window.removeEventListener("resize", handleScale);
  }, [isPortrait]);

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
        if (!a.dateObj) return 1;
        if (!b.dateObj) return -1;
        return a.dateObj.getTime() - b.dateObj.getTime();
      });
    }

    return groupsArray;
  }, [casesQ.data, caseEntitiesQ.data]);

  const layoutW = isPortrait ? 1080 : 1920;
  const layoutH = isPortrait ? 1920 : 1080;

  return (
    <RequireAuth>
      <div 
        ref={wrapperRef}
        className="w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center font-sans"
      >
        <div 
          ref={containerRef}
          style={{ width: layoutW, height: layoutH, transform: `scale(${scale})` }}
          className="bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 relative shadow-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-8 border-b-2 border-slate-200/60 bg-white/70 backdrop-blur-md shadow-sm shrink-0">
            <div className="flex items-center gap-6">
              <Button asChild variant="outline" size="icon" className="h-16 w-16 rounded-full bg-white shadow-sm hover:bg-slate-100 border-slate-200">
                <Link to="/app/operacao-m30">
                  <ArrowLeft className="h-8 w-8 text-slate-600" />
                </Link>
              </Button>
              <div>
                <h1 className="text-5xl font-black tracking-tight text-slate-800 flex items-center gap-4">
                  <Monitor className="h-12 w-12 text-indigo-500" />
                  Painel de Operações M30
                </h1>
                <p className="text-2xl text-slate-500 font-bold mt-1">
                  Jornada de Entregáveis por Responsável
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleRefresh} 
                className="h-16 px-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-2xl shadow-lg flex items-center gap-3 transition-all active:scale-95"
              >
                <RefreshCw className={cn("h-7 w-7", isRefreshing && "animate-spin")} />
                Atualizar
              </Button>
              <div className="flex items-center gap-4 px-8 py-4 bg-indigo-50 text-indigo-700 rounded-full font-black text-2xl border border-indigo-100 shadow-inner">
                {isPortrait ? "TV Vertical" : "TV Horizontal"}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 w-full p-8 overflow-hidden">
            <div className={cn(
              "grid gap-6 w-full h-full auto-rows-[min-content]",
              isPortrait ? "grid-cols-2" : "grid-cols-4"
            )}>
              {userGroups.map((group) => (
                <div key={group.responsibleName} className="flex flex-col h-full bg-white/80 rounded-[32px] border border-slate-200 shadow-xl overflow-hidden backdrop-blur-sm">
                  {/* User Header */}
                  <div className="flex flex-col items-center bg-gradient-to-br from-indigo-600 to-blue-500 p-6 shadow-md relative z-10">
                    <div className="h-32 w-32 rounded-full border-4 border-white shadow-xl bg-white overflow-hidden flex items-center justify-center shrink-0">
                      {group.avatarUrl ? (
                        <img src={group.avatarUrl} alt={group.responsibleName} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-6xl font-black text-slate-400 uppercase">{group.responsibleName.charAt(0)}</span>
                      )}
                    </div>
                    <h2 className="text-3xl font-black text-white mt-4 tracking-tight text-center line-clamp-1 break-all">
                      {group.responsibleName.split(' ')[0]}
                    </h2>
                    <span className="bg-white/20 text-white font-bold px-4 py-1 rounded-full text-lg mt-2 backdrop-blur-md">
                      {group.items.length} cards pendentes
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                    {group.items.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full opacity-50 py-10">
                        <Monitor className="h-16 w-16 text-slate-400 mb-4" />
                        <span className="text-2xl font-bold text-slate-500">Nenhum card</span>
                      </div>
                    )}
                    {group.items.map((item) => (
                      <div 
                        key={item.id} 
                        className={cn(
                          "relative p-5 rounded-[20px] bg-slate-50 border-2 shadow-sm transition-all",
                          item.isPriority ? "border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)]" : "border-slate-100",
                          item.isOverdue && !item.isPriority ? "border-red-300 bg-red-50/50" : ""
                        )}
                      >
                        {item.isPriority && (
                          <div className="absolute -top-3 -right-3 h-8 w-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md animate-pulse">
                            <Star className="h-5 w-5 text-yellow-900 fill-current" />
                          </div>
                        )}
                        
                        <div className="text-xl font-bold text-indigo-700 tracking-tight leading-tight line-clamp-1 mb-1">
                          {item.entityName}
                        </div>
                        
                        <div className="text-2xl font-black text-slate-800 leading-tight mb-3 break-words">
                          {item.title}
                        </div>
                        
                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-200/60">
                          <span className="text-lg font-semibold text-slate-500 uppercase tracking-wider">
                            {item.state}
                          </span>
                          
                          {item.formattedDate && (
                            <div className={cn(
                              "flex items-center gap-1.5 px-3 py-1 rounded-lg text-lg font-bold shadow-sm",
                              item.isOverdue 
                                ? "bg-red-500 text-white" 
                                : "bg-slate-200 text-slate-700"
                            )}>
                              {item.isOverdue && <AlertCircle className="h-5 w-5" />}
                              {item.formattedDate}
                              {item.isOverdue && <span className="ml-1 uppercase text-sm">Atraso</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {userGroups.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center h-full opacity-60">
                  <Monitor className="h-32 w-32 text-slate-300 mb-6" />
                  <p className="text-5xl text-slate-400 font-black">Nenhuma pendência</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}

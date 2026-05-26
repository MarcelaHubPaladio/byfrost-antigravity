import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Clock, Filter, Calendar, Zap, Search, Activity, Users, SearchX, User, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay, subDays, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type TimelineEvent = {
  id: string;
  occurred_at: string;
  event_type: string;
  actor_type: string;
  actor_id?: string | null;
  message: string;
  case_id: string | null;
  cases?: { title: string | null; journeys?: { name: string } } | null;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  automation_executed: "Automação Executada",
  bank_hour_ledger_adjusted: "Ajuste de Banco de Horas",
  bank_hour_ledger_posted: "Lançamento de Banco de Horas",
  card_created: "Cartão Criado",
  case_deleted: "Caso Excluído",
  case_opened: "Caso Aberto",
  case_state_changed: "Etapa Alterada",
  case_updated: "Caso Atualizado",
  presence_punch: "Batida de Ponto",
  task_created: "Tarefa Criada",
  task_completed: "Tarefa Concluída",
  comment_added: "Comentário Adicionado",
  document_uploaded: "Documento Anexado",
  message_sent: "Mensagem Enviada",
  webhook_received: "Webhook Recebido",
  integration_error: "Erro de Integração",
  field_updated: "Campo Atualizado",
  status_changed: "Status Alterado",
  user_assigned: "Usuário Atribuído",
  user_unassigned: "Usuário Removido",
};

const getEventLabel = (type: string) => EVENT_TYPE_LABELS[type] || type;

export default function GlobalTimeline() {
  const { activeTenantId } = useTenant();

  // Filters state
  const [filterText, setFilterText] = useState("");
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const [selectedActors, setSelectedActors] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});

  const eventTypesQ = useQuery({
    queryKey: ["timeline_event_types", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("timeline_events").select("event_type").eq("tenant_id", activeTenantId!).limit(2000);
      if (error) throw error;
      const set = new Set<string>();
      data.forEach(d => { if (d.event_type) set.add(d.event_type); });
      return Array.from(set).sort((a, b) => getEventLabel(a).localeCompare(getEventLabel(b)));
    }
  });

  const timelineQ = useQuery({
    queryKey: ["global_timeline_full", activeTenantId, Array.from(selectedEventTypes).join(","), Array.from(selectedActors).join(","), dateRange.from?.toISOString(), dateRange.to?.toISOString()],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from("timeline_events")
        .select("id, occurred_at, event_type, actor_type, actor_id, message, case_id, cases(title, journeys(name))")
        .eq("tenant_id", activeTenantId!)
        .order("occurred_at", { ascending: false });

      if (selectedEventTypes.size > 0) {
        query = query.in("event_type", Array.from(selectedEventTypes));
      }
      if (selectedActors.size > 0) {
        const arr = Array.from(selectedActors);
        const systemLike = arr.filter(a => a === "system" || a === "unknown");
        const userIds = arr.filter(a => a !== "system" && a !== "unknown");
        
        if (userIds.length > 0 && systemLike.length > 0) {
           query = query.or(`actor_id.in.(${userIds.join(',')}),actor_type.in.(${systemLike.join(',')})`);
        } else if (userIds.length > 0) {
           query = query.in("actor_id", userIds);
        } else if (systemLike.length > 0) {
           query = query.in("actor_type", systemLike);
        }
      }
      if (dateRange.from) {
        query = query.gte("occurred_at", startOfDay(dateRange.from).toISOString());
      }
      if (dateRange.to) {
        query = query.lt("occurred_at", endOfDay(dateRange.to).toISOString());
      }

      const { data, error } = await query.limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as TimelineEvent[];
    }
  });

  const usersQ = useQuery({
    queryKey: ["users_profile", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile").select("user_id, display_name, role").eq("tenant_id", activeTenantId!);
      if (error) throw error;
      const map = new Map<string, any>();
      data?.forEach(u => map.set(u.user_id, u));
      return map;
    }
  });

  const actorOptions = useMemo(() => {
    const opts = new Map<string, string>();
    opts.set("system", "Sistema");
    
    if (usersQ.data) {
      usersQ.data.forEach((u, id) => {
        const parts = (u.display_name || "Usuário").split(" ");
        const firstName = parts[0];
        const lastNameInit = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
        opts.set(id, `${firstName}${lastNameInit} (${u.role || "Membro"})`);
      });
    }
    
    return Array.from(opts.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [usersQ.data]);

  const getActorName = (evt: TimelineEvent) => {
    let name = evt.actor_type;
    if (evt.actor_id && usersQ.data?.has(evt.actor_id)) {
      const u = usersQ.data.get(evt.actor_id);
      const parts = (u.display_name || "Usuário").split(" ");
      const firstName = parts[0];
      const lastNameInit = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : "";
      name = `${firstName}${lastNameInit} (${u.role})`;
    }
    return name;
  };

  const filteredData = timelineQ.data?.filter(evt => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      evt.message?.toLowerCase().includes(lower) ||
      evt.event_type?.toLowerCase().includes(lower) ||
      evt.actor_type?.toLowerCase().includes(lower) ||
      evt.cases?.title?.toLowerCase().includes(lower)
    );
  });

  return (
    <div className="w-full space-y-8 animate-in fade-in zoom-in-95 duration-500">
      
      {/* Filters Panel */}
        <div className="bg-white border border-slate-200 rounded-[24px] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-700 mb-2">
            <Filter className="h-4 w-4" />
            Filtros
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Data Filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 transition-all shadow-sm",
                    dateRange.from && "border-blue-400 bg-blue-50 text-blue-700"
                  )}
                >
                  <Calendar className="mr-2 h-4 w-4 text-slate-400 flex-shrink-0" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd/MM/yyyy")} - {format(dateRange.to, "dd/MM/yyyy")}
                      </>
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    "Data: Todo Período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-3xl border-slate-200 shadow-2xl overflow-hidden" align="start">
                <div className="flex flex-col md:flex-row bg-white">
                  <div className="w-full md:w-44 border-b md:border-b-0 md:border-r border-slate-100 p-3 flex flex-col gap-1 bg-slate-50/50">
                    {[
                      { label: "Hoje", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                      { label: "Ontem", get: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
                      { label: "Últimos 7 dias", get: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
                      { label: "Últimos 30 dias", get: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
                      { label: "Mês Atual", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
                      { label: "Mês Passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
                      { label: "Todo Período", get: () => ({ from: undefined, to: undefined }) },
                    ].map((btn) => (
                      <Button
                        key={btn.label}
                        variant="ghost"
                        className="h-9 justify-start rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white hover:text-blue-600 transition-all"
                        onClick={() => setDateRange(btn.get())}
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                  <div className="p-2">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to })}
                      numberOfMonths={2}
                      locale={ptBR}
                      className="rounded-2xl"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Funcionalidade */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[150px] justify-start hover:bg-white transition-all shadow-sm gap-2",
                    selectedEventTypes.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                  )}
                >
                  <Zap className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {selectedEventTypes.size === 0 ? "Funcionalidade: Todas" : `${selectedEventTypes.size} selecionadas`}
                  <ChevronDown className="h-3 w-3 ml-auto opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] rounded-2xl p-2 shadow-xl border-slate-200" align="start">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Funcionalidade</p>
                  {selectedEventTypes.size > 0 && (
                    <button onClick={() => setSelectedEventTypes(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                  )}
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                  {(eventTypesQ.data ?? []).map((opt) => (
                    <label key={opt} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-blue-600 h-3.5 w-3.5 rounded"
                        checked={selectedEventTypes.has(opt)}
                        onChange={() => {
                          const next = new Set(selectedEventTypes);
                          next.has(opt) ? next.delete(opt) : next.add(opt);
                          setSelectedEventTypes(next);
                        }}
                      />
                      <span className="text-xs font-semibold text-slate-700 truncate">{getEventLabel(opt)}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Pessoa */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-10 rounded-2xl border-slate-200 bg-white/70 text-xs font-bold text-slate-700 min-w-[150px] justify-start hover:bg-white transition-all shadow-sm gap-2",
                    selectedActors.size > 0 && "border-blue-400 bg-blue-50 text-blue-700"
                  )}
                >
                  <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  {selectedActors.size === 0 ? "Pessoa: Todas" : `${selectedActors.size} selecionadas`}
                  <ChevronDown className="h-3 w-3 ml-auto opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] rounded-2xl p-2 shadow-xl border-slate-200" align="start">
                <div className="flex items-center justify-between px-2 py-1 mb-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pessoa/Autor</p>
                  {selectedActors.size > 0 && (
                    <button onClick={() => setSelectedActors(new Set())} className="text-[10px] text-blue-600 font-bold hover:underline">Limpar</button>
                  )}
                </div>
                <div className="max-h-[240px] overflow-y-auto space-y-0.5">
                  {actorOptions.map(([id, label]) => (
                    <label key={id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                      <input
                        type="checkbox"
                        className="accent-blue-600 h-3.5 w-3.5 rounded"
                        checked={selectedActors.has(id)}
                        onChange={() => {
                          const next = new Set(selectedActors);
                          next.has(id) ? next.delete(id) : next.add(id);
                          setSelectedActors(next);
                        }}
                      />
                      <span className="text-xs font-semibold text-slate-700 truncate">{label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Busque na mensagem..." 
                value={filterText} 
                onChange={e => setFilterText(e.target.value)} 
                className="h-10 bg-slate-50 rounded-2xl pl-9"
              />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button 
              variant="outline" 
              className="text-xs h-8 rounded-xl"
              onClick={() => {
                setDateRange({});
                setSelectedEventTypes(new Set());
                setSelectedActors(new Set());
                setFilterText("");
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        </div>

        {/* Timeline Content */}
        <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm min-h-[400px]">
          {timelineQ.isLoading && (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {!timelineQ.isLoading && filteredData?.length === 0 && (
             <div className="flex flex-col items-center justify-center h-40 text-slate-400 space-y-3">
               <SearchX className="h-8 w-8 opacity-20" />
               <p className="text-sm">Nenhum evento encontrado com os filtros atuais.</p>
             </div>
          )}

          {!timelineQ.isLoading && filteredData && filteredData.length > 0 && (
            <ul className="space-y-8 relative before:absolute before:inset-0 before:ml-[1.125rem] md:before:ml-[1.125rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {filteredData.map((event) => (
                <li key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  {/* Icon */}
                  <div className="flex items-center justify-center w-9 h-9 rounded-full border border-white bg-slate-50 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    <Clock className="w-4 h-4" />
                  </div>
                  
                  {/* Content Card */}
                  <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-[20px] border border-slate-200 shadow-sm hover:shadow-md transition-shadow group-hover:border-indigo-100">
                    <div className="flex items-center justify-between mb-2">
                      <time className="text-xs font-semibold text-slate-400">
                        {new Date(event.occurred_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                      </time>
                      <Badge variant="secondary" className="text-[10px] uppercase bg-slate-100 text-slate-500 px-2 py-0 h-5">
                        {getEventLabel(event.event_type)}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-slate-700 leading-relaxed font-medium">
                      {event.message}
                    </p>
                    
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                        <Users className="w-3.5 h-3.5" />
                        {getActorName(event)}
                      </span>
                      {event.cases && (
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-100">
                          <Activity className="w-3.5 h-3.5" />
                          Caso: {event.cases.title || 'Sem título'}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!timelineQ.isLoading && (timelineQ.data?.length ?? 0) >= 200 && (
            <div className="text-center mt-8">
              <p className="text-xs text-slate-400">Exibindo os 200 eventos mais recentes.</p>
            </div>
          )}
        </div>
    </div>
  );
}

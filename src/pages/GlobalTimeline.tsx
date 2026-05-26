import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useTenant } from "@/providers/TenantProvider";
import { Clock, Filter, Calendar, Zap, Search, Activity, Users, SearchX, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

export default function GlobalTimeline() {
  const { activeTenantId } = useTenant();

  // Filters state
  const [filterText, setFilterText] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [actorTypeFilter, setActorTypeFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const timelineQ = useQuery({
    queryKey: ["global_timeline_full", activeTenantId, eventTypeFilter, actorTypeFilter, startDate, endDate],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from("timeline_events")
        .select("id, occurred_at, event_type, actor_type, actor_id, message, case_id, cases(title, journeys(name))")
        .eq("tenant_id", activeTenantId!)
        .order("occurred_at", { ascending: false });

      if (eventTypeFilter) {
        query = query.ilike("event_type", `%${eventTypeFilter}%`);
      }
      if (actorTypeFilter) {
        query = query.ilike("actor_type", `%${actorTypeFilter}%`);
      }
      if (startDate) {
        query = query.gte("occurred_at", new Date(startDate).toISOString());
      }
      if (endDate) {
        // add 1 day to include the whole end date
        const nextDay = new Date(endDate);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt("occurred_at", nextDay.toISOString());
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Data Inicial
              </label>
              <Input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="bg-slate-50 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Data Final
              </label>
              <Input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="bg-slate-50 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                Funcionalidade
              </label>
              <Input 
                placeholder="Ex: case_update" 
                value={eventTypeFilter} 
                onChange={e => setEventTypeFilter(e.target.value)} 
                className="bg-slate-50 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Pessoa/Autor
              </label>
              <Input 
                placeholder="Ex: system, admin" 
                value={actorTypeFilter} 
                onChange={e => setActorTypeFilter(e.target.value)} 
                className="bg-slate-50 rounded-xl"
              />
            </div>
            <div className="sm:col-span-2 md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                Busca de Texto (Mensagem)
              </label>
              <Input 
                placeholder="Busque em toda a linha do tempo carregada..." 
                value={filterText} 
                onChange={e => setFilterText(e.target.value)} 
                className="bg-slate-50 rounded-xl"
              />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <Button 
              variant="outline" 
              className="text-xs h-8"
              onClick={() => {
                setStartDate("");
                setEndDate("");
                setEventTypeFilter("");
                setActorTypeFilter("");
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
                        {event.event_type}
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

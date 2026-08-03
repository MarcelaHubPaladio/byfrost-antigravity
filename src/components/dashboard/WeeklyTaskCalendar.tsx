import { useState, useMemo, useEffect } from "react";
import { format, addDays, subDays, startOfWeek, isSameDay, isBefore, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check, Plus, Loader2, Calendar as CalendarIcon, ExternalLink, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError } from "@/utils/toast";

interface Task {
  id: string;
  title: string;
  due_date: string | null;
  is_completed: boolean;
  is_commitment: boolean;
  completed_at: string | null;
  // new properties to differentiate from google calendar events
  is_event?: boolean;
  htmlLink?: string;
}

interface WeeklyTaskCalendarProps {
  tenantId: string;
  userId: string;
}

export function WeeklyTaskCalendar({ tenantId, userId }: WeeklyTaskCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Carrega seleção do localStorage ao iniciar
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`gcal_selection_${userId}`);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return []; // Se vazio, backend assume ["primary"]
  });

  // Salva no localStorage quando muda
  useEffect(() => {
    localStorage.setItem(`gcal_selection_${userId}`, JSON.stringify(selectedCalendarIds));
  }, [selectedCalendarIds, userId]);

  const toggleCalendarSelection = (id: string) => {
    setSelectedCalendarIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      return [...prev, id];
    });
  };

  const handlePrevWeek = () => setSelectedDate(subDays(selectedDate, 7));
  const handleNextWeek = () => setSelectedDate(addDays(selectedDate, 7));
  const handleToday = () => setSelectedDate(new Date());

  // Gera os dias da semana baseado na data selecionada (Segunda a Domingo)
  const weekDays = useMemo(() => {
    // startOfWeek com weekStartsOn: 1 (Segunda-feira)
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [selectedDate]);

  // Integrações (Google Calendar)
  const integrationsQ = useQuery({
    queryKey: ["user_integrations", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", userId);
      if (error) throw error;
      return data || [];
    },
  });

  const googleIntegration = integrationsQ.data?.find((i: any) => i.provider === "google_calendar");

  const handleConnectCalendar = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: { action: "url", redirect_uri: `${window.location.origin}/app/oauth/google/callback` },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (e: any) {
      showError(e.message);
      setIsConnecting(false);
    }
  };

  // Busca todas as tarefas do usuário (não concluídas ou recém concluídas)
  const tasksQ = useQuery({
    queryKey: ["weekly_tasks", tenantId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_tasks")
        .select("id, title, due_date, is_completed, is_commitment, completed_at")
        .eq("tenant_id", tenantId)
        .eq("assigned_to", userId);
        
      if (error) throw error;
      return data as Task[];
    },
  });

  // Busca lista de agendas do Google Calendar se estiver conectado
  const availableCalendarsQ = useQuery({
    queryKey: ["google_calendars_list", userId],
    enabled: !!googleIntegration,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: { action: "calendars" },
      });
      if (error) throw error;
      return data?.calendars || [];
    },
  });

  // Busca eventos do Google Calendar se estiver conectado
  const eventsQ = useQuery({
    queryKey: ["google_events", userId, weekDays[0].toISOString(), weekDays[6].toISOString(), selectedCalendarIds],
    enabled: !!googleIntegration,
    queryFn: async () => {
      const timeMin = startOfDay(weekDays[0]).toISOString();
      const timeMax = endOfDay(weekDays[6]).toISOString();
      
      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: { 
          action: "events", 
          timeMin, 
          timeMax, 
          calendarIds: selectedCalendarIds.length > 0 ? selectedCalendarIds : undefined 
        },
      });
      if (error) throw error;
      return data?.events || [];
    },
  });

  const toggleTaskCompleted = async (id: string, current: boolean) => {
    try {
      await supabase.from("super_tasks").update({ 
        is_completed: !current,
        completed_at: !current ? new Date().toISOString() : null
      }).eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["weekly_tasks"] });
      // também invalida a query global do dashboard caso exista
      queryClient.invalidateQueries({ queryKey: ["my_tasks"] }); 
    } catch (e: any) {
      showError(e.message);
    }
  };

  // Filtra as tarefas e mescla com eventos no dia selecionado
  const displayedItems = useMemo(() => {
    const today = startOfDay(new Date());
    const isSelectedToday = isSameDay(selectedDate, today);
    let items: Task[] = [];

    // 1. Adiciona as tarefas
    if (tasksQ.data) {
      const filteredTasks = tasksQ.data.filter(task => {
        if (!task.due_date) {
          return isSelectedToday && !task.is_completed;
        }

        const dueDate = startOfDay(parseISO(task.due_date));

        if (task.is_completed) {
          return isSameDay(dueDate, selectedDate);
        }

        if (isSelectedToday && isBefore(dueDate, today)) {
          return true;
        }

        return isSameDay(dueDate, selectedDate);
      });
      items = [...items, ...filteredTasks];
    }

    // 2. Adiciona os eventos do Google (formatados como Task para a UI)
    if (eventsQ.data) {
      const dayEvents = eventsQ.data.filter((evt: any) => {
        if (!evt.start) return false;
        const evtDate = startOfDay(parseISO(evt.start));
        return isSameDay(evtDate, selectedDate);
      }).map((evt: any) => ({
        id: `gcal-${evt.id}`,
        title: evt.summary,
        due_date: evt.start,
        is_completed: false, // eventos não são "concluíveis" com checkbox
        is_commitment: false,
        completed_at: null,
        is_event: true,
        htmlLink: evt.htmlLink,
      }));
      items = [...items, ...dayEvents];
    }

    // 3. Ordena tudo por horário
    return items.sort((a, b) => {
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return 0;
    });
  }, [tasksQ.data, eventsQ.data, selectedDate]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>
            </div>
            Tarefas & Agenda
            {googleIntegration && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 focus-visible:ring-0">
                    <Settings className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-4" align="start">
                  <h4 className="font-semibold text-sm mb-3">Minhas Agendas</h4>
                  {availableCalendarsQ.isLoading ? (
                    <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
                  ) : availableCalendarsQ.data?.length > 0 ? (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                      {availableCalendarsQ.data.map((cal: any) => (
                        <div key={cal.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={cal.id} 
                            checked={selectedCalendarIds.length === 0 ? cal.primary : selectedCalendarIds.includes(cal.id)}
                            onCheckedChange={() => toggleCalendarSelection(cal.id)}
                          />
                          <label htmlFor={cal.id} className="text-sm font-medium leading-none cursor-pointer line-clamp-1" title={cal.summary}>
                            {cal.summary} {cal.primary && <span className="text-xs text-slate-400 ml-1">(Principal)</span>}
                          </label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">Nenhuma agenda encontrada.</div>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Seu caderno de planejamento diário</p>
        </div>

        <div className="flex items-center gap-2">
          {!googleIntegration && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleConnectCalendar}
              disabled={isConnecting}
              className="mr-2 text-slate-600 bg-white border-slate-200 hover:bg-slate-50 rounded-xl font-semibold"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CalendarIcon className="w-4 h-4 mr-2" />
              )}
              Conectar Google Agenda
            </Button>
          )}

          <Button variant="outline" size="icon" onClick={handlePrevWeek} className="rounded-full w-8 h-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-semibold text-slate-700 min-w-[120px] text-center capitalize">
            {format(selectedDate, "MMMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextWeek} className="rounded-full w-8 h-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={handleToday} className="rounded-full ml-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none">
            Hoje
          </Button>
        </div>
      </div>

      {/* Régua da Semana */}
      <div className="flex justify-between items-center mb-8 px-2">
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          
          return (
            <div 
              key={day.toISOString()} 
              onClick={() => setSelectedDate(day)}
              className="flex flex-col items-center gap-2 cursor-pointer group"
            >
              <span className={`text-xs font-bold uppercase ${isSelected ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                {format(day, "eee", { locale: ptBR }).slice(0, 3)}
              </span>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                isSelected 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                  : isToday 
                    ? 'bg-indigo-50 text-indigo-600' 
                    : 'text-slate-700 group-hover:bg-slate-100'
              }`}>
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista de Tarefas / Eventos */}
      <div className="border rounded-2xl overflow-hidden bg-white">
        <div className="bg-slate-50 border-b px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-700 capitalize">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {displayedItems.length} {displayedItems.length === 1 ? 'item' : 'itens'}
          </span>
        </div>

        <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto custom-scrollbar">
          {tasksQ.isLoading || (googleIntegration && eventsQ.isLoading) ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Nenhuma tarefa ou evento para este dia.
            </div>
          ) : (
            displayedItems.map(item => (
              <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                
                {item.is_event ? (
                  <div className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center">
                    <CalendarIcon className="w-4 h-4 text-rose-500" />
                  </div>
                ) : (
                  <button 
                    onClick={() => toggleTaskCompleted(item.id, item.is_completed)}
                    className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-all ${
                      item.is_completed 
                        ? 'bg-emerald-500 border-emerald-500 text-white' 
                        : 'border-slate-300 hover:border-indigo-500 bg-white'
                    }`}
                  >
                    {item.is_completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </button>
                )}
                
                <div className="flex-1 flex items-center min-w-0 gap-2">
                  <span className={`text-sm font-medium truncate ${item.is_completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {item.title}
                  </span>
                  {item.is_event && item.htmlLink && (
                    <a href={item.htmlLink} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${
                    item.is_event
                      ? 'bg-rose-50 text-rose-600'
                      : item.is_completed 
                        ? 'bg-emerald-100 text-emerald-700'
                        : item.is_commitment 
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-indigo-50 text-indigo-700'
                  }`}>
                    {item.is_event ? 'Agenda' : item.is_completed ? 'Concluída' : item.is_commitment ? 'Combinado' : 'Trabalho'}
                  </span>
                  
                  {item.due_date && (
                    <span className="text-sm font-medium text-slate-500 w-12 text-right">
                      {format(parseISO(item.due_date), "HH:mm")}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          
          <div className="p-3">
            <Button variant="ghost" className="w-full justify-start text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-semibold h-10">
              <Plus className="w-4 h-4 mr-2" />
              Nova tarefa
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

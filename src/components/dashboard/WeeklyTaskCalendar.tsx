import { useState, useMemo } from "react";
import { format, addDays, subDays, startOfWeek, isSameDay, isBefore, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

interface WeeklyTaskCalendarProps {
  tenantId: string;
  userId: string;
}

export function WeeklyTaskCalendar({ tenantId, userId }: WeeklyTaskCalendarProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const queryClient = useQueryClient();

  const handlePrevWeek = () => setSelectedDate(subDays(selectedDate, 7));
  const handleNextWeek = () => setSelectedDate(addDays(selectedDate, 7));
  const handleToday = () => setSelectedDate(new Date());

  // Gera os dias da semana baseado na data selecionada (Segunda a Domingo)
  const weekDays = useMemo(() => {
    // startOfWeek com weekStartsOn: 1 (Segunda-feira)
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i));
  }, [selectedDate]);

  // Busca todas as tarefas do usuário (não concluídas ou recém concluídas)
  const tasksQ = useQuery({
    queryKey: ["weekly_tasks", tenantId, userId],
    queryFn: async () => {
      // Busca tarefas em aberto OU concluídas nos últimos 30 dias (para aparecerem no histórico recente)
      const { data, error } = await supabase
        .from("super_tasks")
        .select("id, title, due_date, is_completed, is_commitment, completed_at")
        .eq("tenant_id", tenantId)
        .eq("assigned_to", userId);
        
      if (error) throw error;
      return data as Task[];
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

  // Filtra as tarefas a serem exibidas no dia selecionado
  const displayedTasks = useMemo(() => {
    if (!tasksQ.data) return [];
    
    const today = startOfDay(new Date());
    const isSelectedToday = isSameDay(selectedDate, today);

    return tasksQ.data.filter(task => {
      // Se não tem data, vamos decidir onde mostrar. Por enquanto, só mostra se a data existir ou for "Hoje".
      // Para simular um backlog, tarefas sem data aparecem no "Hoje"
      if (!task.due_date) {
        return isSelectedToday && !task.is_completed;
      }

      const dueDate = startOfDay(parseISO(task.due_date));

      // Se a tarefa já está concluída, ela deve aparecer apenas no dia em que era devida (ou no dia em que foi concluída).
      // Vamos assumir que ela aparece no due_date dela.
      if (task.is_completed) {
        return isSameDay(dueDate, selectedDate);
      }

      // Se a tarefa não está concluída:
      // Se a data de vencimento é hoje ou antes de hoje (atrasada), E o usuário está olhando o dia de "Hoje", exibe ela.
      if (isSelectedToday && isBefore(dueDate, today)) {
        return true;
      }

      // Caso contrário, exibe ela apenas no seu dia correto.
      return isSameDay(dueDate, selectedDate);
    }).sort((a, b) => {
      // Ordena por horário (se tiver)
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });
  }, [tasksQ.data, selectedDate]);

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M9 15h6"/><path d="M9 11h6"/></svg>
            </div>
            Tarefas
          </h2>
          <p className="text-sm text-slate-500 mt-1">Seu caderno de planejamento</p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Lista de Tarefas */}
      <div className="border rounded-2xl overflow-hidden bg-white">
        <div className="bg-slate-50 border-b px-4 py-3 flex justify-between items-center">
          <span className="text-sm font-bold text-slate-700 capitalize">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {displayedTasks.length} {displayedTasks.length === 1 ? 'tarefa' : 'tarefas'}
          </span>
        </div>

        <div className="divide-y divide-slate-100 max-h-[350px] overflow-y-auto custom-scrollbar">
          {tasksQ.isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : displayedTasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Nenhuma tarefa para este dia.
            </div>
          ) : (
            displayedTasks.map(task => (
              <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                <button 
                  onClick={() => toggleTaskCompleted(task.id, task.is_completed)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-all ${
                    task.is_completed 
                      ? 'bg-emerald-500 border-emerald-500 text-white' 
                      : 'border-slate-300 hover:border-indigo-500 bg-white'
                  }`}
                >
                  {task.is_completed && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </button>
                
                <span className={`flex-1 text-sm font-medium ${task.is_completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {task.title}
                </span>

                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md ${
                    task.is_completed 
                      ? 'bg-emerald-100 text-emerald-700'
                      : task.is_commitment 
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-indigo-50 text-indigo-700'
                  }`}>
                    {task.is_completed ? 'Concluída' : task.is_commitment ? 'Combinado' : 'Trabalho'}
                  </span>
                  
                  {task.due_date && (
                    <span className="text-sm font-medium text-slate-500 w-12 text-right">
                      {format(parseISO(task.due_date), "HH:mm")}
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

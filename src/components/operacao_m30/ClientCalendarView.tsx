import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { CalendarIcon } from "lucide-react";

export function ClientCalendarView({
  console.log("ClientCalendarView loaded v2"); 
  cases,
  defaultPostingDays = [],
  onUpdate
}: { 
  cases: any[],
  defaultPostingDays?: number[],
  clientLabels?: {id: string, name: string, color: string}[],
  onUpdate?: () => void
}) {
  const [date, setDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  
  const monthStart = startOfMonth(date);
  const monthEnd = endOfMonth(monthStart);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const blanks = Array.from({ length: startDayOfWeek }).map((_, i) => <div key={`blank-${i}`} className="bg-slate-50/50 rounded-[24px] border border-transparent min-h-[140px]" />);

  const nextMonth = () => setDate(addMonths(date, 1));
  const prevMonth = () => setDate(subMonths(date, 1));

  const casesByDay = new Map<string, any[]>();
  for (const c of cases) {
    // using end_date from planejamento or due_at. 
    // for now we use due_at or updated_at as fallback to show something
    const rawDate = (c.meta_json as any)?.due_at || c.updated_at;
    if (!rawDate) continue;
    
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) continue;

    const dayKey = format(d, 'yyyy-MM-dd');
    const arr = casesByDay.get(dayKey) ?? [];
    arr.push(c);
    casesByDay.set(dayKey, arr);
    casesByDay.set(dayKey, arr);
  }

  const autoDistributeDates = async () => {
    if (!defaultPostingDays || defaultPostingDays.length === 0) {
      toast.error("Configure os dias padrões de postagem primeiro!");
      return;
    }
    
    // Encontrar casos sem data
    const casesWithoutDate = cases.filter(c => !(c.meta_json as any)?.due_at);
    if (casesWithoutDate.length === 0) {
      toast.info("Nenhum caso sem data para distribuir.");
      return;
    }

    // Achar os próximos dias disponíveis a partir de hoje
    let currentDate = new Date();
    const datesToAssign: Date[] = [];
    
    // Gerar datas suficientes para todos os casos
    while (datesToAssign.length < casesWithoutDate.length) {
      currentDate = addMonths(currentDate, 0); // clone avoiding mutation issues
      currentDate.setDate(currentDate.getDate() + 1);
      if (defaultPostingDays.includes(getDay(currentDate))) {
        datesToAssign.push(new Date(currentDate));
      }
    }

    toast.loading("Distribuindo datas automaticamente...");
    let updatedCount = 0;

    for (let i = 0; i < casesWithoutDate.length; i++) {
      const c = casesWithoutDate[i];
      const newDate = datesToAssign[i];
      const newMeta = { ...(c.meta_json || {}), due_at: newDate.toISOString() };
      
      const { error } = await supabase
        .from("cases")
        .update({ meta_json: newMeta })
        .eq("id", c.id);
        
      if (!error) updatedCount++;
    }

    toast.dismiss();
    toast.success(`Datas atribuídas a ${updatedCount} caso(s)!`);
    if (onUpdate) onUpdate();
  };

  const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 bg-white/70 p-3 rounded-[24px] border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 capitalize ml-2">
          {format(date, 'MMMM yyyy', { locale: ptBR })}
        </h3>
        <div className="flex items-center gap-2">
          {defaultPostingDays.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs font-semibold gap-1 text-indigo-600 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 mr-2" onClick={autoDistributeDates}>
              <CalendarIcon className="w-3.5 h-3.5" /> Auto-distribuir
            </Button>
          )}
          <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs font-semibold" onClick={() => setDate(new Date())}>
            Hoje
          </Button>
          <div className="flex border rounded-xl overflow-hidden ml-2 h-8">
            <Button 
              variant="ghost" 
              className={cn("rounded-none h-full px-3 text-xs font-bold", viewMode === 'calendar' ? "bg-slate-100 text-slate-900" : "text-slate-400")}
              onClick={() => setViewMode('calendar')}
            >
              Calendário
            </Button>
            <Button 
              variant="ghost" 
              className={cn("rounded-none h-full px-3 text-xs font-bold", viewMode === 'list' ? "bg-slate-100 text-slate-900" : "text-slate-400")}
              onClick={() => setViewMode('list')}
            >
              Lista
            </Button>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl ml-2" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {viewMode === 'calendar' ? (
        <>
          <div className="grid grid-cols-7 gap-3 mb-2 px-1">
            {weekDays.map(d => (
              <div key={d} className="text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {blanks}
            {daysInMonth.map((day) => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const dayCases = casesByDay.get(dayKey) ?? [];
              const isTodayDate = isToday(day);

              return (
                <div key={dayKey} className={cn(
                  "bg-white/80 rounded-[24px] border p-2 min-h-[140px] shadow-sm transition-all flex flex-col",
                  isTodayDate ? "border-[hsl(var(--byfrost-accent)/0.4)] bg-[hsl(var(--byfrost-accent)/0.02)] ring-1 ring-[hsl(var(--byfrost-accent)/0.2)]" : "border-slate-200"
                )}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={cn(
                      "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full tracking-tighter",
                      isTodayDate ? "bg-[hsl(var(--byfrost-accent))] text-white" : "text-slate-700"
                    )}>{format(day, 'd')}</span>
                    {dayCases.length > 0 && (
                      <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                        {dayCases.length} caso{dayCases.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-col gap-1.5 flex-1 overflow-y-auto no-scrollbar">
                    {dayCases.map(c => (
                      <DayCaseCard key={c.id} c={c} clientLabels={clientLabels} viewMode="list" />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="bg-white/80 rounded-[24px] border border-slate-200 p-4 min-h-[400px]">
          <div className="space-y-4">
            {Array.from(casesByDay.keys()).sort().map(dayKey => {
              const dayCases = casesByDay.get(dayKey)!;
              const dateObj = new Date(dayKey + 'T12:00:00'); 
              
              if (format(dateObj, 'yyyy-MM') !== format(date, 'yyyy-MM')) return null;

              return (
                <div key={dayKey} className="flex flex-col md:flex-row gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <div className="md:w-32 shrink-0">
                    <p className="text-sm font-black text-slate-800">{format(dateObj, 'dd MMM', { locale: ptBR })}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{format(dateObj, 'EEEE', { locale: ptBR })}</p>
                  </div>
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {dayCases.map(c => (
                      <DayCaseCard key={c.id} c={c} clientLabels={clientLabels} viewMode="grid" isToday={isToday(dateObj)} />
                    ))}
                  </div>
                </div>
              );
            })}
            
            {Array.from(casesByDay.keys()).filter(dayKey => format(new Date(dayKey + 'T12:00:00'), 'yyyy-MM') === format(date, 'yyyy-MM')).length === 0 && (
              <div className="text-center py-12 text-sm text-slate-400 font-medium">
                Nenhum caso agendado para este mês.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DayCaseCard({ c, clientLabels, viewMode, isToday = false }: { c: any, clientLabels?: any[], viewMode: 'list' | 'grid', isToday?: boolean }) {
  if (viewMode === 'list') {
    return (
      <Link 
        key={c.id} 
        to={`/app/operacao-m30/${c.id}`}
        className="bg-white border border-slate-200 rounded-xl p-2 hover:border-indigo-300 hover:shadow-sm transition-all group"
      >
        <p className="text-[10px] font-bold text-slate-800 leading-tight line-clamp-2 group-hover:text-indigo-600">
          {c.title || "Sem título"}
        </p>
        {clientLabels && ((c.meta_json as any)?.labels || []).length > 0 && (
          <div className="mt-1 flex flex-wrap gap-0.5">
            {((c.meta_json as any)?.labels || []).map((lblId: string) => {
              const lbl = clientLabels.find(l => l.id === lblId);
              if (!lbl) return null;
              return (
                <span key={lbl.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: lbl.color }} title={lbl.name} />
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-1 mt-1 text-[8px] text-slate-400 font-medium">
          <span className="truncate">{c.state}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link 
      key={c.id} 
      to={`/app/operacao-m30/${c.id}`}
      className={cn(
        "bg-white border rounded-xl p-3 hover:border-indigo-300 hover:shadow-sm transition-all group flex flex-col justify-between",
        isToday ? "border-[hsl(var(--byfrost-accent)/0.3)] bg-[hsl(var(--byfrost-accent)/0.02)]" : "border-slate-200"
      )}
    >
      <div>
        <p className="text-xs font-bold text-slate-900 leading-tight group-hover:text-indigo-600 mb-2">
          {c.title || "Sem título"}
        </p>
        {clientLabels && ((c.meta_json as any)?.labels || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {((c.meta_json as any)?.labels || []).map((lblId: string) => {
              const lbl = clientLabels.find(l => l.id === lblId);
              if (!lbl) return null;
              return (
                <span key={lbl.id} className="text-[8px] font-bold px-1.5 py-0.5 rounded-sm" style={{ backgroundColor: lbl.color, color: '#fff' }}>
                  {lbl.name}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 mt-auto pt-2 border-t border-slate-50 text-[9px] text-slate-400 font-medium">
        <span className="truncate">{c.state}</span>
      </div>
    </Link>
  );
}

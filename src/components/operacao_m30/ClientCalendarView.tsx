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
  cases,
  defaultPostingDays = [],
  onUpdate
}: { 
  cases: any[],
  defaultPostingDays?: number[],
  onUpdate?: () => void
}) {
  const [date, setDate] = useState(new Date());
  
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
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
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
              <div className="flex flex-col gap-1.5 mt-1 max-h-[140px] overflow-y-auto no-scrollbar scroll-smooth">
                {dayCases.map(c => (
                  <Link
                    key={c.id}
                    to={`/app/operacao-m30/${c.id}`}
                    className="block p-2 rounded-[16px] border border-slate-100 bg-white hover:bg-slate-50 hover:border-slate-200 transition-colors cursor-pointer shadow-sm"
                    title={c.title ?? "Caso sem título"}
                  >
                    <div className="text-[11px] font-semibold text-slate-800 line-clamp-2 leading-tight">
                      {c.title || "Caso sem título"}
                    </div>
                    {Boolean(c.state) && (
                      <div className="text-[9px] text-slate-400 truncate mt-1 font-medium uppercase">
                        {c.state}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

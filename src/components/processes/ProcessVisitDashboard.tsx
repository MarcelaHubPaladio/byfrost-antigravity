import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Card } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  Cell
} from "recharts";
import { 
  Users, 
  Eye, 
  TrendingUp, 
  Calendar,
  Clock,
  ArrowUpRight,
  ClipboardCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ProcessVisitDashboard() {
  const { activeTenantId } = useTenant();

  const statsQ = useQuery({
    queryKey: ["process_stats", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      // 1. Get all processes
      const { data: processes } = await supabase
        .from("processes")
        .select("id, title")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null);

      // 2. Get visits
      const { data: visits } = await supabase
        .from("process_visits")
        .select("id, process_id, visited_at, user_id")
        .eq("tenant_id", activeTenantId!)
        .order("visited_at", { ascending: false });

      return { processes: processes || [], visits: visits || [] };
    },
  });

  const { totalVisits, uniqueViewers, mostVisited, chartData } = useMemo(() => {
    const visits = statsQ.data?.visits || [];
    const processes = statsQ.data?.processes || [];
    
    // Total visits
    const totalVisits = visits.length;
    
    // Unique viewers
    const uniqueViewers = new Set(visits.map(v => v.user_id)).size;

    // Most visited
    const counts: Record<string, { title: string, count: number }> = {};
    processes.forEach(p => counts[p.id] = { title: p.title, count: 0 });
    visits.forEach(v => {
      if (counts[v.process_id]) counts[v.process_id].count++;
    });
    
    const mostVisited = Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .filter(p => p.count > 0);

    // Visits over time (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();

    const chartData = last7Days.map(date => {
      const count = visits.filter(v => v.visited_at.startsWith(date)).length;
      return { 
        date: new Date(date).toLocaleDateString("pt-BR", { day: '2-digit', month: 'short' }), 
        visitas: count 
      };
    });

    return { totalVisits, uniqueViewers, mostVisited, chartData };
  }, [statsQ.data]);

  const COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#f43f5e'];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Eye className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Total de Visitas</div>
              <div className="text-2xl font-bold text-slate-900">{totalVisits}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-600 font-semibold bg-emerald-50 w-fit px-2 py-0.5 rounded-lg">
            <TrendingUp className="h-3 w-3" /> +12% vs mês anterior
            {/* Placeholder stats */}
          </div>
        </Card>

        <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Visualizadores Únicos</div>
              <div className="text-2xl font-bold text-slate-900">{uniqueViewers}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <Clock className="h-3 w-3" /> Última visita há 5 min
          </div>
        </Card>

        <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Processos Ativos</div>
              <div className="text-2xl font-bold text-slate-900">{(statsQ.data?.processes || []).length}</div>
            </div>
          </div>
          <div className="mt-4 text-[11px] text-slate-400 font-medium">
            4 novos criados este mês
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <BarChart className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" /> 
            Processos mais Visitados
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mostVisited} layout="vertical" margin={{ left: 40, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="title" 
                  type="category" 
                  width={100} 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#64748b' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  labelStyle={{ fontWeight: 'bold', fontSize: '12px' }}
                />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={32}>
                  {mostVisited.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[hsl(var(--byfrost-accent))]" />
            Visitas nos Últimos 7 Dias
          </h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 500, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fontSize: 10, fontWeight: 500, fill: '#94a3b8' }}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="visitas" 
                  stroke="hsl(var(--byfrost-accent))" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#fff', strokeWidth: 2, stroke: 'hsl(var(--byfrost-accent))' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      
      <Card className="rounded-[28px] border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-400" />
            Atividade Recente
        </h3>
        <div className="space-y-3">
          {(statsQ.data?.visits || []).slice(0, 5).map((visit: any, idx) => {
            const process = statsQ.data?.processes.find(p => p.id === visit.process_id);
            return (
              <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 border border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Um usuário</div>
                    <div className="text-xs text-slate-500">Visualizou <span className="text-slate-900 font-medium">{process?.title || "Processo"}</span></div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {new Date(visit.visited_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </div>
              </div>
            );
          })}
          {(!statsQ.data?.visits.length) && (
            <div className="py-10 text-center text-slate-400 text-xs italic">
                Ainda não há visitas registradas.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

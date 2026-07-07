import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KpiCard } from "../components/KpiCard";
import { UserCheck, UsersRound, Megaphone, Target } from "lucide-react";

const leadsData = [
  { name: "Sem 1", leads: 400, convertidos: 240 },
  { name: "Sem 2", leads: 300, convertidos: 139 },
  { name: "Sem 3", leads: 500, convertidos: 380 },
  { name: "Sem 4", leads: 450, convertidos: 290 },
];

export function BiCrmTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total de Leads" value="1.650" trend={24.5} icon={UsersRound} />
        <KpiCard title="Taxa de Conversão" value="45.2%" trend={3.1} icon={Target} />
        <KpiCard title="Custo por Lead (CPL)" value="R$ 12,40" trend={-1.5} icon={Megaphone} />
        <KpiCard title="Clientes Ativos" value="745" trend={12.0} icon={UserCheck} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="col-span-1 md:col-span-2 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Aquisição de Leads</h3>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadsData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConvertidos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f172a', fontWeight: 500 }} />
                <Area type="monotone" dataKey="leads" name="Leads Gerados" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorLeads)" />
                <Area type="monotone" dataKey="convertidos" name="Convertidos" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorConvertidos)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
           <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Funil de Vendas</h3>
           
           <div className="space-y-4">
             {[
               { stage: "Visitantes", count: 5000, percentage: 100, color: "bg-indigo-500" },
               { stage: "Leads", count: 1650, percentage: 33, color: "bg-purple-500" },
               { stage: "Oportunidades", count: 850, percentage: 17, color: "bg-pink-500" },
               { stage: "Clientes", count: 745, percentage: 15, color: "bg-rose-500" }
             ].map((item, i) => (
               <div key={i} className="group relative">
                 <div className="flex items-center justify-between text-sm font-medium mb-1.5">
                   <span className="text-slate-700 dark:text-slate-300">{item.stage}</span>
                   <span className="text-slate-900 dark:text-white">{item.count}</span>
                 </div>
                 <div className="h-8 w-full overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800/50 flex transition-all">
                   <div 
                     className={cn("h-full transition-all duration-1000 ease-out flex items-center px-3 text-xs font-bold text-white", item.color)} 
                     style={{ width: `${Math.max(item.percentage, 15)}%` }} // Minimum width for text visibility
                   >
                     {item.percentage}%
                   </div>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
}

// Utilitário temporário copiado para o arquivo para evitar problemas de dependência caso não exista no scope do componente
function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(" ");
}

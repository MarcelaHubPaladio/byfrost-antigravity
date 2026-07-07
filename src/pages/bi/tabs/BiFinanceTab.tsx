import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, Cell, PieChart, Pie } from "recharts";
import { KpiCard } from "../components/KpiCard";
import { ArrowDownUp, Coins, PiggyBank, Receipt } from "lucide-react";

const monthlyData = [
  { name: "Jan", recebido: 4000, pendente: 2400 },
  { name: "Fev", recebido: 3000, pendente: 1398 },
  { name: "Mar", recebido: 2000, pendente: 9800 },
  { name: "Abr", recebido: 2780, pendente: 3908 },
  { name: "Mai", recebido: 1890, pendente: 4800 },
  { name: "Jun", recebido: 2390, pendente: 3800 },
];

const expenseData = [
  { name: "Operacional", value: 400 },
  { name: "Marketing", value: 300 },
  { name: "Folha de Pagamento", value: 300 },
  { name: "Impostos", value: 200 },
];
const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b'];

export function BiFinanceTab() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Saldo em Contas" value="R$ 152.490,00" icon={PiggyBank} />
        <KpiCard title="Contas a Receber" value="R$ 45.200,00" trend={5.4} icon={ArrowDownUp} className="text-emerald-500" />
        <KpiCard title="Contas a Pagar" value="R$ 22.150,00" trend={-2.1} icon={Receipt} className="text-rose-500" />
        <KpiCard title="Margem de Lucro" value="28.4%" trend={1.2} icon={Coins} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Fluxo de Recebimentos</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-slate-500 dark:text-slate-400" tickFormatter={(val) => `R$${val/1000}k`} />
                <Tooltip cursor={{ fill: 'currentColor' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} wrapperClassName="dark:text-slate-800" />
                <Legend iconType="circle" />
                <Bar dataKey="recebido" name="Recebido" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="pendente" name="Pendente" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Distribuição de Despesas</h3>
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expenseData} cx="50%" cy="50%" innerRadius={80} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                  {expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

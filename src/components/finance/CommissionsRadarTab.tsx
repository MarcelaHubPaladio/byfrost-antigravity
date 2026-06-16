import { useMemo } from "react";
import { DollarSign, TrendingUp, Search, Calendar, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function CommissionsRadarTab({ 
  cases, 
  caseFields, 
  caseTotals,
  vendors,
  users
}: { 
  cases: any[];
  caseFields: Map<string, any>;
  caseTotals: Map<string, number>;
  vendors: any[];
  users: any[];
}) {
  const radarData = useMemo(() => {
    const vMap = new Map<string, any>();
    
    vendors.forEach(v => {
      // Find rules
      const user = users.find(u => u.display_name === v.display_name || u.user_id === v.id);
      const rules = user?.meta_json?.commission_rules || { base_percent: 5 }; // default 5%
      
      vMap.set(v.id, {
        id: v.id,
        name: v.display_name || "Sem Nome",
        avatar: v.meta_json?.avatar_url || user?.avatar_url,
        basePercent: rules.base_percent || 5,
        totalTirado: 0,
        totalFaturado: 0,
        comissaoTirada: 0,
        comissaoFaturada: 0,
        qtdPedidos: 0,
      });
    });

    cases.forEach(c => {
      const vId = c.assigned_vendor_id;
      if (!vId || !vMap.has(vId)) return;
      const v = vMap.get(vId);

      const f = caseFields.get(c.id) || {};
      const caseTotal = caseTotals.get(c.id) || Number(f.expected_revenue) || 0;
      
      const billStatus = (f.billing_status || "Pendente").toLowerCase();
      const isFaturado = billStatus.includes("pago") || billStatus.includes("faturado");
      const isParcial = billStatus.includes("parcial");
      const billVal = isFaturado ? caseTotal : (isParcial ? Number(f.partial_paid_value || 0) : 0);

      v.qtdPedidos += 1;
      v.totalTirado += caseTotal;
      v.totalFaturado += billVal;
      
      // Calculate estimated commission without N+1 query items lookup
      v.comissaoTirada += (caseTotal * (v.basePercent / 100));
      v.comissaoFaturada += (billVal * (v.basePercent / 100));
    });

    return Array.from(vMap.values())
      .filter(v => v.totalTirado > 0 || v.totalFaturado > 0)
      .sort((a, b) => b.comissaoFaturada - a.comissaoFaturada);
  }, [cases, caseFields, caseTotals, vendors, users]);

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const grandTotalComissaoFaturada = radarData.reduce((acc, curr) => acc + curr.comissaoFaturada, 0);
  const grandTotalComissaoTirada = radarData.reduce((acc, curr) => acc + curr.comissaoTirada, 0);

  return (
    <div className="space-y-6">
      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-24 h-24 text-emerald-600" />
          </div>
          <p className="text-emerald-700 font-bold text-sm uppercase tracking-wider mb-2">Comissões A Pagar (Faturado)</p>
          <p className="text-4xl font-black text-emerald-900">{formatMoney(grandTotalComissaoFaturada)}</p>
          <p className="text-emerald-600 mt-2 text-sm font-medium">Sobre pedidos já acertados pelo cliente.</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <TrendingUp className="w-24 h-24 text-indigo-600" />
          </div>
          <p className="text-indigo-700 font-bold text-sm uppercase tracking-wider mb-2">Comissões Virtuais (Tirados)</p>
          <p className="text-4xl font-black text-indigo-900">{formatMoney(grandTotalComissaoTirada)}</p>
          <p className="text-indigo-600 mt-2 text-sm font-medium">Previsão bruta sobre toda a venda.</p>
        </div>
      </div>

      {/* Radar List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
           <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
             <TrendingUp className="w-5 h-5 text-indigo-500" />
             Ranking Ao Vivo de Vendedores
           </h3>
           <Badge variant="outline" className="bg-white font-bold">{radarData.length} Vendedores Ativos</Badge>
        </div>
        
        <div className="divide-y divide-slate-100">
          {radarData.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-medium">Nenhuma comissão encontrada no período.</div>
          ) : radarData.map(v => (
            <div key={v.id} className="p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-4 w-64 shrink-0">
                {v.avatar ? (
                  <img src={v.avatar} alt="" className="w-12 h-12 rounded-full border-2 border-white shadow-sm object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500">
                    {v.name.substring(0,2).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-bold text-slate-900">{v.name}</p>
                  <p className="text-xs font-semibold text-slate-500 uppercase">{v.qtdPedidos} Pedidos • {v.basePercent}% Base</p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-2 gap-4">
                <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
                   <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider mb-1">A Pagar (Faturado)</p>
                   <p className="text-lg font-black text-emerald-700">{formatMoney(v.comissaoFaturada)}</p>
                   <p className="text-xs font-semibold text-slate-500 mt-1">Base: {formatMoney(v.totalFaturado)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                   <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-1">Previsão (Tirado)</p>
                   <p className="text-lg font-black text-slate-700">{formatMoney(v.comissaoTirada)}</p>
                   <p className="text-xs font-semibold text-slate-400 mt-1">Base: {formatMoney(v.totalTirado)}</p>
                </div>
              </div>
              
              <div className="w-12 shrink-0 flex justify-end">
                 <button className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-400 transition-colors shadow-sm">
                   <ChevronRight className="w-4 h-4" />
                 </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

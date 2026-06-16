import { useMemo, useState } from "react";
import { DollarSign, TrendingUp, Search, ChevronRight, ChevronDown, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const radarData = useMemo(() => {
    const vMap = new Map<string, any>();
    
    vendors.forEach(v => {
      const user = users.find(u => u.display_name === v.display_name || u.user_id === v.id);
      const rules = user?.meta_json?.commission_rules || { base_percent: 5 };
      
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
        pedidos: []
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

      const cTirada = caseTotal * (v.basePercent / 100);
      const cFaturada = billVal * (v.basePercent / 100);

      v.qtdPedidos += 1;
      v.totalTirado += caseTotal;
      v.totalFaturado += billVal;
      v.comissaoTirada += cTirada;
      v.comissaoFaturada += cFaturada;

      v.pedidos.push({
        id: c.id,
        title: c.title || `Pedido #${c.legacy_id || c.id.substring(0,6)}`,
        status: f.billing_status || "Pendente",
        date: c.created_at,
        isFaturado,
        valorTotal: caseTotal,
        valorFaturado: billVal,
        comissaoEstimada: isFaturado ? cFaturada : cTirada
      });
    });

    return Array.from(vMap.values())
      .filter(v => v.totalTirado > 0 || v.totalFaturado > 0)
      .map(v => ({
         ...v, 
         pedidos: v.pedidos.sort((a:any, b:any) => new Date(b.date).getTime() - new Date(a.date).getTime()) 
      }))
      .sort((a, b) => b.comissaoFaturada - a.comissaoFaturada);
  }, [cases, caseFields, caseTotals, vendors, users]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return radarData;
    return radarData.filter(v => v.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [radarData, searchTerm]);

  const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  const grandTotalComissaoFaturada = radarData.reduce((acc, curr) => acc + curr.comissaoFaturada, 0);
  const grandTotalComissaoTirada = radarData.reduce((acc, curr) => acc + curr.comissaoTirada, 0);

  const toggleExpand = (id: string) => {
    if (expandedVendor === id) setExpandedVendor(null);
    else setExpandedVendor(id);
  };

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 border-b border-slate-100 bg-slate-50 gap-4">
           <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
             <TrendingUp className="w-5 h-5 text-indigo-500" />
             Ranking Ao Vivo
           </h3>
           
           <div className="flex items-center gap-3 w-full sm:w-auto">
             <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Buscar vendedor..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
             </div>
             <Badge variant="outline" className="bg-white font-bold h-10 px-4 whitespace-nowrap">{filteredData.length} Vendedores Ativos</Badge>
           </div>
        </div>
        
        <div className="divide-y divide-slate-100">
          {filteredData.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-medium">Nenhum vendedor ou comissão encontrada no período.</div>
          ) : filteredData.map(v => (
            <div key={v.id} className="flex flex-col">
              {/* Vendedor Row */}
              <div 
                onClick={() => toggleExpand(v.id)}
                className="p-5 flex flex-col md:flex-row md:items-center gap-4 hover:bg-slate-50 transition-colors cursor-pointer"
              >
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
                     {expandedVendor === v.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                   </button>
                </div>
              </div>

              {/* Accordion Pedidos */}
              {expandedVendor === v.id && (
                <div className="bg-slate-50 border-t border-slate-100 p-4 md:pl-20">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Extrato de Pedidos do Período</h4>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {v.pedidos.map((p: any) => (
                      <div key={p.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-bold text-slate-800 truncate">{p.title}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-slate-500">{format(new Date(p.date), 'dd/MM/yyyy')}</span>
                            <span className="text-xs font-medium text-slate-600">Venda: {formatMoney(p.valorTotal)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                           <div className="flex items-center justify-end gap-1.5 mb-1">
                             {p.isFaturado ? (
                               <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                             ) : (
                               <Clock className="w-3.5 h-3.5 text-amber-500" />
                             )}
                             <span className={`text-xs font-bold ${p.isFaturado ? 'text-emerald-600' : 'text-amber-600'}`}>
                               {formatMoney(p.comissaoEstimada)}
                             </span>
                           </div>
                           <p className="text-[10px] text-slate-400 font-medium">{p.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

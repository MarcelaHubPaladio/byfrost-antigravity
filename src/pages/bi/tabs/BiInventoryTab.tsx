import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { DateRange } from "react-day-picker";
import { KpiCard } from "../components/KpiCard";
import { PackageSearch, PackageOpen, Boxes, ShoppingCart } from "lucide-react";

interface BiInventoryTabProps {
  dateRange?: DateRange;
}

export function BiInventoryTab({ dateRange }: BiInventoryTabProps) {
  const { activeTenantId } = useTenant();

  const { data, isLoading } = useQuery({
    queryKey: ["bi_inventory", activeTenantId, dateRange],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // 1. Fetch all offerings
      const { data: products, error: pErr } = await supabase
        .from("core_entities")
        .select("id, display_name, metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null);
      
      if (pErr) throw pErr;

      // 2. Fetch sales orders in range
      let q = supabase
        .from("cases")
        .select(`
          id, title, created_at,
          journeys!inner(key)
        `)
        .eq("tenant_id", activeTenantId!)
        .eq("journeys.key", "sales_order");

      if (dateRange?.from) q = q.gte("created_at", dateRange.from.toISOString());
      if (dateRange?.to) {
        const endDay = new Date(dateRange.to);
        endDay.setHours(23, 59, 59, 999);
        q = q.lte("created_at", endDay.toISOString());
      }

      const { data: casesData, error: cErr } = await q;
      if (cErr) throw cErr;

      let allItems: any[] = [];
      if (casesData && casesData.length > 0) {
        const caseIds = casesData.map(c => c.id);
        const CHUNK_SIZE = 100;
        for (let i = 0; i < caseIds.length; i += CHUNK_SIZE) {
          const chunk = caseIds.slice(i, i + CHUNK_SIZE);
          const { data: iRes } = await supabase
            .from("case_items")
            .select("case_id, offering_entity_id, qty, total")
            .in("case_id", chunk);
          if (iRes) allItems.push(...iRes);
        }
      }

      return {
        products: products || [],
        cases: casesData || [],
        items: allItems
      };
    }
  });

  const {
    totalStock,
    totalProducts,
    totalItemsSold,
    topSoldProducts,
    topUnmovedProducts,
    topFrequentProducts
  } = useMemo(() => {
    if (!data) return {
      totalStock: 0, totalProducts: 0, totalItemsSold: 0,
      topSoldProducts: [], topUnmovedProducts: [], topFrequentProducts: []
    };

    let tStock = 0;
    const tProducts = data.products.length;
    let tItemsSold = 0;

    const prodMap = new Map<string, { id: string, name: string, stock: number, qtySold: number, revenue: number, orderSet: Set<string> }>();
    
    data.products.forEach(p => {
      const stock = Number((p.metadata as any)?.estoque_total || (p.metadata as any)?.estoque_loja || 0);
      tStock += stock;
      prodMap.set(p.id, { id: p.id, name: p.display_name, stock, qtySold: 0, revenue: 0, orderSet: new Set() });
    });

    data.items.forEach(i => {
      const qty = Number(i.qty || 0);
      const val = Number(i.total || 0);
      
      tItemsSold += qty;

      if (i.offering_entity_id && prodMap.has(i.offering_entity_id)) {
        const p = prodMap.get(i.offering_entity_id)!;
        p.qtySold += qty;
        p.revenue += val;
        p.orderSet.add(i.case_id);
      }
    });

    // Top 10 mais vendidos
    const topSoldProducts = Array.from(prodMap.values())
      .filter(p => p.qtySold > 0)
      .sort((a, b) => b.qtySold - a.qtySold)
      .slice(0, 10);

    // Top 10 sem movimentação (stock > 0, qtySold == 0)
    const topUnmovedProducts = Array.from(prodMap.values())
      .filter(p => p.stock > 0 && p.qtySold === 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);

    // Top 10 mais frequentes
    const topFrequentProducts = Array.from(prodMap.values())
      .filter(p => p.orderSet.size > 0)
      .sort((a, b) => b.orderSet.size - a.orderSet.size)
      .slice(0, 10);

    return {
      totalStock: tStock,
      totalProducts: tProducts,
      totalItemsSold: tItemsSold,
      topSoldProducts,
      topUnmovedProducts,
      topFrequentProducts
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard 
          title="Saldo de Estoque" 
          value={totalStock.toLocaleString("pt-BR")} 
          icon={Boxes} 
          trend={0} 
        />
        <KpiCard 
          title="Produtos/Serviços" 
          value={totalProducts.toLocaleString("pt-BR")} 
          icon={PackageSearch} 
          trend={0} 
        />
        <KpiCard 
          title="Itens Vendidos" 
          value={totalItemsSold.toLocaleString("pt-BR")} 
          icon={ShoppingCart} 
          trend={0} 
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Top 10 Mais Vendidos */}
        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4 flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
            <PackageOpen className="h-5 w-5" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top 10 Produtos Mais Vendidos</h3>
          </div>
          <div className="space-y-4">
            {topSoldProducts.length > 0 ? topSoldProducts.map((p, i) => (
              <div key={p.id} className="group relative flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {p.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {p.qtySold} un
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">Nenhuma venda registrada no período.</p>
            )}
          </div>
        </div>

        {/* Top 10 Sem Movimentação */}
        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4 flex items-center gap-2 text-rose-500">
            <Boxes className="h-5 w-5" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Top 10 Sem Movimentação</h3>
          </div>
          <div className="space-y-4">
            {topUnmovedProducts.length > 0 ? topUnmovedProducts.map((p, i) => (
              <div key={p.id} className="group relative flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-xs font-bold text-rose-500 dark:bg-rose-500/10">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {p.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {p.stock} em estoque
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">Nenhum produto sem movimentação.</p>
            )}
          </div>
        </div>

        {/* Top 10 Produtos Mais Frequentes */}
        <div className="col-span-1 rounded-2xl border border-slate-200/60 bg-white/60 p-6 shadow-sm backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/40">
          <div className="mb-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <ShoppingCart className="h-5 w-5" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Mais Frequentes (Pedidos)</h3>
          </div>
          <div className="space-y-4">
            {topFrequentProducts.length > 0 ? topFrequentProducts.map((p, i) => (
              <div key={p.id} className="group relative flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                    {p.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {p.orderSet.size} {p.orderSet.size === 1 ? "pedido" : "pedidos"}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-slate-500">Nenhuma venda registrada no período.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

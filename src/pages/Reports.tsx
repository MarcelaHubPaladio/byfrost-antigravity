import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  BarChart3, 
  Search, 
  User, 
  FileText,
  ChevronRight,
  TrendingUp,
  LayoutGrid,
  List
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type EntityWithContract = {
  id: string;
  display_name: string;
  contracts: {
    id: string;
    status: string;
    created_at: string;
  }[];
};

export default function Reports() {
  const { activeTenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const entitiesQ = useQuery({
    queryKey: ["reports_entities", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_commitments")
        .select(`
          id,
          status,
          commitment_type,
          created_at,
          customer:core_entities!commercial_commitments_customer_fk(id, display_name, metadata)
        `)
        .eq("commitment_type", "contract")
        .eq("status", "active")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Group by entity
      const entityMap: Record<string, EntityWithContract> = {};
      data?.forEach((c: any) => {
        if (!c.customer) return;
        const eid = c.customer.id;
        if (!entityMap[eid]) {
          entityMap[eid] = {
            id: eid,
            display_name: c.customer.display_name,
            contracts: []
          };
        }
        entityMap[eid].contracts.push({
          id: c.id,
          status: c.status,
          created_at: c.created_at
        });
      });

      return Object.values(entityMap);
    },
  });

  const filteredEntities = useMemo(() => {
    return (entitiesQ.data || []).filter(e => 
      e.display_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [entitiesQ.data, searchTerm]);

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.contracts">
        <AppShell>
          <div className="mx-auto max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="rounded-2xl bg-indigo-600/10 p-2 dark:bg-indigo-500/20">
                    <BarChart3 className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Central de Relatórios
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Acompanhe a performance e o histórico das entidades com contratos ativos.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-lg px-3 h-9 gap-2 transition-all",
                      viewMode === "grid" ? "bg-white shadow-sm dark:bg-slate-800 text-indigo-600" : "text-slate-500"
                    )}
                    onClick={() => setViewMode("grid")}
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">Grid</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "rounded-lg px-3 h-9 gap-2 transition-all",
                      viewMode === "list" ? "bg-white shadow-sm dark:bg-slate-800 text-indigo-600" : "text-slate-500"
                    )}
                    onClick={() => setViewMode("list")}
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">Lista</span>
                  </Button>
                </div>

                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Buscar entidade..."
                    className="pl-10 h-11 rounded-2xl border-slate-200 bg-white shadow-sm focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-950"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* List/Grid */}
            {entitiesQ.isLoading ? (
              <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed text-slate-400">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-500" />
                  <span>Carregando entidades...</span>
                </div>
              </div>
            ) : filteredEntities.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-12 text-center dark:border-slate-800 dark:bg-slate-950/50">
                <User className="mb-4 h-12 w-12 text-slate-300" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Nenhuma entidade ativa</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Apenas entidades com contratos em status "Ativo" aparecem aqui.
                </p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-6",
                viewMode === "grid" ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
              )}>
                {filteredEntities.map(entity => (
                  <EntityReportCard key={entity.id} entity={entity} viewMode={viewMode} />
                ))}
              </div>
            )}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

function EntityReportCard({ entity, viewMode }: { entity: EntityWithContract, viewMode: "grid" | "list" }) {
  if (viewMode === "list") {
    return (
      <Card className="p-4 flex items-center justify-between hover:border-indigo-500/50 transition-colors">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center dark:bg-slate-800">
            <User className="h-5 w-5 text-slate-500" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">{entity.display_name}</h3>
            <p className="text-xs text-slate-500">{entity.contracts.length} contrato(s) ativo(s)</p>
          </div>
        </div>
        <div className="flex gap-2">
          {entity.contracts.map(c => (
            <Link key={c.id} to={`/app/reports/${c.id}`}>
              <Button size="sm" variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Relatório #{c.id.slice(0, 4)}
              </Button>
            </Link>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="group overflow-hidden border-slate-200/60 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 dark:border-slate-800 dark:bg-slate-950">
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-indigo-50 flex items-center justify-center dark:bg-indigo-500/10 transition-colors group-hover:bg-indigo-100">
            <User className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white leading-tight group-hover:text-indigo-600 transition-colors">
              {entity.display_name}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{entity.contracts.length} contrato(s) ativo(s)</p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contratos Ativos</p>
          {entity.contracts.map(c => (
            <Link 
              key={c.id} 
              to={`/app/reports/${c.id}`}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 dark:bg-slate-900 dark:hover:bg-indigo-500/10 transition-all border border-transparent hover:border-indigo-100 group/item"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-400 group-hover/item:text-indigo-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">#{c.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-2 text-indigo-600">
                <span className="text-[10px] font-bold uppercase">Ver Relatório</span>
                <ChevronRight className="h-4 w-4 transition-transform group-hover/item:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}

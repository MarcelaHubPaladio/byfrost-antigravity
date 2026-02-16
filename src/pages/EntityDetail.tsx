import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityTimeline } from "@/components/core/EntityTimeline";

type EntityRow = {
  id: string;
  tenant_id: string;
  entity_type: string;
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export default function EntityDetail() {
  const { id } = useParams();
  const entityId = String(id ?? "");
  const { activeTenantId } = useTenant();

  const entityQ = useQuery({
    queryKey: ["entity", activeTenantId, entityId],
    enabled: Boolean(activeTenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,tenant_id,entity_type,subtype,display_name,status,metadata,created_at,updated_at")
        .eq("tenant_id", activeTenantId!)
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("entity_not_found");
      return data as EntityRow;
    },
    staleTime: 5_000,
  });

  const commitmentCountQ = useQuery({
    queryKey: ["entity_commitments_count", activeTenantId, entityId],
    enabled: Boolean(activeTenantId && entityId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("commercial_commitments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", activeTenantId!)
        .eq("customer_entity_id", entityId)
        .is("deleted_at", null);
      if (error) throw error;
      return Number(count ?? 0);
    },
    staleTime: 10_000,
  });

  const title = useMemo(() => {
    if (entityQ.isLoading) return "Entidade";
    return entityQ.data?.display_name ?? "Entidade";
  }, [entityQ.isLoading, entityQ.data?.display_name]);

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.entities">
        <AppShell>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-bold text-slate-900">{title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <Badge variant="secondary">{entityQ.data?.entity_type ?? "—"}</Badge>
                  {entityQ.data?.subtype ? <Badge variant="outline">{entityQ.data.subtype}</Badge> : null}
                  {entityQ.data?.status ? <Badge variant="outline">{entityQ.data.status}</Badge> : null}
                  <span className="text-xs text-slate-500">id: {entityId}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/app/entities"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Voltar
                </Link>
                <Link
                  to={`/app/commitments?customer=${encodeURIComponent(entityId)}`}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Novo compromisso
                </Link>
              </div>
            </div>

            {entityQ.isError ? (
              <Card className="rounded-2xl border-slate-200 p-4 text-sm text-slate-700">Entidade não encontrada.</Card>
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList>
                  <TabsTrigger value="overview">Visão geral</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card className="rounded-2xl border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">Dados</div>
                      <div className="mt-2 text-xs text-slate-600">created_at: {entityQ.data?.created_at ?? "—"}</div>
                      <div className="text-xs text-slate-600">updated_at: {entityQ.data?.updated_at ?? "—"}</div>
                      <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                        <div className="mb-2 text-xs font-semibold text-slate-700">metadata</div>
                        <pre className="max-h-[320px] overflow-auto text-xs text-slate-800">
                          {JSON.stringify(entityQ.data?.metadata ?? {}, null, 2)}
                        </pre>
                      </div>
                    </Card>

                    <Card className="rounded-2xl border-slate-200 p-4">
                      <div className="text-sm font-semibold text-slate-900">Vínculos</div>
                      <div className="mt-2 text-sm text-slate-700">
                        Compromissos como cliente: <span className="font-semibold">{commitmentCountQ.data ?? 0}</span>
                      </div>
                      <div className="mt-4 text-xs text-slate-600">
                        Esta tela é propositalmente simples. A governança e trilhas ficam na timeline.
                      </div>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="timeline">
                  {activeTenantId ? <EntityTimeline tenantId={activeTenantId} entityId={entityId} /> : null}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { EntityUpsertDialog } from "@/components/core/EntityUpsertDialog";
import { ConfirmDeleteDialog } from "@/components/core/ConfirmDeleteDialog";
import { showError, showSuccess } from "@/utils/toast";
import { Pencil, Trash2 } from "lucide-react";
import { PartyCustomerEditorCard } from "@/components/core/PartyCustomerEditorCard";
import { PartyProposalCard } from "@/components/core/PartyProposalCard";
import { EntityHistory } from "@/components/core/EntityHistory";

type EntityRow = {
  id: string;
  tenant_id: string;
  entity_type: "party" | "offering";
  subtype: string | null;
  display_name: string;
  status: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export default function EntityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const entityId = String(id ?? "");
  const { activeTenantId, activeTenant } = useTenant();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const onDelete = async () => {
    if (!activeTenantId) return;
    if (!entityId) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("core_entities")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("id", entityId)
        .is("deleted_at", null);
      if (error) throw error;

      showSuccess("Entidade excluída.");
      await qc.invalidateQueries({ queryKey: ["entities"] });
      await qc.invalidateQueries({ queryKey: ["entity"] });
      nav("/app/entities");
    } catch (e: any) {
      showError(e?.message ?? "Erro ao excluir entidade");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.entities">
        <AppShell>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">{title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                  <Badge variant="secondary">{entityQ.data?.entity_type ?? "—"}</Badge>
                  {entityQ.data?.subtype ? <Badge variant="outline">{entityQ.data.subtype}</Badge> : null}
                  {entityQ.data?.status ? <Badge variant="outline">{entityQ.data.status}</Badge> : null}
                  <span className="text-xs text-slate-500">id: {entityId}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => nav("/app/entities")}>
                  Voltar
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setEditOpen(true)}
                  disabled={entityQ.isLoading || entityQ.isError}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                  onClick={() => setDeleteOpen(true)}
                  disabled={entityQ.isLoading || entityQ.isError}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Excluir
                </Button>
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
                  {entityQ.data?.entity_type === "party" ? <TabsTrigger value="customer">Cliente</TabsTrigger> : null}
                  {entityQ.data?.entity_type === "party" ? <TabsTrigger value="proposal">Proposta</TabsTrigger> : null}
                  <TabsTrigger value="timeline">Linha do tempo</TabsTrigger>
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

                {entityQ.data?.entity_type === "party" ? (
                  <TabsContent value="customer">
                    {activeTenantId && entityQ.data ? (
                      <PartyCustomerEditorCard
                        tenantId={activeTenantId}
                        partyId={entityId}
                        initialDisplayName={entityQ.data.display_name}
                        initialMetadata={entityQ.data.metadata ?? {}}
                        onUpdated={() => {
                          qc.invalidateQueries({ queryKey: ["entity", activeTenantId, entityId] });
                        }}
                      />
                    ) : null}
                  </TabsContent>
                ) : null}

                {entityQ.data?.entity_type === "party" ? (
                  <TabsContent value="proposal">
                    {activeTenantId && entityQ.data ? (
                      <PartyProposalCard
                        tenantId={activeTenantId}
                        partyId={entityId}
                        tenantSlug={String(activeTenant?.slug ?? "tenant")}
                      />
                    ) : null}
                  </TabsContent>
                ) : null}

                <TabsContent value="timeline">
                  {activeTenantId ? <EntityHistory tenantId={activeTenantId} entityId={entityId} /> : null}
                </TabsContent>
              </Tabs>
            )}

            {activeTenantId && entityQ.data ? (
              <EntityUpsertDialog
                open={editOpen}
                onOpenChange={setEditOpen}
                tenantId={activeTenantId}
                initial={entityQ.data}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["entity", activeTenantId, entityId] });
                }}
              />
            ) : null}

            <ConfirmDeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              title="Excluir entidade"
              description="Esta ação faz soft delete. Você pode reverter via banco."
              confirmText={deleting ? "Excluindo…" : "Excluir"}
              confirmDisabled={deleting}
              onConfirm={onDelete}
            />
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
import { EntityFinanceTab } from "@/components/finance/EntityFinanceTab";
import { isTvCorporativaEnabled } from "@/components/RequireTvCorporativaEnabled";
import { EntityTvCorporativaTab } from "@/components/entities/EntityTvCorporativaTab";
import { EntitySalesOrdersTab } from "@/components/entities/EntitySalesOrdersTab";
import { EntityReceiptsTab } from "@/components/entities/EntityReceiptsTab";
import { EntityMediaKitTab } from "@/components/entities/EntityMediaKitTab";
import { RoomPhotoManager } from "@/components/entities/RoomPhotoManager";
import { EntityEditTab } from "@/components/entities/EntityEditTab";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { divIcon } from "leaflet";

// react-leaflet v5 typings workaround
const RLMapContainer = MapContainer as any;
const RLTileLayer = TileLayer as any;
const RLMarker = Marker as any;

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
  legacy_id?: string;
  internal_code?: string;
  location_json?: any;
  business_type?: string;
  property_type?: string;
  total_area?: number;
  useful_area?: number;
};

export default function EntityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const entityId = String(id ?? "");
  const { activeTenantId, activeTenant } = useTenant();

  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("overview");

  // Sync tab from URL if present
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t) setActiveTab(t);
  }, [searchParams]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const tvCorporativaEnabled = useMemo(() => isTvCorporativaEnabled(activeTenant?.modules_json), [activeTenant?.modules_json]);
  const mediaKitEnabled = useMemo(() => Boolean(activeTenant?.modules_json?.media_kit_enabled), [activeTenant?.modules_json]);

  const entityQ = useQuery({
    queryKey: ["entity", activeTenantId, entityId],
    enabled: Boolean(activeTenantId && entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,tenant_id,entity_type,subtype,display_name,status,metadata,created_at,updated_at,legacy_id,internal_code,location_json,business_type,property_type,total_area,useful_area")
        .eq("tenant_id", activeTenantId!)
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("entity_not_found");

      const { data: tagsData } = await supabase.from("core_entity_tags").select("tag").eq("entity_id", entityId).eq("tenant_id", activeTenantId!);
      
      return { ...data, tags: (tagsData || []).map(r => r.tag) } as EntityRow & { tags: string[] };
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
                  {entityQ.data?.internal_code && (
                    <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 font-mono">#{entityQ.data.internal_code}</Badge>
                  )}
                  {(entityQ.data as any)?.tags?.map((t: string) => (
                    <Badge key={t} variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 uppercase text-[10px] font-bold">{t}</Badge>
                  ))}
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
                  onClick={() => setActiveTab("edit")}
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="overflow-x-auto pb-1 mb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TabsList className="bg-slate-100/50 p-1.5 rounded-2xl h-auto flex-nowrap w-max sm:w-fit sm:mx-auto">
                    <TabsTrigger value="overview" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Visão geral</TabsTrigger>
                    <TabsTrigger value="edit" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Editar</TabsTrigger>
                    {entityQ.data?.entity_type === "party" ? <TabsTrigger value="customer" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Cliente</TabsTrigger> : null}
                    {entityQ.data?.entity_type === "party" ? <TabsTrigger value="proposal" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Proposta</TabsTrigger> : null}
                    {entityQ.data?.entity_type === "party" ? <TabsTrigger value="orders" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Pedidos</TabsTrigger> : null}
                    {tvCorporativaEnabled ? <TabsTrigger value="tv_corporativa" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">TV Corporativa</TabsTrigger> : null}
                    {mediaKitEnabled ? <TabsTrigger value="media_kit" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Mídia Kit</TabsTrigger> : null}
                    {entityQ.data?.subtype === "imovel" ? <TabsTrigger value="photos" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Fotos</TabsTrigger> : null}
                    {entityQ.data?.entity_type === "party" ? <TabsTrigger value="receipts" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Recibos</TabsTrigger> : null}
                    <TabsTrigger value="finance" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Financeiro</TabsTrigger>
                    <TabsTrigger value="timeline" className="rounded-xl px-4 py-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">Linha do tempo</TabsTrigger>
                  </TabsList>
                </div>

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
                      
                      {entityQ.data?.subtype === "imovel" && (
                        <div className="mt-4 pt-4 border-t space-y-3">
                          <div className="text-xs font-bold text-slate-400 uppercase">Localização</div>
                          {Number.isFinite(entityQ.data.location_json?.lat) && Number.isFinite(entityQ.data.location_json?.lng) ? (
                            <div className="space-y-2">
                              <div className="text-sm text-slate-700 font-medium">{entityQ.data.location_json.address || "Endereço não informado"}</div>
                              <div className="h-40 rounded-xl overflow-hidden border border-slate-200">
                                <RLMapContainer 
                                  center={[entityQ.data.location_json.lat, entityQ.data.location_json.lng]} 
                                  zoom={15} 
                                  scrollWheelZoom={false}
                                  dragging={false}
                                  zoomControl={false}
                                  className="h-full w-full"
                                  attributionControl={false}
                                >
                                  <RLTileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                  <RLMarker position={[entityQ.data.location_json.lat, entityQ.data.location_json.lng]} />
                                </RLMapContainer>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-slate-400 italic">Nenhuma localização salva.</div>
                          )}

                          <div className="grid grid-cols-2 gap-4 pt-2">
                             <div>
                               <div className="text-[10px] text-slate-400 uppercase font-bold">Tipo Negócio</div>
                               <div className="text-sm font-semibold text-slate-700 capitalize">
                                 {entityQ.data.business_type === 'sale' ? 'Venda' : entityQ.data.business_type === 'rent' ? 'Aluguel' : 'Venda/Aluguel'}
                               </div>
                             </div>
                             <div>
                               <div className="text-[10px] text-slate-400 uppercase font-bold">Preço</div>
                               <div className="text-sm font-bold text-indigo-600">
                                 {entityQ.data.metadata?.price_consult ? (
                                   <span className="italic text-indigo-500">Sob Consulta</span>
                                 ) : entityQ.data.metadata?.price_sale ? (
                                   new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entityQ.data.metadata.price_sale)
                                 ) : (
                                   "—"
                                 )}
                               </div>
                             </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                             <div>
                               <div className="text-[10px] text-slate-400 uppercase font-bold">Tipo</div>
                               <div className="text-sm font-semibold text-slate-700 capitalize">
                                 {entityQ.data.property_type || "—"}
                               </div>
                             </div>
                             <div>
                               <div className="text-[10px] text-slate-400 uppercase font-bold">Área Total</div>
                               <div className="text-sm font-semibold text-slate-700">
                                 {entityQ.data.total_area ? `${entityQ.data.total_area} m²` : "—"}
                               </div>
                             </div>
                             <div>
                               <div className="text-[10px] text-slate-400 uppercase font-bold">Área Útil</div>
                               <div className="text-sm font-semibold text-slate-700">
                                 {entityQ.data.useful_area ? `${entityQ.data.useful_area} m²` : "—"}
                               </div>
                             </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 text-xs text-slate-600">
                        Esta tela é propositalmente simples. A governança e trilhas ficam na timeline.
                      </div>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="edit">
                  {activeTenantId && entityQ.data ? (
                    <EntityEditTab 
                       tenantId={activeTenantId} 
                       entity={entityQ.data} 
                       onSaved={() => setActiveTab("overview")}
                    />
                  ) : null}
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

                {entityQ.data?.entity_type === "party" ? (
                  <TabsContent value="orders">
                    {activeTenantId && entityQ.data ? (
                      <EntitySalesOrdersTab tenantId={activeTenantId} entityId={entityId} />
                    ) : null}
                  </TabsContent>
                ) : null}

                {tvCorporativaEnabled ? (
                  <TabsContent value="tv_corporativa">
                    {activeTenantId && entityQ.data ? (
                      <EntityTvCorporativaTab tenantId={activeTenantId} entityId={entityId} />
                    ) : null}
                  </TabsContent>
                ) : null}

                {mediaKitEnabled ? (
                  <TabsContent value="media_kit">
                    {activeTenantId && entityQ.data ? (
                      <EntityMediaKitTab tenantId={activeTenantId} entityId={entityId} />
                    ) : null}
                  </TabsContent>
                ) : null}

                {entityQ.data?.subtype === "imovel" ? (
                  <TabsContent value="photos">
                    {activeTenantId && entityQ.data ? (
                      <RoomPhotoManager tenantId={activeTenantId} entityId={entityId} />
                    ) : null}
                  </TabsContent>
                ) : null}

                {entityQ.data?.entity_type === "party" ? (
                  <TabsContent value="receipts">
                    {activeTenantId ? (
                      <EntityReceiptsTab tenantId={activeTenantId} partyId={entityId} />
                    ) : null}
                  </TabsContent>
                ) : null}

                <TabsContent value="finance">
                  {activeTenantId ? <EntityFinanceTab tenantId={activeTenantId} entityId={entityId} /> : null}
                </TabsContent>

                <TabsContent value="timeline">
                  {activeTenantId ? <EntityHistory tenantId={activeTenantId} entityId={entityId} /> : null}
                </TabsContent>
              </Tabs>
            )}


            <ConfirmDeleteDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              title="Excluir entidade"
              description="Esta ação faz soft delete. Você pode reverter via banco."
              confirmLabel={deleting ? "Excluindo…" : "Excluir"}
              disabled={deleting}
              onConfirm={onDelete}
            />
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
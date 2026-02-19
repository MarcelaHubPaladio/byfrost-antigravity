import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/core/ConfirmDeleteDialog";
import { DeliverableTemplateUpsertDialog } from "@/components/core/DeliverableTemplateUpsertDialog";
import { showError, showSuccess } from "@/utils/toast";
import { Pencil, Plus, Trash2 } from "lucide-react";

type OfferingRow = {
  id: string;
  display_name: string;
  subtype: string | null;
};

type TemplateRow = {
  id: string;
  tenant_id: string;
  offering_entity_id: string;
  name: string;
  estimated_minutes: number | null;
  quantity: number;
  required_resource_type: string | null;
  created_at: string;
  deleted_at: string | null;
};

export default function DeliverableTemplates() {
  const { activeTenantId } = useTenant();
  const nav = useNavigate();
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [offeringId, setOfferingId] = useState<string>("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingRow, setDeletingRow] = useState<TemplateRow | null>(null);

  const offeringsQ = useQuery({
    queryKey: ["offerings", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id,display_name,subtype")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "offering")
        .is("deleted_at", null)
        .order("display_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as OfferingRow[];
    },
    staleTime: 10_000,
  });

  const offerings = offeringsQ.data ?? [];
  const offeringMap = useMemo(() => new Map(offerings.map((o) => [o.id, o])), [offerings]);

  const templatesQ = useQuery({
    queryKey: ["deliverable_templates", activeTenantId, offeringId, q],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let query = supabase
        .from("deliverable_templates")
        .select(
          "id,tenant_id,offering_entity_id,name,estimated_minutes,quantity,required_resource_type,created_at,deleted_at"
        )
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(500);

      if (offeringId !== "all") {
        query = query.eq("offering_entity_id", offeringId);
      }

      const term = q.trim();
      if (term.length >= 2) {
        query = query.ilike("name", `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
    staleTime: 5_000,
  });

  const rows = templatesQ.data ?? [];

  const header = useMemo(() => {
    const suffix = activeTenantId ? `(${rows.length})` : "";
    return `Templates de entregáveis ${suffix}`.trim();
  }, [activeTenantId, rows.length]);

  const onDelete = async () => {
    if (!activeTenantId || !deletingRow) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("deliverable_templates")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("id", deletingRow.id)
        .is("deleted_at", null);
      if (error) throw error;

      showSuccess("Template removido.");
      await qc.invalidateQueries({ queryKey: ["deliverable_templates"] });
    } catch (e: any) {
      showError(e?.message ?? "Erro ao remover template");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
      setDeletingRow(null);
    }
  };

  return (
    <RequireAuth>
      {/* Reutilizando a permissão de entidades (Core) */}
      <RequireRouteAccess routeKey="app.entities">
        <AppShell>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">{header}</div>
                <div className="text-sm text-slate-600">
                  Catálogo por offering. Esses templates são usados para gerar deliverables em compromissos.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => nav("/app/entities")}
                >
                  Voltar
                </Button>
                <Button className="rounded-xl" onClick={() => setCreateOpen(true)} disabled={!activeTenantId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo template
                </Button>
              </div>
            </div>

            <Card className="rounded-2xl border-slate-200 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Buscar por nome… (min 2)"
                    className="sm:w-[320px]"
                  />

                  <Select value={offeringId} onValueChange={setOfferingId}>
                    <SelectTrigger className="rounded-xl sm:w-[320px]">
                      <SelectValue placeholder="Filtrar por offering…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os offerings</SelectItem>
                      {offerings.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.display_name}
                          {o.subtype ? ` (${o.subtype})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-xs text-slate-600">
                  <Badge variant="secondary">tenant</Badge> {activeTenantId ?? "—"}
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border-slate-200 p-0">
              <div className="divide-y">
                {templatesQ.isLoading || offeringsQ.isLoading ? (
                  <div className="p-4 text-sm text-slate-600">Carregando…</div>
                ) : rows.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">Nenhum template encontrado.</div>
                ) : (
                  rows.map((t) => {
                    const off = offeringMap.get(t.offering_entity_id);
                    return (
                      <div key={t.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate font-semibold text-slate-900">{t.name}</div>
                            {t.required_resource_type ? (
                              <Badge variant="outline">{t.required_resource_type}</Badge>
                            ) : null}
                          </div>

                          <div className="mt-1 text-xs text-slate-600">
                            Offering: <span className="font-semibold">{off?.display_name ?? t.offering_entity_id}</span>
                            {off?.subtype ? ` • ${off.subtype}` : ""}
                            {t.estimated_minutes !== null && t.estimated_minutes !== undefined
                              ? ` • ${t.estimated_minutes} min`
                              : ""}
                            {t.quantity !== undefined && t.quantity !== 1
                              ? ` • qtd ${t.quantity}`
                              : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            onClick={() => {
                              setEditing(t);
                              setEditOpen(true);
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-xl border-red-200 text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setDeletingRow(t);
                              setDeleteOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {activeTenantId ? (
              <DeliverableTemplateUpsertDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                tenantId={activeTenantId}
                offerings={offerings}
                initial={null}
                defaultOfferingId={offeringId !== "all" ? offeringId : null}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["deliverable_templates"] });
                }}
              />
            ) : null}

            {activeTenantId ? (
              <DeliverableTemplateUpsertDialog
                open={editOpen}
                onOpenChange={(v) => {
                  setEditOpen(v);
                  if (!v) setEditing(null);
                }}
                tenantId={activeTenantId}
                offerings={offerings}
                initial={editing}
                defaultOfferingId={null}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["deliverable_templates"] });
                }}
              />
            ) : null}

            <ConfirmDeleteDialog
              open={deleteOpen}
              onOpenChange={(v) => {
                setDeleteOpen(v);
                if (!v) setDeletingRow(null);
              }}
              title="Remover template?"
              description="Isso fará soft delete (deleted_at). Instâncias futuras não serão geradas a partir deste template."
              confirmLabel={deleting ? "Removendo…" : "Remover"}
              onConfirm={onDelete}
              disabled={deleting}
            />
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

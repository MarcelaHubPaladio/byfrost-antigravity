import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { EntityUpsertDialog } from "@/components/core/EntityUpsertDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type EntityRow = {
  id: string;
  entity_type: string;
  subtype: string | null;
  display_name: string;
  status: string | null;
  updated_at: string;
  metadata?: any;
};

type EntityTypeFilter = "all" | "party" | "offering";

export default function Entities() {
  const { activeTenantId } = useTenant();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityTypeFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ["entities", activeTenantId, q, typeFilter],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      let base = supabase
        .from("core_entities")
        .select("id,entity_type,subtype,display_name,status,updated_at,metadata")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(200);

      if (typeFilter !== "all") {
        base = base.eq("entity_type", typeFilter);
      }

      const term = q.trim();
      const { data, error } = term.length >= 2 ? await base.ilike("display_name", `%${term}%`) : await base;
      if (error) throw error;
      return (data ?? []) as EntityRow[];
    },
    staleTime: 5_000,
  });

  const rows = listQ.data ?? [];

  const header = useMemo(() => {
    if (!activeTenantId) return "Selecione um tenant";
    return `Entidades (${rows.length})`;
  }, [activeTenantId, rows.length]);

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.entities">
        <AppShell>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xl font-bold text-slate-900">{header}</div>
                <div className="text-sm text-slate-600">Busca simples de party/offering.</div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nome… (min 2)"
                  className="sm:w-[260px]"
                />

                <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as EntityTypeFilter)}>
                  <SelectTrigger className="rounded-xl sm:w-[200px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="party">Party</SelectItem>
                    <SelectItem value="offering">Offering</SelectItem>
                  </SelectContent>
                </Select>

                <Button className="rounded-xl" onClick={() => setCreateOpen(true)} disabled={!activeTenantId}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova
                </Button>
              </div>
            </div>

            <Card className="rounded-2xl border-slate-200 p-0">
              <div className="divide-y">
                {listQ.isLoading ? (
                  <div className="p-4 text-sm text-slate-600">Carregando…</div>
                ) : rows.length === 0 ? (
                  <div className="p-4 text-sm text-slate-600">Nenhuma entidade encontrada.</div>
                ) : (
                  rows.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => nav(`/app/entities/${e.id}`)}
                      className="block w-full px-4 py-3 text-left hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-900">{e.display_name}</div>
                          <div className="text-xs text-slate-600">
                            {e.entity_type}
                            {e.subtype ? ` • ${e.subtype}` : ""}
                            {e.status ? ` • ${e.status}` : ""}
                          </div>
                        </div>
                        <Badge variant="secondary">{e.entity_type}</Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>

            {activeTenantId ? (
              <EntityUpsertDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                tenantId={activeTenantId}
                initial={null}
                onSaved={(id) => nav(`/app/entities/${id}`)}
              />
            ) : null}
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}
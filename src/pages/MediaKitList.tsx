import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireRouteAccess } from "@/components/RequireRouteAccess";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Pencil, Image as ImageIcon, Settings, Layout } from "lucide-react";
import { showSuccess, showError } from "@/utils/toast";
import { Badge } from "@/components/ui/badge";

type MediaKit = {
  id: string;
  name: string;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
  entities: {
    display_name: string;
  } | null;
};

export default function MediaKitList() {
  const { activeTenantId } = useTenant();
  const nav = useNavigate();
  const qc = useQueryClient();

  const kitsQ = useQuery({
    queryKey: ["media_kits", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("media_kits")
        .select("id, name, entity_id, created_at, updated_at, entities:core_entities(display_name)")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      
      return (data as any[]).map(kit => ({
        ...kit,
        entities: Array.isArray(kit.entities) ? kit.entities[0] : kit.entities
      })) as MediaKit[];
    },
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_kits")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("tenant_id", activeTenantId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["media_kits"] });
      showSuccess("Mídia Kit removido");
    },
    onError: (err: any) => showError(err.message),
  });

  return (
    <RequireAuth>
      <RequireRouteAccess routeKey="app.media_kit">
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Mídia Kits</h1>
                <p className="text-slate-500">Gerencie suas artes e campanhas visuais.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => nav("/app/media-kit/masks")} className="rounded-xl border-purple-200 text-purple-700 hover:bg-purple-50">
                  <Layout className="mr-2 h-4 w-4" />
                  Gerenciar Máscaras
                </Button>
                <Button variant="outline" onClick={() => nav("/app/media-kit/templates")} className="rounded-xl">
                  <Settings className="mr-2 h-4 w-4" />
                  Gerenciar Tamanhos
                </Button>
                <Button onClick={() => nav("/app/media-kit/editor/new")} className="rounded-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Novo Kit
                </Button>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {kitsQ.data?.map((kit) => (
                <Card key={kit.id} className="group overflow-hidden rounded-2xl border-slate-200 transition hover:border-blue-200 hover:shadow-lg">
                  <div className="aspect-[16/9] bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-50 transition">
                    <ImageIcon className="h-12 w-12" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">{kit.name}</h3>
                        <div className="mt-1 flex items-center gap-2">
                          {kit.entities ? (
                            <Badge variant="outline" className="text-[10px]">{kit.entities.display_name}</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Sem Entidade</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => nav(`/app/media-kit/editor/${kit.id}`)} className="h-8 w-8 rounded-full">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteM.mutate(kit.id)} className="h-8 w-8 rounded-full text-red-500 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 text-[11px] text-slate-400">
                      Atualizado em {new Date(kit.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </Card>
              ))}
              {kitsQ.data?.length === 0 && (
                <div className="col-span-full py-20 text-center">
                   <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                     <ImageIcon className="h-8 w-8" />
                   </div>
                   <h3 className="mt-4 font-semibold text-slate-900">Nenhum Mídia Kit</h3>
                   <p className="mt-1 text-slate-500">Comece criando sua primeira arte integrada.</p>
                   <Button onClick={() => nav("/app/media-kit/editor/new")} className="mt-6 rounded-xl">
                    Criar meu primeiro Kit
                   </Button>
                </div>
              )}
            </div>
          </div>
        </AppShell>
      </RequireRouteAccess>
    </RequireAuth>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { Loader2, Trash2, Edit2, Plus, Users, UserPlus } from "lucide-react";
import { useTenant } from "@/providers/TenantProvider";

type Projetista = {
  id: string;
  display_name: string;
  metadata: {
    whatsapp?: string;
  } | null;
};

export function ProjetistasManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();

  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const projetistasQ = useQuery({
    queryKey: ["projetistas", activeTenantId],
    enabled: Boolean(activeTenantId) && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, metadata")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "projetista")
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Projetista[];
    },
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("O nome é obrigatório");
      
      const payload = {
        tenant_id: activeTenantId!,
        entity_type: "projetista",
        display_name: name.trim(),
        metadata: { whatsapp: whatsapp.trim() }
      };

      if (isEditing) {
        const { error } = await supabase.from("core_entities").update(payload).eq("id", isEditing);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("core_entities").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccess(isEditing ? "Projetista atualizado!" : "Projetista criado!");
      setName("");
      setWhatsapp("");
      setIsEditing(null);
      qc.invalidateQueries({ queryKey: ["projetistas"] });
    },
    onError: (e: any) => showError(e.message || "Falha ao salvar"),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Tem certeza que deseja excluir?")) return;
      const { error } = await supabase.from("core_entities").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Projetista excluído!");
      qc.invalidateQueries({ queryKey: ["projetistas"] });
    },
    onError: (e: any) => showError("Falha ao excluir"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] gap-0 p-0 overflow-hidden rounded-[32px]">
        <div className="bg-slate-50 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 shadow-sm">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-black text-slate-800">Gerenciar Projetistas</DialogTitle>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-0.5">
                {projetistasQ.data?.length ?? 0} cadastrados
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="grid gap-4 bg-slate-50/50 p-4 rounded-[24px] border border-slate-100 mb-6">
            <div className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              {isEditing ? "Editar Projetista" : "Novo Projetista"}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do projetista"
                  className="mt-1.5 h-10 rounded-2xl"
                />
              </div>
              <div>
                <Label className="text-xs">WhatsApp</Label>
                <Input
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="mt-1.5 h-10 rounded-2xl"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-2">
              {isEditing && (
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => { setIsEditing(null); setName(""); setWhatsapp(""); }}
                  className="rounded-2xl"
                >
                  Cancelar
                </Button>
              )}
              <Button 
                type="button" 
                onClick={() => saveM.mutate()} 
                disabled={saveM.isPending}
                className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 shadow-sm px-6 font-bold"
              >
                {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Salvar alterações" : "Adicionar Projetista"}
              </Button>
            </div>
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
            {projetistasQ.isLoading && <div className="text-center p-4 text-slate-400"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>}
            
            {projetistasQ.data?.length === 0 && !projetistasQ.isLoading && (
              <div className="text-center p-6 text-slate-500 text-sm border border-dashed rounded-[24px] bg-slate-50/50">
                Nenhum projetista cadastrado.
              </div>
            )}

            {projetistasQ.data?.map(p => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-[20px] border border-slate-100 bg-white hover:border-slate-300 transition-colors group">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{p.display_name}</div>
                  <div className="text-xs text-slate-500">{p.metadata?.whatsapp || "Sem WhatsApp"}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl"
                    onClick={() => {
                      setIsEditing(p.id);
                      setName(p.display_name);
                      setWhatsapp(p.metadata?.whatsapp || "");
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                    onClick={() => deleteM.mutate(p.id)}
                    disabled={deleteM.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

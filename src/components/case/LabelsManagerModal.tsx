import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tags, Trash2, Edit2, Plus, Loader2, Check, X } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function LabelsManagerModal({ activeTenantId, open, onOpenChange }: { activeTenantId: string | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("#E2E8F0");
  const [isCreating, setIsCreating] = useState(false);

  const labelsQ = useQuery({
    queryKey: ["crm_labels", activeTenantId],
    enabled: !!activeTenantId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_labels")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    }
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (isCreating) {
        const { error } = await supabase.from("crm_labels").insert({
          tenant_id: activeTenantId!,
          name: editName,
          color: editColor
        });
        if (error) throw error;
      } else if (editingId) {
        const { error } = await supabase.from("crm_labels")
          .update({ name: editName, color: editColor })
          .eq("id", editingId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_labels"] });
      qc.invalidateQueries({ queryKey: ["beeia_cases"] });
      setEditingId(null);
      setIsCreating(false);
      showSuccess("Etiqueta salva!");
    },
    onError: (err: any) => showError("Erro ao salvar", err)
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_labels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_labels"] });
      qc.invalidateQueries({ queryKey: ["case_labels"] });
      qc.invalidateQueries({ queryKey: ["beeia_cases"] });
      showSuccess("Etiqueta removida!");
    },
    onError: (err: any) => showError("Erro ao remover", err)
  });

  const startEdit = (lbl: any) => {
    setEditingId(lbl.id);
    setEditName(lbl.name);
    setEditColor(lbl.color);
    setIsCreating(false);
  };

  const startCreate = () => {
    setEditingId(null);
    setEditName("");
    setEditColor("#3b82f6");
    setIsCreating(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="w-5 h-5 text-indigo-500" />
            Gerenciar Etiquetas
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 min-h-[250px] max-h-[60vh] overflow-y-auto custom-scrollbar pr-2 mt-2">
          {labelsQ.isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
          ) : (
            <>
              {labelsQ.data?.map(lbl => (
                <div key={lbl.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-100 bg-slate-50 dark:bg-slate-900 dark:border-slate-800">
                  {editingId === lbl.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <Input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-10 h-8 p-0 cursor-pointer border-0" />
                      <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 flex-1" autoFocus />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={cancelEdit} disabled={saveM.isPending}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: lbl.color }} />
                        <span className="text-sm font-medium">{lbl.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => startEdit(lbl)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => {
                          if (confirm("Remover esta etiqueta permanentemente?")) {
                            deleteM.mutate(lbl.id);
                          }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              
              {isCreating && (
                <div className="flex items-center gap-2 p-2 rounded-lg border border-indigo-100 bg-indigo-50/50 dark:bg-indigo-900/10 dark:border-indigo-800">
                  <Input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-10 h-8 p-0 cursor-pointer border-0" />
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 flex-1" placeholder="Nova etiqueta" autoFocus />
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-slate-400" onClick={cancelEdit} disabled={saveM.isPending}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {!isCreating && !editingId && (
                <Button variant="outline" className="w-full mt-2 border-dashed" onClick={startCreate}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Etiqueta
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

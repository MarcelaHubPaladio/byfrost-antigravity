import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Pencil, Loader2, Save } from "lucide-react";
import { showError, showSuccess } from "@/utils/toast";

export function RoomTypeManager({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const roomsQ = useQuery({
    queryKey: ["room_types", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_property_room_types")
        .select("*")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      setSaving(true);
      if (id) {
        const { error } = await supabase
          .from("core_property_room_types")
          .update({ name })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("core_property_room_types")
          .insert({ tenant_id: tenantId, name });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccess("Cômodo salvo!");
      qc.invalidateQueries({ queryKey: ["room_types"] });
      setEditingId(null);
      setNewName("");
      setSaving(false);
    },
    onError: (e: any) => {
      showError(e.message || "Erro ao salvar");
      setSaving(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("core_property_room_types")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Cômodo removido.");
      qc.invalidateQueries({ queryKey: ["room_types"] });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gerenciar Cômodos</DialogTitle>
          <p className="text-xs text-slate-500">Adicione ou edite as categorias de fotos dos imóveis.</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex gap-2">
            <Input 
              placeholder="Novo cômodo (ex: Academia, Escritório)" 
              value={editingId ? "" : newName} 
              onChange={e => !editingId && setNewName(e.target.value)}
              disabled={!!editingId || saving}
              className="rounded-xl"
            />
            <Button 
               disabled={!newName.trim() || !!editingId || saving} 
               onClick={() => saveMutation.mutate({ name: newName })}
               className="rounded-xl"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {roomsQ.data?.map(room => (
              <div key={room.id} className="flex items-center gap-2 p-3 rounded-2xl border border-slate-100 bg-slate-50/50 group">
                {editingId === room.id ? (
                  <Input 
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    className="flex-1 h-8 rounded-lg text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveMutation.mutate({ id: room.id, name: newName });
                      if (e.key === 'Escape') { setEditingId(null); setNewName(""); }
                    }}
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium text-slate-700">{room.name}</span>
                )}
                
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editingId === room.id ? (
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-8 w-8 rounded-lg text-green-600" 
                      onClick={() => saveMutation.mutate({ id: room.id, name: newName })}
                      disabled={saving}
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  ) : (
                    <>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 rounded-lg text-slate-400" 
                        onClick={() => { setEditingId(room.id); setNewName(room.name); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-500" 
                        onClick={() => { if(confirm("Remover este tipo de cômodo?")) deleteMutation.mutate(room.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
            
            {roomsQ.isLoading && (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
              </div>
            )}
            
            {roomsQ.data?.length === 0 && !roomsQ.isLoading && (
              <p className="text-center text-xs text-slate-400 italic py-4">Nenhum cômodo cadastrado.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

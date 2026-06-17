import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/utils/toast";
import { Edit2, Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CommissionsCategoryPanel() {
  const { activeTenantId } = useTenant();
  const qc = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [categoryName, setCategoryName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const categoriesQ = useQuery({
    queryKey: ["commission_categories", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name, status, created_at, deleted_at")
        .eq("tenant_id", activeTenantId!)
        .eq("entity_type", "commission_category")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const openModal = (category?: any) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.display_name);
    } else {
      setEditingCategory(null);
      setCategoryName("");
    }
    setIsModalOpen(true);
  };

  const saveCategory = async () => {
    if (!activeTenantId || !categoryName.trim()) return;
    setIsSaving(true);
    
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from("core_entities")
          .update({ display_name: categoryName.trim() })
          .eq("tenant_id", activeTenantId)
          .eq("id", editingCategory.id);
        if (error) throw error;
        showSuccess("Categoria de comissão atualizada.");
      } else {
        const { error } = await supabase
          .from("core_entities")
          .insert({
            tenant_id: activeTenantId,
            entity_type: "commission_category",
            display_name: categoryName.trim(),
            status: "active",
          });
        if (error) throw error;
        showSuccess("Categoria de comissão criada.");
      }
      setIsModalOpen(false);
      qc.invalidateQueries({ queryKey: ["commission_categories", activeTenantId] });
    } catch (e: any) {
      showError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!activeTenantId || !confirm("Deseja realmente remover esta categoria?")) return;
    
    try {
      const { error } = await supabase
        .from("core_entities")
        .update({ deleted_at: new Date().toISOString() })
        .eq("tenant_id", activeTenantId)
        .eq("id", id);
      if (error) throw error;
      showSuccess("Categoria removida.");
      qc.invalidateQueries({ queryKey: ["commission_categories", activeTenantId] });
    } catch (e: any) {
      showError(e.message);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Categorias de Comissão</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Crie categorias (flags) para associar aos produtos e definir regras específicas no perfil dos vendedores.
            </p>
          </div>
          <Button onClick={() => openModal()} className="h-9 rounded-2xl">
            <Plus className="w-4 h-4 mr-2" />
            Nova Categoria
          </Button>
        </div>

        {categoriesQ.isLoading ? (
          <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            Carregando...
          </div>
        ) : (
          <div className="mt-4 grid gap-2">
            {categoriesQ.data?.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <div className="font-semibold text-slate-900 text-sm">{cat.display_name}</div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openModal(cat)}
                    className="h-8 w-8 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-200"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteCategory(cat.id)}
                    className="h-8 w-8 rounded-xl text-rose-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            
            {(!categoriesQ.data || categoriesQ.data.length === 0) && (
              <div className="py-6 text-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
                Nenhuma categoria cadastrada.
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="rounded-[22px]">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Nome da Categoria</Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ex: Alta Margem"
                className="h-11 rounded-2xl"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)} className="rounded-2xl">
              Cancelar
            </Button>
            <Button
              onClick={saveCategory}
              disabled={!categoryName.trim() || isSaving}
              className="rounded-2xl bg-[hsl(var(--byfrost-accent))] text-white"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

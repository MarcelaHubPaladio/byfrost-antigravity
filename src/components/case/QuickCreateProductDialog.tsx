import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { PackagePlus } from "lucide-react";

export function QuickCreateProductDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  initialName: string;
  onCreated: (entity: any) => void;
}) {
  const { open, onOpenChange, tenantId, initialName, onCreated } = props;
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) {
      showError("O nome do produto é obrigatório.");
      return;
    }

    setLoading(true);
    try {
      // 1. Create Core Entity
      const { data: entity, error: entityErr } = await supabase
        .from("core_entities")
        .insert({
          tenant_id: tenantId,
          entity_type: "offering",
          subtype: "product",
          display_name: name.trim(),
          status: "active",
          metadata: {
            price: price ? Number(price.replace(",", ".")) : 0,
            code: code.trim(),
            short_name: name.trim()
          }
        })
        .select()
        .single();

      if (entityErr) throw entityErr;

      // 2. Create Core Offering specialization (best practice)
      await supabase.from("core_offerings").insert({
        entity_id: entity.id,
        tenant_id: tenantId,
        offering_kind: "product",
        requires_fulfillment: true,
        track_stock: false
      });

      showSuccess("Produto cadastrado com sucesso!");
      
      await qc.invalidateQueries({ queryKey: ["offerings_search"] });

      onCreated(entity);
      onOpenChange(false);
    } catch (e: any) {
      showError(`Falha ao cadastrar: ${e?.message ?? "erro"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-[24px] border-slate-200 bg-white p-6 shadow-xl">
        <DialogHeader>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 mb-4">
            <PackagePlus className="h-6 w-6" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900">Cadastrar Produto</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Adicione rapidamente um novo produto ao seu inventário.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do Produto</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
              placeholder="Ex: Adubo NPK 10-10-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Código / SKU</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
                placeholder="Ex: ADU-001"
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preço Sugerido</Label>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-slate-50/50"
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4">
            <Button
              variant="ghost"
              className="h-11 rounded-xl font-bold text-slate-500"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              className="h-11 rounded-xl bg-emerald-600 px-8 font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-100 disabled:opacity-50"
              onClick={handleCreate}
              disabled={loading || !name.trim()}
            >
              {loading ? "Salvando..." : "Cadastrar e Usar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

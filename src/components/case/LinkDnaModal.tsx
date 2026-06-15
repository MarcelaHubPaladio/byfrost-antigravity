import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RefreshCw, FileText } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError } from "@/utils/toast";

export function LinkDnaModal(props: {
  tenantId: string;
  customerEntityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (commitmentId: string, deliverableId: string | null) => Promise<void>;
  saving: boolean;
}) {
  const [selectedCid, setSelectedCid] = useState<string>("");
  const [selectedDid, setSelectedDid] = useState<string>("");

  const commitmentsQ = useQuery({
    queryKey: ["modal_commitments", props.tenantId, props.customerEntityId],
    enabled: Boolean(props.tenantId && props.open),
    queryFn: async () => {
      let q = supabase
        .from("commercial_commitments")
        .select("id, status, commitment_type, core_entities(display_name)")
        .eq("tenant_id", props.tenantId)
        .not("status", "eq", "draft");

      if (props.customerEntityId) {
          q = q.eq("customer_entity_id", props.customerEntityId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    }
  });

  const deliverablesQ = useQuery({
    queryKey: ["modal_deliverables", props.tenantId, selectedCid],
    enabled: Boolean(props.tenantId && selectedCid),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables")
        .select("id, name, status")
        .eq("tenant_id", props.tenantId)
        .eq("commitment_id", selectedCid)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    }
  });

  const handleSave = async () => {
    if (!selectedCid) {
        showError("Selecione um contrato.");
        return;
    }
    await props.onSave(selectedCid, selectedDid === "__none__" ? null : selectedDid);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-md rounded-[24px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FileText className="h-5 w-5 text-indigo-600" />
            Vincular Contrato (DNA)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">1. Contrato</Label>
            <Select value={selectedCid} onValueChange={(val) => { setSelectedCid(val); setSelectedDid(""); }} disabled={commitmentsQ.isLoading}>
              <SelectTrigger className="w-full h-11 rounded-2xl">
                <SelectValue placeholder="Selecione o contrato..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {(commitmentsQ.data ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.core_entities?.display_name || "Cliente Desconhecido"} - {c.commitment_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCid && (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">2. Entregável (Opcional)</Label>
              <Select value={selectedDid} onValueChange={setSelectedDid} disabled={deliverablesQ.isLoading}>
                <SelectTrigger className="w-full h-11 rounded-2xl">
                  <SelectValue placeholder="Selecione um entregável..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__none__">(Nenhum específico)</SelectItem>
                  {(deliverablesQ.data ?? []).map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name} ({d.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Button 
            className="w-full h-11 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold mt-4"
            onClick={handleSave}
            disabled={props.saving || !selectedCid}
          >
            {props.saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
            Vincular DNA
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

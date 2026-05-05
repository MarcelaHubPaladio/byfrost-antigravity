import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { Upload, X, FileText, Loader2, User, MapPin, UserPlus, ClipboardList } from "lucide-react";

export function NewSalesOrderDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  journeyId: string;
}) {
  const { open, onOpenChange, tenantId, journeyId } = props;
  const nav = useNavigate();
  const qc = useQueryClient();

  const [saving, setSaving] = useState(false);
  
  // Form State
  const [customerName, setCustomerName] = useState("");
  const [city, setCity] = useState("");
  const [sellerId, setSellerId] = useState("");
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [observations, setObservations] = useState("");

  const usersQ = useQuery({
    queryKey: ["tenant_users_profiles", tenantId],
    enabled: Boolean(open && tenantId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
  });

  const resetForm = () => {
    setCustomerName("");
    setCity("");
    setSellerId("");
    setOrderFile(null);
    setDocFiles([]);
    setObservations("");
    setSaving(false);
  };

  const uploadFile = async (file: File, subfolder: string) => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const path = `tenants/${tenantId}/orders/${subfolder}/${Date.now()}_${cleanName}`;
    const { error } = await supabase.storage.from("tenant-assets").upload(path, file);
    if (error) throw error;
    return path;
  };

  const handleCreate = async () => {
    if (!customerName.trim()) {
      showError("Informe o nome do cliente.");
      return;
    }

    setSaving(true);
    try {
      // 1. Create Case
      const { data: caseRow, error: caseErr } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          case_type: "sales_order",
          status: "open",
          state: "new",
          title: customerName,
          assigned_user_id: sellerId || null,
          created_by_channel: "panel",
          meta_json: { created_from: "simplified_modal" }
        })
        .select("id")
        .single();

      if (caseErr) throw caseErr;
      const caseId = caseRow.id;

      // 2. Upload Files
      let orderPath = "";
      if (orderFile) {
        orderPath = await uploadFile(orderFile, "main_orders");
      }
      
      const docPaths: string[] = [];
      for (const f of docFiles) {
        const p = await uploadFile(f, "attachments");
        docPaths.push(p);
      }

      // 3. Create Case Fields
      const fields = [
        { tenant_id: tenantId, case_id: caseId, key: "name", value_text: customerName },
        { tenant_id: tenantId, case_id: caseId, key: "city", value_text: city },
        { tenant_id: tenantId, case_id: caseId, key: "obs", value_text: observations },
      ];

      if (orderPath) {
        fields.push({ tenant_id: tenantId, case_id: caseId, key: "order_attachment", value_text: orderPath });
      }
      if (docPaths.length > 0) {
        fields.push({ tenant_id: tenantId, case_id: caseId, key: "docs_attachments", value_text: JSON.stringify(docPaths) });
      }

      const { error: fieldsErr } = await supabase.from("case_fields").insert(fields);
      if (fieldsErr) throw fieldsErr;

      showSuccess("Pedido criado com sucesso!");
      
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["cases_by_tenant", tenantId] }),
        qc.invalidateQueries({ queryKey: ["cases"] }),
      ]);

      onOpenChange(false);
      resetForm();
      nav(`/app/orders/${caseId}`);
    } catch (e: any) {
      showError(`Falha ao criar pedido: ${e.message}`);
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) resetForm();
      onOpenChange(v);
    }}>
      <DialogContent className="sm:max-w-[600px] rounded-[32px] overflow-hidden p-0 border-none shadow-2xl">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <UserPlus className="w-8 h-8" />
              Novo Pedido de Venda
            </DialogTitle>
            <DialogDescription className="text-blue-100 text-sm font-medium">
              Preencha os dados abaixo para iniciar um novo pedido.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <User className="w-3 h-3" /> Nome do Cliente
              </Label>
              <Input 
                placeholder="Ex: João da Silva" 
                value={customerName} 
                onChange={e => setCustomerName(e.target.value)}
                className="h-12 rounded-2xl border-slate-200 focus:ring-blue-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <MapPin className="w-3 h-3" /> Cidade
              </Label>
              <Input 
                placeholder="Ex: São Paulo" 
                value={city} 
                onChange={e => setCity(e.target.value)}
                className="h-12 rounded-2xl border-slate-200 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <ClipboardList className="w-3 h-3" /> Vendedor Responsável
            </Label>
            <Select value={sellerId} onValueChange={setSellerId}>
              <SelectTrigger className="h-12 rounded-2xl border-slate-200">
                <SelectValue placeholder="Selecione um vendedor..." />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                {usersQ.data?.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id} className="rounded-xl">
                    {u.display_name || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Anexar o Pedido</Label>
              <div className="relative">
                <Input 
                  type="file" 
                  onChange={e => setOrderFile(e.target.files?.[0] || null)}
                  className="h-12 rounded-2xl border-slate-200 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {orderFile && (
                  <button onClick={() => setOrderFile(null)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Anexar Documentos</Label>
              <Input 
                type="file" 
                multiple 
                onChange={e => setDocFiles(Array.from(e.target.files || []))}
                className="h-12 rounded-2xl border-slate-200 file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {docFiles.length > 0 && (
                <p className="text-[10px] text-slate-500 font-medium">{docFiles.length} arquivos selecionados</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-black uppercase tracking-widest text-slate-400">Observações</Label>
            <Textarea 
              placeholder="Alguma informação adicional importante..." 
              value={observations} 
              onChange={e => setObservations(e.target.value)}
              className="rounded-2xl border-slate-200 min-h-[100px] focus:ring-blue-500"
            />
          </div>
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-2xl h-12 font-bold text-slate-500">
            Cancelar
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={saving || !customerName.trim()}
            className="rounded-2xl h-12 px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-200 transition-all active:scale-95"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Pedido"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
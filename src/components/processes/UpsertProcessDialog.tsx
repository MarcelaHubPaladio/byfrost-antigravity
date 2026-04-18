import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Plus, Trash2, X, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

type ProcessRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  checklists: any[];
  flowchart_json: any;
  target_role: string | null;
  is_home_flowchart: boolean;
};

interface UpsertProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  process: ProcessRow | null;
}

export function UpsertProcessDialog({ open, onOpenChange, process }: UpsertProcessDialogProps) {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [isHomeFlowchart, setIsHomeFlowchart] = useState(false);
  const [checklists, setChecklists] = useState<string[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");

  useEffect(() => {
    if (process) {
      setTitle(process.title);
      setDescription(process.description || "");
      setTargetRole(process.target_role);
      setIsHomeFlowchart(process.is_home_flowchart);
      setChecklists(Array.isArray(process.checklists) ? process.checklists : []);
    } else {
      setTitle("");
      setDescription("");
      setTargetRole(null);
      setIsHomeFlowchart(false);
      setChecklists([]);
    }
  }, [process, open]);

  const upsertM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant não selecionado");
      if (!title.trim()) throw new Error("Título é obrigatório");

      const payload = {
        tenant_id: activeTenantId,
        title: title.trim(),
        description: description || null,
        target_role: targetRole === "all" ? null : targetRole,
        is_home_flowchart: isHomeFlowchart,
        checklists: checklists,
        updated_at: new Date().toISOString(),
      };

      if (process?.id) {
        const { error } = await supabase
          .from("processes")
          .update(payload)
          .eq("id", process.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("processes")
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      showSuccess(process?.id ? "Processo atualizado" : "Processo criado");
      qc.invalidateQueries({ queryKey: ["processes", activeTenantId] });
      onOpenChange(false);
    },
    onError: (err: any) => showError(err.message),
  });

  const addCheckItem = () => {
    if (newCheckItem.trim()) {
      setChecklists([...checklists, newCheckItem.trim()]);
      setNewCheckItem("");
    }
  };

  const removeCheckItem = (index: number) => {
    setChecklists(checklists.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl rounded-[28px] max-h-[90vh] flex flex-col p-0 overflow-hidden border-slate-200 shadow-2xl">
        <DialogHeader className="p-6 border-b border-slate-100 bg-slate-50/30">
          <DialogTitle className="text-xl font-bold text-slate-900">
            {process ? "Editar Processo" : "Novo Processo"}
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Preencha os detalhes do processo operacional.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm font-semibold text-slate-700">Título do Processo</Label>
              <Input 
                id="title" 
                placeholder="Ex: Abertura de Loja, Recebimento de Mercadoria..." 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-slate-200"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Cargo Alvo</Label>
                <Select value={targetRole || "all"} onValueChange={(v) => setTargetRole(v)}>
                  <SelectTrigger className="h-11 rounded-xl border-slate-200">
                    <SelectValue placeholder="Selecione um cargo" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-100">
                    <SelectItem value="all">Todos (Geral)</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="manager">Gerente</SelectItem>
                    <SelectItem value="vendor">Vendedor / Operador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 pt-8">
                <Checkbox 
                  id="is_home" 
                  checked={isHomeFlowchart} 
                  onCheckedChange={(v) => setIsHomeFlowchart(!!v)}
                  className="rounded-lg h-5 w-5 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900" 
                />
                <Label htmlFor="is_home" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Marcar como Mapa Geral (Home)
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700">Descrição / Instruções</Label>
              <RichTextEditor 
                value={description} 
                onChange={setDescription} 
                className="border-slate-200"
                minHeightClassName="min-h-[200px]"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                Checklist Operacional
                <Badge variant="outline" className="rounded-full text-[10px] py-0">{checklists.length}</Badge>
              </Label>
              
              <div className="flex gap-2">
                <Input 
                  placeholder="Novo item do checklist..." 
                  value={newCheckItem}
                  onChange={(e) => setNewCheckItem(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                  className="h-10 rounded-xl border-slate-200"
                />
                <Button type="button" onClick={addCheckItem} className="h-10 rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200 px-3">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {checklists.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100 group">
                    <span className="text-sm text-slate-700 truncate">{item}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeCheckItem(idx)}
                      className="h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-800">Editor de Fluxograma</h4>
                  <p className="text-xs text-amber-700 mt-1">
                    A edição visual de nós e conexões será implementada na próxima fase. 
                    Por enquanto, utilize a descrição e os checklists para guiar o processo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="p-6 border-t border-slate-100 bg-slate-50/30 gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl h-11 px-6">
            Cancelar
          </Button>
          <Button 
            onClick={() => upsertM.mutate()} 
            disabled={upsertM.isPending}
            className="rounded-xl h-11 px-8 bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200"
          >
            {upsertM.isPending ? "Salvando..." : process ? "Atualizar Processo" : "Criar Processo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

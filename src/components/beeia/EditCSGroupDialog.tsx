import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface EditCSGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
}

export function EditCSGroupDialog({ open, onOpenChange, group }: EditCSGroupDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && group) {
      setPrompt(group.prompt_context || "");
    }
  }, [open, group]);

  const handleSave = async () => {
    if (!group) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("beeia_cs_groups")
        .update({ prompt_context: prompt })
        .eq("id", group.id);

      if (error) throw error;

      toast.success("Configurações do grupo salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["beeia_cs_groups"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configurar IA para {group?.group_name}</DialogTitle>
          <DialogDescription>
            Escreva as instruções específicas para este grupo. A BeeIA usará este texto para entender o escopo do cliente e como responder.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Instruções Específicas do Grupo (Prompt)
          </label>
          <Textarea
            placeholder="Ex: O escopo deste cliente são 4 vídeos curtos por mês e 1 reunião. Os vídeos são entregues dia 15."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[150px] resize-none"
          />
          <p className="text-[10px] text-slate-500 mt-2">
            O nome do cliente e a situação do contrato já são inseridos automaticamente. Use este espaço apenas para detalhes operacionais.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

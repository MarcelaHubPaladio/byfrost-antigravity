import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface EditCSGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: any;
}

export function EditCSGroupDialog({ open, onOpenChange, group }: EditCSGroupDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [previewContext, setPreviewContext] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && group) {
      setPrompt(group.prompt_context || "");
      setPreviewContext(null); // Reset preview
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

  const loadContextPreview = async () => {
    if (!group || !group.commitment_id) {
      toast.error("Este grupo não possui um contrato (compromisso) vinculado.");
      return;
    }
    
    if (previewContext !== null) {
      setPreviewContext(null);
      return;
    }

    setIsLoadingContext(true);
    try {
      const opContextRes = await supabase.functions.invoke("m30-operational-context", {
        body: { tenantId: group.tenant_id, commitmentId: group.commitment_id }
      });

      let contextText = "";
      if (opContextRes.data?.ok && opContextRes.data?.context) {
        const ctx = opContextRes.data.context;
        contextText += `Cliente: ${ctx.client?.name || "Desconhecido"}\n`;
        contextText += `Status do Contrato: ${ctx.contract?.status || "N/A"}\n\n`;

        contextText += `[ESCOPO E ENTREGÁVEIS]\n`;
        if (ctx.scope && ctx.scope.length > 0) {
          ctx.scope.forEach((s: any) => {
            contextText += `- ${s.type}: ${s.contracted} contratados, ${s.completed} concluídos, ${s.available} disponíveis.\n`;
          });
        } else {
          contextText += `(Nenhum entregável mapeado)\n`;
        }

        if (ctx.current_cycle) {
          contextText += `\n[CICLO ATUAL]\n`;
          contextText += `Mês: ${ctx.current_cycle.name}\n`;
          if (ctx.current_cycle.date_planning) contextText += `Data de Planejamento: ${ctx.current_cycle.date_planning}\n`;
          if (ctx.current_cycle.date_recording) contextText += `Data de Gravação: ${ctx.current_cycle.date_recording}\n`;
          if (ctx.current_cycle.date_approval) contextText += `Data de Aprovação: ${ctx.current_cycle.date_approval}\n`;
          if (ctx.current_cycle.date_posting) contextText += `Data de Postagem: ${ctx.current_cycle.date_posting}\n`;
          
          if (ctx.current_cycle.strategies && ctx.current_cycle.strategies.length > 0) {
            contextText += `\n[ESTRATÉGIAS E SUBTAREFAS DO CICLO]\n`;
            ctx.current_cycle.strategies.forEach((st: any) => {
              contextText += `- ${st.title} (Status atual do card: ${st.state})\n`;
              if (st.subtasks && st.subtasks.length > 0) {
                st.subtasks.forEach((sub: any) => {
                  let dateStr = "";
                  if (sub.post_date) {
                    const d = new Date(sub.post_date);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                    dateStr = ` | Data Prevista: ${d.toLocaleDateString("pt-BR")}`;
                  }
                  contextText += `  * [${sub.type}] ${sub.title} - Status: ${sub.status}${dateStr}\n`;
                });
              }
            });
          }
        }

        if (ctx.account_context) {
          contextText += `\n[CONTEXTO DA MARCA E REGRAS]\n`;
          if (ctx.account_context.objective) contextText += `Objetivo: ${ctx.account_context.objective}\n`;
          if (ctx.account_context.rules) contextText += `Regras de Ouro: ${ctx.account_context.rules}\n`;
        }
      } else {
        contextText = "O contexto detalhado do contrato não está disponível no momento.";
      }
      setPreviewContext(contextText);
    } catch (err: any) {
      toast.error(`Erro ao carregar contexto: ${err.message}`);
    } finally {
      setIsLoadingContext(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar IA para {group?.group_name}</DialogTitle>
          <DialogDescription>
            Escreva as instruções específicas para este grupo e visualize o contexto do contrato que a BeeIA consumirá.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Instruções Específicas do Grupo (Prompt Opcional)
            </label>
            <Textarea
              placeholder="Ex: O escopo deste cliente são 4 vídeos curtos por mês e 1 reunião. Os vídeos são entregues dia 15."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-[120px] resize-none"
            />
            <p className="text-[10px] text-slate-500 mt-2">
              Use este espaço apenas para regras de comunicação ou detalhes que não estão mapeados no contrato abaixo.
            </p>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Contexto Automático do Contrato
              </label>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadContextPreview}
                disabled={isLoadingContext}
                className="h-8 text-xs"
              >
                {isLoadingContext ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : previewContext !== null ? (
                  <EyeOff className="mr-2 h-3 w-3" />
                ) : (
                  <Eye className="mr-2 h-3 w-3" />
                )}
                {previewContext !== null ? "Esconder Contexto" : "Simular Contexto"}
              </Button>
            </div>
            
            {previewContext !== null && (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-md p-3 border border-slate-200 dark:border-slate-800">
                <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                  {previewContext}
                </pre>
                {previewContext.includes("Nenhum entregável mapeado") && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-2 font-medium">
                    ⚠️ Dica: Você precisa cadastrar os Entregáveis no Contrato deste cliente para a IA parar de dar respostas genéricas sobre o escopo.
                  </p>
                )}
              </div>
            )}
            {previewContext === null && (
              <p className="text-[11px] text-slate-500 italic">
                Clique em "Simular Contexto" para ver as informações exatas que a BeeIA vai ler sobre o escopo e contrato deste cliente antes de responder.
              </p>
            )}
          </div>
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

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  History, 
  Plus, 
  Trash2, 
  MessageSquare, 
  Clock, 
  Send,
  AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/utils/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const UPDATE_CATEGORIES = [
  { value: "faturamento", label: "Faturamento", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "projeto", label: "Projeto", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "em rota", label: "Em Rota", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expedição", label: "Expedição", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "concluído", label: "Concluído", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

interface CaseUpdatesCardProps {
  caseId: string;
  tenantId: string;
}

export function CaseUpdatesCard({ caseId, tenantId }: CaseUpdatesCardProps) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [newText, setNewText] = useState("");
  const [category, setCategory] = useState("faturamento");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState("faturamento");
  const [editText, setEditText] = useState("");

  const { data: updates, isLoading } = useQuery({
    queryKey: ["case_updates", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .eq("event_type", "case_update")
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId,
  });

  const handleSave = async () => {
    if (!newText.trim() || !caseId || !tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "case_update",
        actor_type: "admin",
        actor_id: user?.id ?? null,
        message: newText.trim(),
        meta_json: { category },
        occurred_at: new Date().toISOString(),
      });

      if (error) throw error;

      showSuccess("Atualização salva com sucesso!");
      setNewText("");
      qc.invalidateQueries({ queryKey: ["case_updates", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
      // Also invalidate the general case query to refresh timeline if it's separate
      qc.invalidateQueries({ queryKey: ["timeline_events", caseId] });
    } catch (e: any) {
      showError(`Falha ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId || !tenantId) return;
    try {
      const { error } = await supabase
        .from("timeline_events")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("id", deletingId);
      
      if (error) throw error;
      
      showSuccess("Atualização excluída.");
      qc.invalidateQueries({ queryKey: ["case_updates", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
    } catch (e: any) {
      showError(`Falha ao excluir: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = async () => {
    if (!editingId || !editText.trim() || !tenantId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("timeline_events")
        .update({
          message: editText.trim(),
          meta_json: { category: editCategory },
        })
        .eq("tenant_id", tenantId)
        .eq("id", editingId);

      if (error) throw error;

      showSuccess("Atualização editada com sucesso!");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["case_updates", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
      qc.invalidateQueries({ queryKey: ["timeline_events", caseId] });
    } catch (e: any) {
      showError(`Falha ao editar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Input Section */}
      <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 shadow-inner">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nova Atualização</span>
            </div>
            
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px] h-9 rounded-xl border-slate-200 bg-white text-xs font-bold">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-slate-200">
                {UPDATE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value} className="text-xs font-semibold">
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative">
            <Textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Digite os detalhes da atualização aqui..."
              className="min-h-[100px] rounded-2xl border-slate-200 bg-white shadow-sm focus:ring-blue-500/20 transition-all resize-none p-4 text-sm"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || !newText.trim()}
              className="h-10 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2 shadow-lg shadow-blue-600/20 transition-all"
            >
              {saving ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Salvar Atualização
            </Button>
          </div>
        </div>
      </div>

      {/* List Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Histórico de Atualizações</span>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-slate-400 text-xs animate-pulse">Carregando atualizações...</div>
        ) : updates && updates.length > 0 ? (
          <div className="grid gap-3">
            {updates.map((up: any) => {
              const catConfig = UPDATE_CATEGORIES.find(c => c.value === up.meta_json?.category) || UPDATE_CATEGORIES[0];
              return (
                <div 
                  key={up.id}
                  className="group relative bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm hover:shadow-md transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={cn("rounded-lg text-[9px] font-black uppercase tracking-widest border px-2 py-0.5", catConfig.color)}>
                        {catConfig.label}
                      </Badge>
                      <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {format(new Date(up.occurred_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => {
                          setEditingId(up.id);
                          setEditCategory(up.meta_json?.category || "faturamento");
                          setEditText(up.message || "");
                        }}
                        className="h-8 w-8 rounded-full bg-slate-50 text-slate-500 flex items-center justify-center hover:bg-slate-100 transition-all"
                        title="Editar atualização"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                      </button>
                      <button
                        onClick={() => setDeletingId(up.id)}
                        className="h-8 w-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-100 transition-all"
                        title="Excluir atualização"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  {editingId === up.id ? (
                    <div className="mt-3 flex flex-col gap-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                      <Select value={editCategory} onValueChange={setEditCategory}>
                        <SelectTrigger className="w-[160px] h-9 rounded-xl border-slate-200 bg-white text-xs font-bold">
                          <SelectValue placeholder="Categoria" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-slate-200">
                          {UPDATE_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value} className="text-xs font-semibold">
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-h-[80px] rounded-xl border-slate-200 bg-white text-sm focus:ring-blue-500/20 resize-none p-3"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          className="h-9 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={handleEdit}
                          disabled={saving || !editText.trim()}
                          className="h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20"
                        >
                          {saving ? <Clock className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                          Salvar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 leading-relaxed font-medium">
                      {up.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50/30 border border-dashed border-slate-200 rounded-[32px] text-slate-400">
            <MessageSquare className="h-8 w-8 opacity-20" />
            <p className="text-xs font-bold uppercase tracking-widest opacity-60">Nenhuma atualização registrada</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent className="rounded-[32px] border-none shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black text-slate-900">Excluir atualização?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium text-slate-500">
              Esta ação não pode ser desfeita. A atualização será removida permanentemente do histórico e da linha do tempo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="rounded-2xl border-slate-200 font-bold text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="rounded-2xl bg-rose-600 hover:bg-rose-700 font-bold text-xs shadow-lg shadow-rose-600/20"
            >
              Confirmar Exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

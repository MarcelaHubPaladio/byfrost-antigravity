import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Tags, Loader2 } from "lucide-react";
import { showError } from "@/utils/toast";

export function CaseLabelsSelector({ caseId, activeTenantId }: { caseId: string; activeTenantId: string | null }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const labelsQ = useQuery({
    queryKey: ["crm_labels", activeTenantId],
    enabled: !!activeTenantId,
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

  const caseLabelsQ = useQuery({
    queryKey: ["case_labels", activeTenantId, caseId],
    enabled: !!activeTenantId && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_labels")
        .select("label_id")
        .eq("case_id", caseId);
      if (error) throw error;
      return data?.map(cl => cl.label_id) || [];
    }
  });

  const toggleLabel = useMutation({
    mutationFn: async ({ labelId, assign }: { labelId: string; assign: boolean }) => {
      if (assign) {
        const { error } = await supabase.from("case_labels").insert({
          tenant_id: activeTenantId!,
          case_id: caseId,
          label_id: labelId
        });
        if (error && error.code !== "23505") throw error; // ignore unique constraint
      } else {
        const { error } = await supabase.from("case_labels")
          .delete()
          .eq("case_id", caseId)
          .eq("label_id", labelId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case_labels", activeTenantId, caseId] });
      qc.invalidateQueries({ queryKey: ["beeia_cases"] }); // to update list
    },
    onError: (err: any) => {
      showError("Erro ao atualizar etiqueta", err);
    }
  });

  const assignedSet = new Set(caseLabelsQ.data || []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600" title="Etiquetas">
          <Tags className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="mb-2 px-2 py-1 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase">Etiquetas</span>
        </div>
        {labelsQ.isLoading ? (
          <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
        ) : labelsQ.data?.length === 0 ? (
          <div className="py-2 px-2 text-xs text-slate-500">Nenhuma etiqueta cadastrada.</div>
        ) : (
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto custom-scrollbar">
            {labelsQ.data?.map(label => {
              const isAssigned = assignedSet.has(label.id);
              return (
                <button
                  key={label.id}
                  disabled={toggleLabel.isPending}
                  onClick={() => toggleLabel.mutate({ labelId: label.id, assign: !isAssigned })}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50`}
                >
                  <div className="flex-none w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: label.color }} />
                  <span className="flex-1 truncate">{label.name}</span>
                  {isAssigned && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Edit2, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";

interface CustomerNameEditorProps {
  customerId: string | null;
  currentName: string | null;
  activeTenantId: string | null;
}

export function CustomerNameEditor({ customerId, currentName, activeTenantId }: CustomerNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempName, setTempName] = useState(currentName || "");
  const qc = useQueryClient();

  const updateName = useMutation({
    mutationFn: async (newName: string) => {
      if (!customerId) throw new Error("Cliente não encontrado.");
      const { error } = await supabase
        .from("customer_accounts")
        .update({ name: newName })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["case"] });
      qc.invalidateQueries({ queryKey: ["case_lite_for_chat"] });
      setIsEditing(false);
      showSuccess("Nome atualizado com sucesso!");
    },
    onError: (err: any) => {
      showError("Erro ao atualizar nome.", err);
    }
  });

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 group">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          {currentName || "Usuário Desconhecido"}
        </h3>
        {customerId && (
          <button
            onClick={() => {
              setTempName(currentName || "");
              setIsEditing(true);
            }}
            className="text-slate-400 hover:text-indigo-600 opacity-50 hover:opacity-100 transition-opacity"
            title="Editar nome"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={tempName}
        onChange={(e) => setTempName(e.target.value)}
        className="h-7 text-sm py-1 px-2 w-40 sm:w-48"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") updateName.mutate(tempName);
          if (e.key === "Escape") setIsEditing(false);
        }}
        disabled={updateName.isPending}
      />
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
        onClick={() => updateName.mutate(tempName)}
        disabled={updateName.isPending}
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-slate-400 hover:text-slate-600"
        onClick={() => setIsEditing(false)}
        disabled={updateName.isPending}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

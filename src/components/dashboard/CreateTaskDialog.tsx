import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useSuperTasks } from "@/hooks/useSuperTasks";
import { showError, showSuccess } from "@/utils/toast";

interface CreateTaskDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: Date;
  tenantId: string;
}

export function CreateTaskDialog({ isOpen, onOpenChange, initialDate = new Date(), tenantId }: CreateTaskDialogProps) {
  const { upsertTask } = useSuperTasks({ tenantId });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => format(initialDate, "yyyy-MM-dd"));

  useEffect(() => {
    if (isOpen) {
      setDate(format(initialDate, "yyyy-MM-dd"));
    }
  }, [isOpen, initialDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title) {
      showError("Por favor, preencha o título da tarefa.");
      return;
    }

    try {
      setIsSubmitting(true);
      
      await upsertTask.mutateAsync({
        title,
        due_date: date,
        is_completed: false,
        is_commitment: false // For now, we just create simple tasks
      });

      showSuccess("Tarefa criada com sucesso!");
      
      // Reset & close
      setTitle("");
      onOpenChange(false);
    } catch (error: any) {
      showError(error.message || "Erro ao criar tarefa.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Título da Tarefa</Label>
            <Input 
              id="task-title" 
              placeholder="Ex: Enviar relatório financeiro" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-date">Data de Vencimento</Label>
            <Input 
              id="task-date" 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Tarefa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

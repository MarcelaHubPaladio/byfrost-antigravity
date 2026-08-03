import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { useQueryClient } from "@tanstack/react-query";

interface CreateEventDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  calendars: { id: string; summary: string; primary: boolean }[];
  initialDate?: Date;
}

export function CreateEventDialog({ isOpen, onOpenChange, calendars, initialDate = new Date() }: CreateEventDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const defaultCalendar = calendars?.find(c => c.primary)?.id || "primary";
  
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => format(initialDate, "yyyy-MM-dd"));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [calendarId, setCalendarId] = useState(defaultCalendar);

  // Sync date when dialog opens with a new initialDate
  useEffect(() => {
    if (isOpen) {
      setDate(format(initialDate, "yyyy-MM-dd"));
      setCalendarId(calendars?.find(c => c.primary)?.id || "primary");
    }
  }, [isOpen, initialDate, calendars]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title || !date || !startTime || !endTime) {
      showError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    // Convert local date/time into ISO strings
    try {
      const startDateTimeStr = `${date}T${startTime}:00`;
      const endDateTimeStr = `${date}T${endTime}:00`;
      
      const startDateTime = new Date(startDateTimeStr).toISOString();
      const endDateTime = new Date(endDateTimeStr).toISOString();

      setIsSubmitting(true);

      const { data, error } = await supabase.functions.invoke("google-oauth", {
        body: {
          action: "create_event",
          calendarId,
          summary: title,
          startDateTime,
          endDateTime
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      showSuccess("Evento criado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["google_events"] });
      
      // Reset & close
      setTitle("");
      setStartTime("");
      setEndTime("");
      onOpenChange(false);
    } catch (error: any) {
      showError(error.message || "Erro ao criar evento.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Novo Evento da Agenda</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título do Compromisso</Label>
            <Input 
              id="title" 
              placeholder="Ex: Reunião de Alinhamento" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input 
              id="date" 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Início</Label>
              <Input 
                id="startTime" 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Fim</Label>
              <Input 
                id="endTime" 
                type="time" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          {calendars && calendars.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="calendar">Agenda de Destino</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger id="calendar">
                  <SelectValue placeholder="Selecione uma agenda" />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((cal: any) => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.summary} {cal.primary && "(Principal)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-rose-600 hover:bg-rose-700 text-white">
              {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Salvar Evento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

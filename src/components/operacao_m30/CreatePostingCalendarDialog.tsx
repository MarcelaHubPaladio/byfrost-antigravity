import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { showError, showSuccess } from "@/utils/toast";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function CreatePostingCalendarDialog({
  selectedCaseIds,
  cases,
  contracts,
  onSuccess,
  tenantId,
  journeyId,
}: {
  selectedCaseIds: string[];
  cases: any[];
  contracts?: any[];
  onSuccess: () => void;
  tenantId: string;
  journeyId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [postDates, setPostDates] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const [hasAutoFilled, setHasAutoFilled] = useState(false);

  const selectedCases = useMemo(() => {
    return cases.filter(c => selectedCaseIds.includes(c.id));
  }, [cases, selectedCaseIds]);

  const commonEntity = useMemo(() => {
    if (!selectedCases.length) return null;
    const firstEid = selectedCases[0].customer_entity_id || (selectedCases[0].meta_json as any)?.entity_id;
    if (!firstEid) return null;
    
    // Check if all cases have the same entity
    const allSame = selectedCases.every(c => {
      const eid = c.customer_entity_id || (c.meta_json as any)?.entity_id;
      return eid === firstEid;
    });

    if (allSame) {
      return {
        id: firstEid,
        name: (selectedCases[0].meta_json as any)?.customer_entity_name || (selectedCases[0].meta_json as any)?.entity_name || "Cliente"
      };
    }
    return null;
  }, [selectedCases]);

  const commonDeliverable = useMemo(() => {
    if (!selectedCases.length) return null;
    const firstDid = selectedCases[0].deliverable_id || (selectedCases[0].meta_json as any)?.deliverable_id;
    if (!firstDid) return null;
    
    const allSame = selectedCases.every(c => {
      const did = c.deliverable_id || (c.meta_json as any)?.deliverable_id;
      return did === firstDid;
    });

    return allSame ? firstDid : null;
  }, [selectedCases]);

  // Auto-fill dates based on defaultPostingDays
  useEffect(() => {
    if (open && selectedCases.length > 0 && !hasAutoFilled) {
      setHasAutoFilled(true);
      
      const firstContractId = (selectedCases[0].meta_json as any)?.commitment_id;
      if (!firstContractId || !contracts) return;
      
      const contract = contracts.find(c => c.id === firstContractId);
      const defaultDays = contract?.metadata?.default_posting_days as number[] | undefined;
      
      if (defaultDays && defaultDays.length > 0) {
        // Calculate dates
        let currentDate = new Date();
        const autoDates: Record<string, string> = {};
        
        for (const c of selectedCases) {
          // find next valid date starting from currentDate
          let iterations = 0;
          while (iterations < 30) { // safety limit
            const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday
            if (defaultDays.includes(dayOfWeek)) {
              autoDates[c.id] = format(currentDate, "yyyy-MM-dd");
              // advance one day for the next iteration
              currentDate.setDate(currentDate.getDate() + 1);
              break;
            }
            currentDate.setDate(currentDate.getDate() + 1);
            iterations++;
          }
        }
        setPostDates(autoDates);
      }
    }
  }, [open, selectedCases, contracts, hasAutoFilled]);

  const handleDateChange = (caseId: string, dateStr: string) => {
    setPostDates(prev => ({ ...prev, [caseId]: dateStr }));
  };

  const handleCreate = async () => {
    if (!tenantId || !journeyId) {
      showError("Sessão ou jornada não identificada.");
      return;
    }

    setLoading(true);
    try {
      // 1. Get the journey default state
      const { data: journeyData } = await supabase
        .from("journeys")
        .select("default_state_machine_json")
        .eq("id", journeyId)
        .single();
      
      let initialState = "backlog";
      if (journeyData?.default_state_machine_json?.states?.length > 0) {
        initialState = journeyData.default_state_machine_json.states[0];
      }

      // 2. Format title based on dates
      const month = format(new Date(), "MMMM", { locale: ptBR });
      const calendarTitle = `Calendário de Postagem - ${month.charAt(0).toUpperCase() + month.slice(1)}`;

      // 3. Create the new Calendar case
      const videosInfo = selectedCases.map(c => ({
        id: c.id,
        title: c.title,
        post_date: postDates[c.id] || null
      }));

      const { data: newCase, error: createError } = await supabase
        .from("cases")
        .insert({
          tenant_id: tenantId,
          journey_id: journeyId,
          title: calendarTitle,
          status: "open",
          state: initialState,
          customer_entity_id: commonEntity?.id || null,
          deliverable_id: commonDeliverable || null,
          meta_json: {
            is_posting_calendar: true,
            calendar_videos: videosInfo,
            entity_name: commonEntity?.name
          }
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // 4. Update all selected cases: status closed, save post dates
      const promises = selectedCases.map(async c => {
        const meta = {
          ...(c.meta_json || {}),
          post_date: postDates[c.id] || null,
          calendar_case_id: newCase.id
        };
        return supabase.from("cases").update({
          status: "closed",
          meta_json: meta
        }).eq("id", c.id);
      });

      await Promise.all(promises);

      showSuccess("Calendário criado e vídeos concluídos com sucesso!");
      qc.invalidateQueries({ queryKey: ["cases_by_tenant_journey", tenantId, journeyId] });
      setOpen(false);
      onSuccess();

    } catch (e: any) {
      showError("Erro ao criar calendário", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) {
        setHasAutoFilled(false);
        setPostDates({});
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 rounded-full border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-800 text-xs px-4">
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          Gerar Calendário
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Calendário de Postagem</DialogTitle>
          <DialogDescription>
            Defina a data em que cada vídeo irá ao ar. Ao gerar, um novo caso "Calendário" será criado e estes vídeos serão concluídos.
          </DialogDescription>
        </DialogHeader>

        {!commonEntity && selectedCases.length > 0 && (
          <div className="bg-amber-50 text-amber-900 border border-amber-200 text-sm p-3 rounded-lg">
            Aviso: Você selecionou vídeos de clientes (entidades) diferentes. O calendário criado ficará sem um cliente único vinculado.
          </div>
        )}

        <div className="flex flex-col gap-3 py-4">
          {selectedCases.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{c.title || "Sem título"}</p>
                <p className="text-xs text-slate-500">
                  {c.customer_entity_name || (c.meta_json as any)?.customer_entity_name || (c.meta_json as any)?.entity_name || "Cliente desconhecido"}
                </p>
              </div>
              <div className="w-[140px] shrink-0">
                <Input
                  type="date"
                  value={postDates[c.id] || ""}
                  onChange={(e) => handleDateChange(c.id, e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gerar Calendário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

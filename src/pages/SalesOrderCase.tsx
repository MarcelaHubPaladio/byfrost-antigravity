import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  Package, 
  User, 
  CreditCard, 
  ClipboardList, 
  Calendar, 
  Clock, 
  Info,
  CheckCircle2,
  AlertCircle,
  FileText,
  DollarSign,
  MapPin,
  History,
  MoreVertical,
  ChevronRight,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { CaseTimeline } from "@/components/case/CaseTimeline";
import { SalesOrderItemsEditorCard } from "@/components/case/SalesOrderItemsEditorCard";
import { CaseCustomerDataEditorCard } from "@/components/case/CaseCustomerDataEditorCard";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { getStateLabel } from "@/lib/journeyLabels";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/utils/toast";

export default function SalesOrderCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();
  const [updatingState, setUpdatingState] = useState(false);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: TransitionBlockReason[];
  }>({ open: false, nextStateName: "", reasons: [] });

  const tenantId = user?.app_metadata?.tenant_id;

  const { data: timelineQ } = useQuery({
    queryKey: ["case_timeline", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

  const { data: caseData, isLoading: isLoadingCase } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          journey:journeys(*),
          customer:customer_accounts(*)
        `)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

  const { data: fieldsData, isLoading: isLoadingFields } = useQuery({
    queryKey: ["case_fields", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("*")
        .eq("case_id", caseId);
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

  const getField = (key: string) => fieldsData?.find(f => f.key === key)?.value_text;
  
  const customerName = getField("name") || caseData?.customer?.name || "Cliente não identificado";
  const city = getField("city") || ""; 
  const saleDate = getField("sale_date") || getField("sale_date_text") || caseData?.created_at;

  const journey = caseData?.journey;
  const stateMachine = journey?.default_state_machine_json;
  const states = useMemo(() => {
    if (!stateMachine || !stateMachine.states) return [];
    return Object.keys(stateMachine.states);
  }, [stateMachine]);

  const steps = useMemo(() => {
    if (!states.length) {
      return [
        { id: "dados", title: "Dados do Pedido", icon: ClipboardList, status: "complete" },
        { id: "itens", title: "Itens e Quantidades", icon: Package, status: "current" },
        { id: "faturamento", title: "Faturamento e Pagamento", icon: CreditCard, status: "upcoming" },
        { id: "entrega", title: "Logística e Entrega", icon: Truck, status: "upcoming" },
      ];
    }
    
    return states.map((s, idx) => {
      const isCurrent = s === caseData?.state;
      const currentIndex = states.indexOf(caseData?.state || "");
      const status = idx < currentIndex ? "complete" : isCurrent ? "current" : "upcoming";
      return {
        id: s,
        title: getStateLabel(journey, s),
        icon: idx === 0 ? ClipboardList : idx === 1 ? Package : idx === 2 ? CreditCard : Truck,
        status
      };
    });
  }, [states, caseData?.state, journey]);

  const updateState = async (nextState: string) => {
    if (!caseId || !tenantId) return;
    try {
      setUpdatingState(true);
      const reasons = await checkTransitionBlocks(supabase, tenantId, caseId, nextState);
      if (reasons.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons });
        return;
      }
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState, updated_at: new Date().toISOString() })
        .eq("id", caseId);
      if (error) throw error;
      showSuccess(`Status atualizado para ${getStateLabel(journey, nextState)}`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar status");
    } finally {
      setUpdatingState(false);
    }
  };

  const formattedDate = useMemo(() => {
    if (!saleDate) return "Data não inf.";
    try {
      const d = new Date(saleDate);
      return format(d, "dd 'de' MMM, yyyy", { locale: ptBR });
    } catch {
      return "Data inválida";
    }
  }, [saleDate]);

  if (isLoadingCase || isLoadingFields) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
            <Skeleton className="h-12 w-1/3 rounded-2xl" />
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8 space-y-4">
                <Skeleton className="h-64 rounded-[32px]" />
                <Skeleton className="h-64 rounded-[32px]" />
              </div>
              <div className="col-span-4 space-y-4">
                <Skeleton className="h-96 rounded-[32px]" />
              </div>
            </div>
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  const currentIndex = states.indexOf(caseData?.state || "");
  const progressPercent = Math.round((currentIndex / Math.max(1, states.length - 1)) * 100);

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col h-full bg-[#F8FAFC]">
          <div className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/60 transition-all duration-300">
            <div className="w-full px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Link to="/app/orders">
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-slate-100/80">
                    <ChevronLeft className="h-5 w-5 text-slate-600" />
                  </Button>
                </Link>
                <div className="h-8 w-px bg-slate-200/60" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 tracking-tight">
                      {customerName.toUpperCase()}
                    </h1>
                    <Badge className="bg-blue-50 text-blue-600 border-blue-100 rounded-lg text-[10px] font-black tracking-widest px-2 py-0.5 h-auto">
                      #{caseData?.meta_json?.external_id || caseData?.id.slice(0, 8)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider">
                      <MapPin className="h-3 w-3" /> {city || "Local não inf."}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> {formattedDate}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Select value={caseData?.state} onValueChange={updateState} disabled={updatingState}>
                  <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white shadow-sm border-slate-200 font-black text-[10px] uppercase tracking-widest px-4">
                    <SelectValue placeholder="Status..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-slate-200">
                    {states.map((s) => (
                      <SelectItem key={s} value={s} className="rounded-xl font-bold text-xs uppercase">
                        {getStateLabel(journey, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="h-10 w-px bg-slate-100 mx-2" />
                <div className="flex -space-x-2 mr-4">
                  <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <main className="flex-grow overflow-auto scrollbar-hide">
            <div className="w-full px-8 py-8 grid grid-cols-12 gap-8">
              <div className="col-span-12 lg:col-span-9 space-y-8">
                <div className="bg-white rounded-[32px] p-8 border border-slate-200/60 shadow-sm flex items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-20" />
                  {steps.map((step, idx) => (
                    <div key={step.id} className="flex flex-col items-center gap-3 relative z-10">
                      <div className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                        step.status === "complete" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" :
                        step.status === "current" ? "bg-white border-4 border-blue-600 text-blue-600 animate-pulse" :
                        "bg-slate-50 border border-slate-100 text-slate-300"
                      )}>
                        <step.icon className="h-6 w-6" />
                      </div>
                      <div className="text-center">
                        <p className={cn("text-[10px] font-black uppercase tracking-widest", step.status === "upcoming" ? "text-slate-400" : "text-blue-600")}>
                          Passo {idx + 1}
                        </p>
                        <p className={cn("text-[11px] font-bold", step.status === "upcoming" ? "text-slate-400" : "text-slate-700")}>
                          {step.title}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div className="absolute top-[44px] left-[100px] right-[100px] h-[2px] bg-slate-100 -z-0">
                    <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                <Accordion type="single" defaultValue="itens" className="space-y-6">
                  <AccordionItem value="itens" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Package className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">Itens do Pedido</h3>
                            <p className="text-[11px] text-slate-500">Configure produtos, quantidades e descontos.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                        <SalesOrderItemsEditorCard caseId={caseId!} />
                      </AccordionContent>
                    </Card>
                  </AccordionItem>

                  <AccordionItem value="faturamento" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <DollarSign className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">Faturamento e Gestão Financeira</h3>
                            <p className="text-[11px] text-slate-500">Condições de pagamento e dados financeiros.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                        <CaseCustomerDataEditorCard caseId={caseId!} fields={fieldsData} />
                      </AccordionContent>
                    </Card>
                  </AccordionItem>

                  <AccordionItem value="obs" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                            <FileText className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900">Observações</h3>
                            <p className="text-[11px] text-slate-500">Notas internas e avisos.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                         <div className="rounded-3xl border border-slate-100 p-6 bg-slate-50/50 min-h-[100px]">
                            <p className="text-sm text-slate-600 italic">
                              {getField("obs") || "Nenhuma observação informada."}
                            </p>
                         </div>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
                </Accordion>
              </div>

              <div className="col-span-12 lg:col-span-3 space-y-8">
                <Card className="rounded-[32px] p-8 border-none bg-slate-900 text-white shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <Clock className="h-24 w-24" />
                  </div>
                  <div className="space-y-6 relative z-10">
                    <div className="flex items-center gap-3 text-slate-400">
                      <History className="h-4 w-4" />
                      <h4 className="text-[11px] font-black uppercase tracking-widest">Status</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-3xl font-black tracking-tight">{caseData?.state.toUpperCase()}</h2>
                        <Badge className="bg-emerald-500 text-white border-none rounded-lg text-[9px]">ATIVO</Badge>
                      </div>
                    </div>
                    <div className="pt-4 space-y-3">
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                         <span>Progresso</span>
                         <span>{progressPercent}%</span>
                       </div>
                       <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                         <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                       </div>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[40px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Atividade</h4>
                    </div>
                  </div>
                  <ScrollArea className="h-[400px]">
                    <div className="p-8">
                      <CaseTimeline events={timelineQ || []} />
                    </div>
                  </ScrollArea>
                </Card>
              </div>
            </div>
          </main>
        </div>

        <TransitionBlockDialog
          open={transitionBlock.open}
          onOpenChange={(open) => setTransitionBlock(p => ({ ...p, open }))}
          nextStateName={transitionBlock.nextStateName}
          blocks={transitionBlock.reasons}
        />
      </AppShell>
    </RequireAuth>
  );
}

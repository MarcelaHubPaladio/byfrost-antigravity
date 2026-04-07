import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  Package, 
  User, 
  CreditCard, 
  ClipboardList, 
  Calendar, 
  Clock, 
  FileText, 
  DollarSign, 
  MapPin, 
  History, 
  Truck,
  Trash2,
  Users,
  CheckCircle2,
  Smartphone,
  MoreVertical
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { format as dateFnsFormat } from "date-fns";
import { ptBR } from "date-fns/locale";

import { CaseTimeline } from "@/components/case/CaseTimeline";
import { SalesOrderItemsEditorCard } from "@/components/case/SalesOrderItemsEditorCard";
import { CaseCustomerDataEditorCard } from "@/components/case/CaseCustomerDataEditorCard";
import { TransitionBlockDialog } from "@/components/case/TransitionBlockDialog";
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { getStateLabel } from "@/lib/journeyLabels";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";

export default function SalesOrderCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const qc = useQueryClient();
  const [updatingState, setUpdatingState] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transitionBlock, setTransitionBlock] = useState<{
    open: boolean;
    nextStateName: string;
    reasons: TransitionBlockReason[];
  }>({ open: false, nextStateName: "", reasons: [] });

  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId;

  const { data: caseData, isLoading: isLoadingCase } = useQuery({
    queryKey: ["case", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          journey:journeys(*),
          customer:customer_accounts(*),
          assigned_user:users_profile(display_name, email)
        `)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

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
    enabled: !!caseId && !!tenantId,
  });

  const { data: tenantUsers } = useQuery({
    queryKey: ["tenant_users", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data;
    }
  });

  const getField = (key: string) => fieldsData?.find(f => f.key === key)?.value_text;
  
  const customerName = getField("name") || caseData?.customer?.name || "Cliente não identificado";
  const city = getField("city") || getField("cidade") || ""; 
  const saleDate = getField("sale_date") || getField("sale_date_text") || caseData?.created_at;

  const journey = caseData?.journey;
  const stateMachine = journey?.default_state_machine_json;
  
  const states = useMemo(() => {
    const s = stateMachine?.states;
    if (Array.isArray(s)) return s;
    if (s && typeof s === 'object') return Object.keys(s);
    return [];
  }, [stateMachine]);

  const steps = useMemo(() => {
    const currentState = caseData?.state || "";
    const currentIndex = states.indexOf(currentState);
    
    const baseSteps = [
      { id: "captura", title: "Captura", states: ["new", "awaiting_ocr", "awaiting_location"], icon: Smartphone },
      { id: "validacao", title: "Validação", states: ["pending_vendor", "ready_for_review"], icon: ClipboardList },
      { id: "confirmado", title: "Confirmado", states: ["confirmed"], icon: CheckCircle2 },
      { id: "logistica", title: "Logística", states: ["in_separation", "in_route"], icon: Truck },
      { id: "entregue", title: "Entregue", states: ["delivered", "finalized"], icon: Package }
    ];

    return baseSteps.map(step => {
      const stepMaxIndex = Math.max(...step.states.map(s => states.indexOf(s)));
      const isCurrent = step.states.includes(currentState);
      const isComplete = currentIndex > stepMaxIndex;
      
      return {
        ...step,
        status: isCurrent ? "current" : isComplete ? "complete" : "upcoming"
      };
    });
  }, [states, caseData?.state]);

  const updateState = async (nextState: string) => {
    if (!caseId || !tenantId) return;
    try {
      setUpdatingState(true);
      const reasons = await checkTransitionBlocks(
        supabase, 
        tenantId, 
        caseId, 
        caseData?.state || "", 
        nextState, 
        journey?.default_state_machine_json
      );
      if (reasons.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons });
        return;
      }
      const { error } = await supabase
        .from("cases")
        .update({ state: nextState, updated_at: new Date().toISOString() })
        .eq("id", caseId);
      if (error) throw error;
      
      // Audit trail: timeline event
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId,
        event_type: "case_state_changed",
        actor_type: "admin",
        actor_id: sessionUser?.id ?? null,
        message: `Status do pedido alterado para "${getStateLabel(journey, nextState)}".`,
        meta_json: { from: caseData?.state, to: nextState },
        occurred_at: new Date().toISOString(),
      });

      showSuccess(`Status atualizado para ${getStateLabel(journey, nextState)}`);
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar status");
    } finally {
      setUpdatingState(false);
    }
  };

  const assignUser = async (userId: string) => {
    if (!caseId) return;
    try {
      const { error } = await supabase
        .from("cases")
        .update({ assigned_user_id: userId === "unassigned" ? null : userId })
        .eq("id", caseId);
      if (error) throw error;
      
      // Audit trail: timeline event
      const userLabel = tenantUsers?.find(u => u.user_id === userId)?.display_name || userId;
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId!,
        event_type: "case_assigned",
        actor_type: "admin",
        actor_id: sessionUser?.id ?? null,
        message: `Responsável alterado para "${userLabel}".`,
        meta_json: { assigned_user_id: userId },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Responsável atualizado");
      qc.invalidateQueries({ queryKey: ["case", caseId] });
      qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
    } catch (err: any) {
      showError(err.message);
    }
  };

  const deleteCase = async () => {
    if (!caseId) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) throw error;
      showSuccess("Pedido excluído");
      navigate("/app/orders");
    } catch (err: any) {
      showError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const generateShareLink = async () => {
    if (!caseId) return;
    try {
      const shareToken = caseData?.share_token || crypto.randomUUID();
      if (!caseData?.share_token) {
        await supabase.from("cases").update({ share_token: shareToken }).eq("id", caseId);
      }
      const url = `${window.location.origin}/share/order/${shareToken}`;
      await navigator.clipboard.writeText(url);
      showSuccess("Link de compartilhamento copiado!");
    } catch (err: any) {
      showError("Erro ao gerar link");
    }
  };

  const formattedDate = useMemo(() => {
    if (!saleDate) return "Data não inf.";
    try {
      const d = new Date(saleDate);
      return dateFnsFormat(d, "dd 'de' MMM, yyyy", { locale: ptBR });
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
          {/* Header */}
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
                    {caseData?.assigned_user && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="flex items-center gap-1.5 text-blue-500 font-black">
                          <User className="h-3 w-3" /> {caseData.assigned_user.display_name || caseData.assigned_user.email}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* User Assignment */}
                <Select value={caseData?.assigned_user_id || "unassigned"} onValueChange={assignUser}>
                  <SelectTrigger className="h-10 w-[200px] rounded-2xl bg-slate-50/50 border-none shadow-none font-bold text-xs">
                    <Users className="w-4 h-4 mr-2 text-slate-400" />
                    <SelectValue placeholder="Responsável..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-slate-200">
                    <SelectItem value="unassigned" className="font-bold text-xs">Sem responsável</SelectItem>
                    {tenantUsers?.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id} className="font-bold text-xs">
                        {u.display_name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="h-8 w-px bg-slate-100 mx-1" />

                {/* State Transition Select */}
                <Select value={caseData?.state} onValueChange={updateState} disabled={updatingState}>
                  <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-blue-600 border-none shadow-lg shadow-blue-600/20 font-black text-[10px] uppercase tracking-widest px-4 text-white hover:bg-blue-700 transition-colors">
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

                <div className="h-8 w-px bg-slate-100 mx-1" />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-slate-100">
                      <MoreVertical className="h-5 w-5 text-slate-400" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl border-slate-200 w-48 p-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="rounded-xl font-bold text-xs h-10 gap-3 cursor-pointer text-red-600 hover:text-red-700 !bg-red-50/0 hover:!bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" /> Excluir Pedido
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[32px]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir este pedido?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. Todos os dados deste pedido, incluindo itens e histórico, serão removidos permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-2xl">Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={deleteCase} className="rounded-2xl bg-red-600 hover:bg-red-700">
                            Excluir Definitivamente
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <main className="flex-grow overflow-auto scrollbar-hide">
            <div className="w-full px-8 py-8 grid grid-cols-12 gap-8">
              {/* Central Section */}
              <div className="col-span-12 lg:col-span-9 space-y-8">
                {/* Steps Visualizer */}
                <div className="bg-white rounded-[32px] p-8 border border-slate-200/60 shadow-sm flex items-center justify-between relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-20" />
                  {steps.map((step, idx) => (
                    <div key={step.id} className="flex flex-col items-center gap-3 relative z-10 flex-1">
                      <div className={cn(
                        "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                        step.status === "complete" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" :
                        step.status === "current" ? "bg-white border-4 border-blue-600 text-blue-600 animate-pulse" :
                        "bg-slate-50 border border-slate-100 text-slate-300"
                      )}>
                        {step.status === "complete" ? <CheckCircle2 className="h-6 w-6" /> : <step.icon className="h-6 w-6" />}
                      </div>
                      <div className="text-center">
                        <p className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", step.status === "upcoming" ? "text-slate-300" : "text-blue-600")}>
                          Etapa {idx + 1}
                        </p>
                        <p className={cn("text-[11px] font-bold tracking-tight", step.status === "upcoming" ? "text-slate-400" : "text-slate-800")}>
                          {step.title}
                        </p>
                      </div>
                      {/* Connector Line between icons */}
                      {idx < steps.length - 1 && (
                        <div className="absolute top-[28px] left-[calc(50%+40px)] w-[calc(100%-80px)] h-[2px] bg-slate-100 -z-0">
                          <div className={cn(
                            "h-full bg-emerald-500 transition-all duration-1000",
                            step.status === "complete" ? "w-full" : "w-0"
                          )} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Accordion type="single" collapsible defaultValue="itens" className="space-y-6">
                  {/* Items Card */}
                  <AccordionItem value="itens" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm transition-all hover:shadow-md">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            <Package className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900 tracking-tight">Itens do Pedido</h3>
                            <p className="text-[11px] text-slate-500 font-medium">Configure produtos, quantidades e descontos.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                        <SalesOrderItemsEditorCard caseId={caseId!} />
                      </AccordionContent>
                    </Card>
                  </AccordionItem>

                  {/* Financial/Customer Card */}
                  <AccordionItem value="faturamento" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm transition-all hover:shadow-md">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                            <DollarSign className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900 tracking-tight">Faturamento e Cadastro</h3>
                            <p className="text-[11px] text-slate-500 font-medium">Dados do cliente, endereço e condições de pagamento.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                        <CaseCustomerDataEditorCard caseId={caseId!} fields={fieldsData} />
                      </AccordionContent>
                    </Card>
                  </AccordionItem>

                  {/* Observations */}
                  <AccordionItem value="obs" className="border-none">
                    <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm transition-all hover:shadow-md">
                      <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                        <div className="flex items-center gap-4 text-left">
                          <div className="h-12 w-12 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
                            <FileText className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-slate-900 tracking-tight">Observações</h3>
                            <p className="text-[11px] text-slate-500 font-medium">Notas internas e avisos para logística.</p>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                         <div className="rounded-3xl border border-slate-100 p-6 bg-slate-50/50 min-h-[100px]">
                            <p className="text-sm text-slate-600 italic leading-relaxed">
                              {getField("obs") || getField("observacoes") || "Nenhuma observação informada."}
                            </p>
                         </div>
                      </AccordionContent>
                    </Card>
                  </AccordionItem>
                </Accordion>
              </div>

              {/* Sidebar */}
              <div className="col-span-12 lg:col-span-3 space-y-8">
                {/* Status Indicator */}
                <Card className="rounded-[32px] p-8 border-none bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Clock className="h-24 w-24" />
                  </div>
                  <div className="space-y-6 relative z-10">
                    <div className="flex items-center gap-3 text-slate-400">
                      <History className="h-4 w-4" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest">Status Atual</h4>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-black tracking-tight">{getStateLabel(journey, caseData?.state || "").toUpperCase()}</h2>
                        <Badge className="bg-blue-500 text-white border-none rounded-lg text-[9px] font-bold">EM ANDAMENTO</Badge>
                      </div>
                    </div>
                    <div className="pt-4 space-y-3">
                       <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                         <span>Progresso do Fluxo</span>
                         <span>{progressPercent}%</span>
                       </div>
                       <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                         <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
                       </div>
                    </div>
                  </div>
                </Card>

                {/* Activity Feed */}
                <Card className="rounded-[32px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
                  <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Clock className="h-4 w-4 text-orange-500" />
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Atividade</h4>
                    </div>
                  </div>
                  <ScrollArea className="h-[450px]">
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

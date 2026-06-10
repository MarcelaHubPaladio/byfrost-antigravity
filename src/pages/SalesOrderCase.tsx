import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Banknote, Calendar, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, CreditCard, DollarSign, Eye, FileText, History, MapPin, MoreVertical, Package, Plus, Save, Smartphone, Trash2, Truck, User, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { SalesOrderReviewDialog } from "@/components/case/SalesOrderReviewDialog";
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
import { SalesOrderSimpleUploadDialog } from "@/components/case/SalesOrderSimpleUploadDialog";
import { checkTransitionBlocks, TransitionBlockReason } from "@/lib/journeys/validation";
import { getStateLabel } from "@/lib/journeyLabels";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";
import { useJourneyTransition } from "@/hooks/useJourneyTransition";
import { handleOrderStateTransition } from "@/utils/inventorySync";
import { UsersRound, RefreshCw } from "lucide-react";
import { CaseUpdatesCard } from "@/components/case/CaseUpdatesCard";

export default function SalesOrderCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const qc = useQueryClient();
  const [updatingState, setUpdatingState] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { transitionState, updating: transitioning } = useJourneyTransition();

  // Review Dialog State
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState<any>(null);
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
          assigned_user:users_profile(display_name, email),
          assigned_vendor:vendors!cases_assigned_vendor_id_fkey(id, display_name, phone_e164)
        `)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

  const { data: timelineQ, refetch: refetchTimeline } = useQuery({
    queryKey: ["case_timeline", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
    enabled: !!tenantId && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("user_id, display_name, email")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Enriquece os eventos da timeline com o nome do ator resolvido via tenantUsers
  const timelineEvents = useMemo(() => {
    if (!timelineQ) return [];
    return timelineQ.map((e: any) => {
      const actorUser = tenantUsers?.find(u => u.user_id === e.actor_id);
      return {
        ...e,
        actor_name: actorUser?.display_name || actorUser?.email || null,
      };
    });
  }, [timelineQ, tenantUsers]);

  const { data: vendors } = useQuery({
    queryKey: ["vendors", tenantId],
    enabled: !!tenantId && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id, display_name, phone_e164")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const projetistasQ = useQuery({
    queryKey: ["projetistas", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("core_entities")
        .select("id, display_name")
        .eq("tenant_id", tenantId!)
        .eq("entity_type", "projetista")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });
  
  const { data: pendenciesData, isLoading: isLoadingPendencies } = useQuery({
    queryKey: ["case_pendencies", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencies")
        .select("*")
        .eq("case_id", caseId);
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
  });

  const { data: attachmentsData } = useQuery({
    queryKey: ["case_attachments", caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_attachments")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!caseId,
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
      const isSalesOrder = journey?.key === "sales_order";
      const reasons = isSalesOrder ? [] : await checkTransitionBlocks(
        supabase, 
        tenantId, 
        caseId, 
        caseData?.state || "", 
        nextState, 
        journey?.default_state_machine_json,
        { fields: fieldsData, pendencies: pendenciesData }
      );
      if (reasons.length > 0) {
        setTransitionBlock({ open: true, nextStateName: nextState, reasons });
        return;
      }
      
      // Sincroniza o estoque na transição de etapa (reserva/devolve estoque)
      await handleOrderStateTransition(caseId, caseData?.state || "", nextState, sessionUser?.id || "");

      await transitionState(caseId, caseData?.state, nextState, journey?.default_state_machine_json);
      
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      await qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
      await qc.refetchQueries({ queryKey: ["case", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar status");
    } finally {
      setUpdatingState(false);
    }
  };

  const assignVendor = async (vendorId: string) => {
    if (!caseId || !tenantId) return;
    try {
      const selectedVendor = vendors?.find(v => v.id === vendorId);
      let matchedUserId = null;
      if (selectedVendor && tenantUsers) {
        const uMatch = tenantUsers.find(u => 
          (u.display_name && u.display_name === selectedVendor.display_name) ||
          (u.phone_e164 && u.phone_e164 === selectedVendor.phone_e164)
        );
        if (uMatch) matchedUserId = uMatch.user_id;
      }

      const { error } = await supabase
        .from("cases")
        .update({ 
          assigned_vendor_id: vendorId === "unassigned" ? null : vendorId,
          assigned_user_id: matchedUserId || (vendorId === "unassigned" ? null : undefined) // only overwrite if we found a match or if unassigning
        })
        .eq("id", caseId);
      if (error) throw error;
      
      // Audit trail
      const vendorLabel = vendors?.find(v => v.id === vendorId)?.display_name || vendorId;
      await supabase.from("timeline_events").insert({
        tenant_id: tenantId,
        case_id: caseId!,
        event_type: "case_assigned_vendor",
        actor_type: "admin",
        actor_id: sessionUser?.id ?? null,
        message: `Vendedor comercial alterado para "${vendorLabel}".`,
        meta_json: { assigned_vendor_id: vendorId },
        occurred_at: new Date().toISOString(),
      });

      showSuccess("Vendedor comercial atualizado");
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      await qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
      await qc.refetchQueries({ queryKey: ["case", caseId] });
    } catch (err: any) {
      showError(err.message);
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
      await qc.invalidateQueries({ queryKey: ["case", caseId] });
      await qc.invalidateQueries({ queryKey: ["case_timeline", caseId] });
      await qc.refetchQueries({ queryKey: ["case", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar responsável");
    }
  };

  const assignProjetista = async (projetistaId: string) => {
    if (!caseId || !tenantId) return;
    try {
      const { error } = await supabase
        .from("case_fields")
        .upsert({
          case_id: caseId,
          key: "projetista_entity_id",
          value_text: projetistaId === "unassigned" ? "" : projetistaId,
          confidence: 1,
          source: "admin",
          last_updated_by: sessionUser?.id || "admin"
        }, { onConflict: "case_id,key" });
      
      if (error) throw error;
      showSuccess("Projetista atualizado!");
      qc.invalidateQueries({ queryKey: ["case_fields", caseId] });
    } catch (err: any) {
      showError(err.message || "Erro ao atualizar projetista");
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

  const currentPendencies = useMemo(() => {
    if (!caseData?.state || !stateMachine || !tenantId || !caseId) return [];
    if (journey?.key === "sales_order") return [];
    
    // Find possible next states from current state
    const statesConfig = stateMachine.status_configs || {};
    const currentStateConfig = statesConfig[caseData.state] || {};
    const nextStates = Array.isArray(currentStateConfig.next_states) ? currentStateConfig.next_states : [];
    
    if (nextStates.length === 0) return [];
    
    // We check for the first possible next state to show as "Immediate requirements"
    // This is a simplification but covers the user request of "what's missing"
    const nextState = nextStates[0];
    
    const reasons: TransitionBlockReason[] = [];
    
    // Check required fields
    const configForNext = statesConfig[nextState] || {};
    const requiredFields = Array.isArray(configForNext.required_case_fields) ? configForNext.required_case_fields : [];
    const missingFields = requiredFields.filter((reqKey: string) => {
      const field = (fieldsData || []).find((f: any) => f.key === reqKey);
      const val = typeof field?.value_text === "string" ? field.value_text.trim() : "";
      return !val;
    });
    
    if (missingFields.length > 0) {
      reasons.push({ type: "missing_fields", fields: missingFields });
    }
    
    // Check mandatory tasks for CURRENT state
    const mandatoryTasks = Array.isArray(currentStateConfig.mandatory_tasks) ? currentStateConfig.mandatory_tasks : [];
    const openTasks = (pendenciesData || []).filter((p: any) => {
      const isMandatory = mandatoryTasks.some((mt: any) => mt.type === p.type || mt.description === p.question_text);
      return isMandatory && p.required && p.status === "open";
    });
    
    if (openTasks.length > 0) {
      reasons.push({ type: "open_pendencies", missingTypes: openTasks.map((p: any) => p.question_text || p.type) });
    }
    
    return reasons;
  }, [caseData?.state, stateMachine, fieldsData, pendenciesData]);

  const formattedDate = useMemo(() => {
    if (!saleDate) return "Data não inf.";
    try {
      let d: Date;
      if (typeof saleDate === 'string' && saleDate.includes('/')) {
        const [day, month, year] = saleDate.split('/').map(Number);
        d = new Date(year, month - 1, day);
      } else {
        d = new Date(saleDate);
      }
      if (isNaN(d.getTime())) throw new Error();
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
                        <span className="flex items-center gap-1.5 text-blue-500 font-black" title="Responsável Atual">
                          <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-blue-100 text-[8px] font-black text-blue-700">R</div>
                          {caseData.assigned_user.display_name || caseData.assigned_user.email}
                        </span>
                      </>
                    )}
                    {caseData?.assigned_vendor && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="flex items-center gap-1.5 text-emerald-600 font-black" title="Vendedor Comercial">
                          <div className="flex h-3.5 w-3.5 items-center justify-center rounded bg-emerald-100 text-[8px] font-black text-emerald-700">V</div>
                          {caseData.assigned_vendor.display_name || caseData.assigned_vendor.phone_e164}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Responsável Atual</span>
                  <Select value={caseData?.assigned_user_id || "unassigned"} onValueChange={assignUser}>
                    <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white border-slate-200 shadow-sm font-bold text-xs">
                      <div className="flex h-4 w-4 mr-2 items-center justify-center rounded bg-blue-100 text-[9px] font-black text-blue-700">R</div>
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
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Vendedor Comercial</span>
                  <Select value={caseData?.assigned_vendor_id || "unassigned"} onValueChange={assignVendor}>
                    <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white border-slate-200 shadow-sm font-bold text-xs">
                      <div className="flex h-4 w-4 mr-2 items-center justify-center rounded bg-emerald-100 text-[9px] font-black text-emerald-700">V</div>
                      <SelectValue placeholder="Vendedor..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-slate-200">
                      <SelectItem value="unassigned" className="font-bold text-xs">Sem vendedor</SelectItem>
                      {vendors?.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="font-bold text-xs">
                          {v.display_name || v.phone_e164}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Projetista</span>
                  <Select value={getField("projetista_entity_id") || "unassigned"} onValueChange={assignProjetista}>
                    <SelectTrigger className="h-10 w-[180px] rounded-2xl bg-white border-slate-200 shadow-sm font-bold text-xs">
                      <div className="flex h-4 w-4 mr-2 items-center justify-center rounded bg-indigo-100 text-[9px] font-black text-indigo-700">P</div>
                      <SelectValue placeholder="Projetista..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl border-slate-200">
                      <SelectItem value="unassigned" className="font-bold text-xs">Sem projetista</SelectItem>
                      {projetistasQ.data?.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="font-bold text-xs">
                          {p.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="h-8 w-px bg-slate-100 mx-1" />

                {/* State Transition Select */}
                <Select value={caseData?.state?.toLowerCase()} onValueChange={updateState} disabled={updatingState}>
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
            <div className="w-full px-8 py-8 flex flex-col gap-8">
              
              {/* Stepper - Journey Progress */}
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

              {/* Journey Pendencies / Diagnostic */}
              {currentPendencies.length > 0 && (
                <Alert className="bg-amber-50/80 backdrop-blur-sm border-amber-200/60 rounded-[32px] p-6 shadow-sm">
                  <div className="flex gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                    <div className="space-y-2">
                      <AlertTitle className="text-amber-900 font-black text-sm uppercase tracking-wider mb-1">
                        Ações recomendadas para avançar
                      </AlertTitle>
                      <AlertDescription className="text-amber-800 space-y-3">
                        <p className="text-[13px] font-medium leading-relaxed opacity-80">Detectamos itens obrigatórios que precisam de atenção para que este pedido possa prosseguir para a próxima etapa:</p>
                        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
                          {currentPendencies.map((p, i) => {
                            if (p.type === "missing_fields") {
                              return p.fields.map((f: string) => (
                                <div key={f} className="flex items-center gap-3 text-[12px] font-bold">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  <span className="opacity-60 uppercase tracking-tight">Campo faltante:</span>
                                  <span className="text-amber-900 underline decoration-amber-300 underline-offset-4">{f}</span>
                                </div>
                              ));
                            }
                            if (p.type === "open_pendencies") {
                              return p.missingTypes.map((t: string) => (
                                <div key={t} className="flex items-center gap-3 text-[12px] font-bold">
                                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  <span className="opacity-60 uppercase tracking-tight">Tarefa obrigatória:</span>
                                  <span className="text-amber-900 italic font-medium">{t}</span>
                                </div>
                              ));
                            }
                            return null;
                          })}
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              )}

              <div className="grid grid-cols-12 gap-8">
                {/* Central Section */}
                <div className="col-span-12 lg:col-span-9 space-y-8">
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
                          <SalesOrderItemsEditorCard caseId={caseId!} fields={fieldsData} />

                          <div className="mt-8 pt-8 border-t border-slate-100">
                            <div className="flex items-center justify-between gap-2 mb-4">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-slate-400" />
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Anexos do Pedido</h4>
                              </div>
                              <SalesOrderSimpleUploadDialog 
                                tenantId={tenantId!}
                                caseId={caseId!}
                              />
                            </div>
                            
                            {attachmentsData && attachmentsData.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {attachmentsData.map((a: any) => (
                                <div 
                                  key={a.id} 
                                  className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 hover:bg-white hover:shadow-sm transition-all group cursor-pointer"
                                >
                                  <div 
                                    className="flex-1 flex items-center gap-3 min-w-0"
                                    onClick={() => {
                                      setSelectedAttachment(a);
                                      setReviewOpen(true);
                                    }}
                                  >
                                    <div className={cn(
                                      "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                                      (a.meta_json?.kind === "order" || a.kind === "order") ? "bg-blue-100 text-blue-600" : "bg-indigo-100 text-indigo-600"
                                    )}>
                                      <FileText className="h-5 w-5" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">
                                        {a.original_filename || "Arquivo"}
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                                        {(a.meta_json?.kind === "order" || a.kind === "order") ? "Pedido Principal" : "Documento"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm("Deseja realmente excluir este anexo?")) {
                                          supabase.from("case_attachments").delete().eq("id", a.id)
                                            .then(({ error }) => {
                                              if (error) showError("Erro ao excluir");
                                              else {
                                                showSuccess("Anexo excluído");
                                                qc.invalidateQueries({ queryKey: ["case_attachments", caseId] });
                                              }
                                            });
                                        }
                                      }}
                                      className="h-8 w-8 rounded-full bg-white border border-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-100 hover:text-red-500 text-slate-400"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                    <div 
                                      onClick={() => {
                                        setReviewImageUrl(a.storage_path);
                                        setReviewOpen(true);
                                      }}
                                      className="h-8 w-8 rounded-full bg-white border border-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <Eye className="h-3.5 w-3.5 text-slate-400" />
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                                  </div>
                                </div>
                                ))}
                              </div>
                            ) : (
                              <div className="py-4 px-6 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200 text-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nenhum anexo encontrado</p>
                              </div>
                            )}
                          </div>
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

                    {/* Updates (Atualizações) */}
                    <AccordionItem value="updates" className="border-none">
                      <Card className="rounded-[40px] overflow-hidden border-none bg-white shadow-sm transition-all hover:shadow-md">
                        <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 [&[data-state=open]]:bg-slate-50">
                          <div className="flex items-center gap-4 text-left">
                            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                              <RefreshCw className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="text-base font-black text-slate-900 tracking-tight">Atualizações</h3>
                              <p className="text-[11px] text-slate-500 font-medium">Histórico de faturamento, projeto, rota e expedição.</p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                          <CaseUpdatesCard caseId={caseId!} tenantId={tenantId!} />
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
                      <CaseTimeline events={timelineEvents} />
                    </div>
                  </ScrollArea>
                </Card>
              </div>
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

        {/* Review Dialog */}
        <SalesOrderReviewDialog 
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          caseId={caseId!}
          imageUrl={selectedAttachment?.storage_path || null}
          contentType={selectedAttachment?.content_type || null}
          filename={selectedAttachment?.original_filename || null}
          fields={fieldsData}
        />
      </AppShell>
    </RequireAuth>
  );
}

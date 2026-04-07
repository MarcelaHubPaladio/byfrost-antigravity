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
import { showError, showSuccess } from "@/utils/toast";

export default function SalesOrderCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const qc = useQueryClient();
  const [activeStep, setActiveStep] = useState<string>("itens");

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

  // Calculate some display values
  const getField = (key: string) => fieldsData?.find(f => f.key === key)?.value_text;
  
  const customerName = getField("name") || caseData?.customer?.name || "Cliente não identificado";
  const city = getField("city") || "Curitiba - PR"; // Default mockup if not found
  const orderValue = fieldsData?.find(f => f.key === "total_value")?.value_number || 0;
  const saleDate = getField("sale_date") || getField("sale_date_text") || caseData?.created_at;

  const steps = [
    { id: "dados", title: "Dados do Pedido", icon: ClipboardList, status: "complete" },
    { id: "itens", title: "Itens e Quantidades", icon: Package, status: "current" },
    { id: "faturamento", title: "Faturamento e Pagamento", icon: CreditCard, status: "upcoming" },
    { id: "entrega", title: "Logística e Entrega", icon: Truck, status: "upcoming" },
  ];

  if (isLoadingCase || isLoadingFields) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      {/* Premium Header with Glassmorphism */}
      <div className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/60 transition-all duration-300">
        <div className="w-full px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-2xl hover:bg-slate-100/80 transition-all"
              onClick={() => navigate("/app/orders")}
            >
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </Button>
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
                  <MapPin className="h-3 w-3" /> {city}
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" /> {saleDate ? format(new Date(saleDate), "dd 'de' MMM, yyyy", { locale: ptBR }) : "Data não inf."}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 mr-4">
              <div className="h-8 w-8 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center overflow-hidden">
                <User className="h-4 w-4 text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-grow overflow-auto scrollbar-hide">
        <div className="w-full px-12 py-10 grid grid-cols-12 gap-10">
          
          {/* Central Section (9 columns) */}
          <div className="col-span-12 lg:col-span-9 space-y-8">
            
            {/* Step Progress Visualizer */}
            <div className="bg-white rounded-[32px] p-8 border border-slate-200/60 shadow-sm flex items-center justify-between relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-600 opacity-20" />
              <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-blue-50/50 to-transparent pointer-events-none" />
              
              {steps.map((step, idx) => (
                <div key={step.id} className="flex flex-col items-center gap-3 relative z-10">
                  <div 
                    className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500",
                      step.status === "complete" ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" :
                      step.status === "current" ? "bg-white border-4 border-blue-600 text-blue-600 animate-pulse" :
                      "bg-slate-50 border border-slate-100 text-slate-300"
                    )}
                  >
                    <step.icon className="h-6 w-6" />
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className={cn(
                      "text-[10px] font-black uppercase tracking-widest",
                      step.status === "complete" ? "text-blue-600" :
                      step.status === "current" ? "text-slate-900" : "text-slate-400"
                    )}>
                      Passo {idx + 1}
                    </p>
                    <p className={cn(
                      "text-[11px] font-bold",
                      step.status === "upcoming" ? "text-slate-400" : "text-slate-700"
                    )}>
                      {step.title}
                    </p>
                  </div>
                </div>
              ))}

              {/* Connecting Lines */}
              <div className="absolute top-[44px] left-[100px] right-[100px] h-[2px] bg-slate-100 -z-0">
                <div 
                  className="h-full bg-blue-600 transition-all duration-1000" 
                  style={{ width: "33%" }} 
                />
              </div>
            </div>

            {/* Main Accordion Flow */}
            <Accordion type="single" defaultValue="itens" className="space-y-6">
              
              <AccordionItem value="itens" className="border-none">
                <Card className="rounded-[40px] overflow-hidden border-slate-200/60 shadow-sm border-none bg-white">
                  <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 transition-all [&[data-state=open]]:bg-slate-50">
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
                    <div className="space-y-6">
                       <SalesOrderItemsEditorCard caseId={caseId!} />
                    </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>

              <AccordionItem value="faturamento" className="border-none">
                <Card className="rounded-[40px] overflow-hidden border-slate-200/60 shadow-sm border-none bg-white">
                  <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 transition-all [&[data-state=open]]:bg-slate-50">
                    <div className="flex items-center gap-4 text-left">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <DollarSign className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight">Faturamento e Gestão Financeira</h3>
                        <p className="text-[11px] text-slate-500 font-medium">Condições de pagamento, sinal e dados bancários.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                    <CaseCustomerDataEditorCard caseId={caseId!} fields={fieldsData} />
                  </AccordionContent>
                </Card>
              </AccordionItem>

              <AccordionItem value="obs" className="border-none">
                <Card className="rounded-[40px] overflow-hidden border-slate-200/60 shadow-sm border-none bg-white">
                  <AccordionTrigger className="px-8 py-6 hover:no-underline hover:bg-slate-50 transition-all [&[data-state=open]]:bg-slate-50">
                    <div className="flex items-center gap-4 text-left">
                      <div className="h-12 w-12 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight">Observações Adicionais</h3>
                        <p className="text-[11px] text-slate-500 font-medium">Notas internas e avisos de logística.</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-8 border-t border-slate-100 pt-8">
                     <div className="rounded-3xl border border-slate-100 p-6 bg-slate-50/50 min-h-[120px]">
                        <p className="text-sm text-slate-600 leading-relaxed italic">
                          {getField("obs") || "Nenhuma observação informada."}
                        </p>
                     </div>
                  </AccordionContent>
                </Card>
              </AccordionItem>

            </Accordion>
          </div>

          {/* Right Sidebar (3 columns) */}
          <div className="col-span-12 lg:col-span-3 space-y-8">
            
            {/* Status Card */}
            <Card className="rounded-[32px] p-8 border-none bg-slate-900 text-white shadow-xl shadow-slate-900/10 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Clock className="h-24 w-24" />
              </div>
              <div className="space-y-6 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/10 flex items-center justify-center">
                    <History className="h-5 w-5 text-blue-400" />
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Status do Processo</h4>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-black tracking-tight">{caseData?.state.toUpperCase()}</h2>
                    <Badge className="bg-emerald-500 text-white border-none rounded-lg h-6 px-2 text-[9px] font-black uppercase">Ativo</Badge>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">Entrou nesta etapa há 2 horas.</p>
                </div>

                <div className="pt-4 space-y-3">
                   <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                     <span>Progresso Geral</span>
                     <span>65%</span>
                   </div>
                   <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                     <div className="h-full bg-blue-500 w-[65%]" />
                   </div>
                </div>
              </div>
            </Card>

            {/* Timeline Widget */}
            <Card className="rounded-[40px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
              <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                    <Clock className="h-4 w-4" />
                  </div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Atividade</h4>
                </div>
                <Button variant="ghost" size="sm" className="h-8 text-[9px] font-black text-slate-400 hover:text-slate-600 px-3">VER TUDO</Button>
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
  );
}

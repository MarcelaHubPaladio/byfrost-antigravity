import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronLeft, 
  History, 
  Clock, 
  User, 
  Trash2, 
  MoreVertical,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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

import { CaseTimeline } from "@/components/case/CaseTimeline";
import { ClientDataEditorCard } from "@/components/clientes_sawe/ClientDataEditorCard";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { useTenant } from "@/providers/TenantProvider";
import { showError, showSuccess } from "@/utils/toast";

export default function ClientesSaweCase() {
  const { id: caseId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: sessionUser } = useSession();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [deleting, setDeleting] = useState(false);

  const { data: caseData, isLoading: isLoadingCase } = useQuery({
    queryKey: ["case", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select(`
          *,
          journey:journeys(*)
        `)
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: timelineEvents } = useQuery({
    queryKey: ["case_timeline", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("*")
        .eq("case_id", caseId)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: fieldsData, isLoading: isLoadingFields } = useQuery({
    queryKey: ["case_fields", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_fields")
        .select("*")
        .eq("case_id", caseId);
      if (error) throw error;
      return data;
    },
  });

  const deleteCase = async () => {
    if (!caseId) return;
    try {
      setDeleting(true);
      const { error } = await supabase.from("cases").delete().eq("id", caseId);
      if (error) throw error;
      showSuccess("Cliente excluído");
      navigate("/app/clientes-sawe");
    } catch (err: any) {
      showError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoadingCase || isLoadingFields) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="p-8 space-y-6 bg-slate-50 min-h-screen">
            <Skeleton className="h-12 w-1/3 rounded-2xl" />
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-8 space-y-4">
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

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col h-full bg-[#F8FAFC]">
          {/* Header */}
          <div className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-xl border-b border-slate-200/60 transition-all duration-300">
            <div className="w-full px-8 h-20 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Link to="/app/clientes-sawe">
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-slate-100/80">
                    <ChevronLeft className="h-5 w-5 text-slate-600" />
                  </Button>
                </Link>
                <div className="h-8 w-px bg-slate-200/60" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 tracking-tight">
                      {caseData?.title?.toUpperCase() || "CLIENTE"}
                    </h1>
                    <Badge className="bg-blue-50 text-blue-600 border-blue-100 rounded-lg text-[10px] font-black tracking-widest px-2 py-0.5 h-auto">
                      JORNADA SAWE
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> Criado em {new Date(caseData?.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
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
                          <Trash2 className="w-4 h-4" /> Excluir Cliente
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[32px]">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir este cliente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação removerá permanentemente todos os dados e histórico deste cliente na jornada SAWE.
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

          <main className="flex-grow overflow-auto">
            <div className="w-full px-8 py-8 flex flex-col gap-8">
              <div className="grid grid-cols-12 gap-8">
                {/* Central Section */}
                <div className="col-span-12 lg:col-span-8 space-y-8">
                  <ClientDataEditorCard caseId={caseId!} fields={fieldsData} />
                </div>

                {/* Sidebar */}
                <div className="col-span-12 lg:col-span-4 space-y-8">
                  {/* Quick Info */}
                  <Card className="rounded-[32px] p-8 border-none bg-slate-900 text-white shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Activity className="h-24 w-24" />
                    </div>
                    <div className="space-y-6 relative z-10">
                      <div className="flex items-center gap-3 text-slate-400">
                        <History className="h-4 w-4" />
                        <h4 className="text-[10px] font-black uppercase tracking-widest">Resumo da Jornada</h4>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tight">STATUS ATIVO</h2>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente monitorado pela linha do tempo</p>
                      </div>
                    </div>
                  </Card>

                  {/* Activity Feed */}
                  <Card className="rounded-[32px] border-slate-200/60 shadow-sm overflow-hidden bg-white">
                    <div className="p-8 border-b border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4 text-blue-500" />
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Linha do Tempo</h4>
                      </div>
                    </div>
                    <ScrollArea className="h-[600px]">
                      <div className="p-8">
                        <CaseTimeline events={timelineEvents || []} />
                      </div>
                    </ScrollArea>
                  </Card>
                </div>
              </div>
            </div>
          </main>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

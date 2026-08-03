import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, SUPABASE_URL_IN_USE } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { Loader2, ExternalLink, Plus, Trash2, FileText, Target, ListTodo, Handshake, Upload, Zap, BrainCircuit, ExternalLinkIcon, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { showError, showSuccess } from "@/utils/toast";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

import { WeeklyTaskCalendar } from "./WeeklyTaskCalendar";

export function MySummaryTab() {
  const { activeTenantId } = useTenant();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const nav = useNavigate();

  if (!activeTenantId || !user) return null;

  // 2. METAS
  const goalsQ = useQuery({
    queryKey: ["my_goals", activeTenantId, user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .eq("user_id", user.id);
      if (error) throw error;
      return data;
    },
  });

  // 3. FOLHA E PONTO (apenas folha por enquanto)
  const payslipsQ = useQuery({
    queryKey: ["my_payslips", activeTenantId, user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_payslips")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .eq("user_id", user.id)
        .order("reference_year", { ascending: false })
        .order("reference_month", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  // 4. ACESSOS RÁPIDOS
  const linksQ = useQuery({
    queryKey: ["my_quick_links", activeTenantId, user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_links")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [newLink, setNewLink] = useState({ title: "", url: "" });

  const handleViewPdf = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage.from("employee_documents").createSignedUrl(filePath, 60 * 60);
      if (error) throw error;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank');
      }
    } catch (err) {
      showError("Erro ao abrir o PDF");
    }
  };
  
  const openNewLinkModal = () => {
    setEditingLinkId(null);
    setLinkTitle("");
    setLinkUrl("");
    setIsLinkModalOpen(true);
  };

  const openEditLinkModal = (link: any) => {
    setEditingLinkId(link.id);
    setLinkTitle(link.title);
    setLinkUrl(link.url);
    setIsLinkModalOpen(true);
  };

  const saveLink = async () => {
    if (!linkTitle || !linkUrl) return;
    try {
      if (editingLinkId) {
        await supabase.from("quick_links").update({
          title: linkTitle,
          url: linkUrl,
        }).eq("id", editingLinkId);
        showSuccess("Link atualizado");
      } else {
        await supabase.from("quick_links").insert({
          tenant_id: activeTenantId,
          user_id: user.id,
          title: linkTitle,
          url: linkUrl,
        });
        showSuccess("Link adicionado");
      }
      setIsLinkModalOpen(false);
      setEditingLinkId(null);
      setLinkTitle("");
      setLinkUrl("");
      queryClient.invalidateQueries({ queryKey: ["my_quick_links"] });
    } catch (e: any) {
      showError(e.message);
    }
  };

  const removeLink = async (id: string) => {
    try {
      await supabase.from("quick_links").delete().eq("id", id);
      queryClient.invalidateQueries({ queryKey: ["my_quick_links"] });
    } catch (e: any) {
      showError(e.message);
    }
  };

  // 5. DISC E PERFIL
  const profileQ = useQuery({
    queryKey: ["my_profile_disc", activeTenantId, user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("disc_profile")
        .eq("tenant_id", activeTenantId)
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });



  const discHistory = Array.isArray(profileQ.data?.disc_profile)
      ? profileQ.data.disc_profile
      : (profileQ.data?.disc_profile && Object.keys(profileQ.data.disc_profile).length > 0)
          ? [profileQ.data.disc_profile]
          : [];
          
  const latestDiscProfile = [...discHistory].sort((a, b) => {
      if (a.created_at && b.created_at) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
  })[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
        {/* TAREFAS & COMBINADOS (Componente Novo) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-3">
          <WeeklyTaskCalendar tenantId={activeTenantId} userId={user.id} />
        </div>

        {/* ACESSOS RÁPIDOS */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Zap className="h-5 w-5" />
              </div>
              <h3 className="font-bold text-lg text-slate-800">Acessos Rápidos</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={openNewLinkModal}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {linksQ.isLoading ? (
              <div className="col-span-2 flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : linksQ.data?.length === 0 ? (
              <p className="col-span-2 text-sm text-slate-500 text-center py-4">Nenhum link salvo.</p>
            ) : (
              linksQ.data?.map(link => (
                <div key={link.id} className="group relative flex flex-col justify-center p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all bg-slate-50/50 min-h-[90px]">
                  <a href={link.url} target="_blank" rel="noreferrer" className="flex flex-col items-start gap-2 flex-1 w-full text-sm font-medium text-slate-700 hover:text-emerald-700">
                    <div className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center border border-slate-100 group-hover:border-emerald-200 transition-colors">
                      <ExternalLinkIcon className="h-3.5 w-3.5 text-slate-500 group-hover:text-emerald-600" />
                    </div>
                    <span className="truncate w-full">{link.title}</span>
                  </a>
                  <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-slate-100">
                    <button onClick={(e) => { e.preventDefault(); openEditLinkModal(link); }} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.preventDefault(); removeLink(link.id); }} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* METAS */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Target className="h-5 w-5" />
            </div>
            <h3 className="font-bold text-lg text-slate-800">Minhas Metas</h3>
          </div>

          <div className="space-y-3">
            {goalsQ.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
            ) : goalsQ.data?.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Nenhuma meta configurada.</p>
            ) : (
              goalsQ.data?.map(goal => (
                <div key={goal.id} className="flex justify-between items-center p-4 rounded-2xl bg-slate-50 border border-slate-100">
                  <div>
                    <h4 className="font-semibold text-slate-800">{goal.name}</h4>
                    <p className="text-xs text-slate-500">Chave: {goal.metric_key}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-rose-600">
                      {goal.target_type === 'money' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(goal.target_value) : goal.target_value}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-widest">{goal.frequency}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* PERFIL DISC & FOLHA (Misto de Cards Menores) */}
        <div className="space-y-6">
          
          {/* DISC */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <BrainCircuit className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-800">Perfil DISC</h3>
              </div>
              {latestDiscProfile?.file_path && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full text-xs font-semibold h-8"
                  onClick={() => handleViewPdf(latestDiscProfile.file_path)}
                >
                  <FileText className="w-3 h-3 mr-1" />
                  Ver PDF
                </Button>
              )}
            </div>

            {latestDiscProfile ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600 italic">"{latestDiscProfile.summary}"</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-red-50 text-red-700 p-2 rounded-xl">
                    <span className="block text-xs font-bold opacity-70">D</span>
                    <span className="block text-lg font-black">{latestDiscProfile.d}%</span>
                  </div>
                  <div className="bg-yellow-50 text-yellow-700 p-2 rounded-xl">
                    <span className="block text-xs font-bold opacity-70">I</span>
                    <span className="block text-lg font-black">{latestDiscProfile.i}%</span>
                  </div>
                  <div className="bg-green-50 text-green-700 p-2 rounded-xl">
                    <span className="block text-xs font-bold opacity-70">S</span>
                    <span className="block text-lg font-black">{latestDiscProfile.s}%</span>
                  </div>
                  <div className="bg-blue-50 text-blue-700 p-2 rounded-xl">
                    <span className="block text-xs font-bold opacity-70">C</span>
                    <span className="block text-lg font-black">{latestDiscProfile.c}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-slate-400">
                Você ainda não enviou seu teste DISC.
              </div>
            )}
          </div>
          
          {/* FOLHA DE PAGAMENTO & PONTO */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl">
                  <FileText className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-lg text-slate-800">Folha e Ponto</h3>
              </div>
              <Button variant="outline" size="sm" onClick={() => nav("/app/presence")}>
                Acessar Relógio de Ponto
              </Button>
            </div>

            <div className="space-y-2">
              {payslipsQ.isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400 mx-auto" />
              ) : payslipsQ.data?.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhum holerite disponível.</p>
              ) : (
                payslipsQ.data?.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white transition-colors">
                    <div>
                      <h4 className="font-bold text-slate-700 text-sm">{p.reference_month.toString().padStart(2, '0')}/{p.reference_year}</h4>
                      {p.notes && <p className="text-[10px] text-slate-500">{p.notes}</p>}
                    </div>
                    <Button variant="outline" size="sm" className="h-8 rounded-full" onClick={() => window.open(p.file_url, '_blank')}>
                      <ExternalLink className="w-3 h-3 mr-1" /> Acessar
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      <Dialog open={isLinkModalOpen} onOpenChange={setIsLinkModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLinkId ? "Editar Acesso Rápido" : "Novo Acesso Rápido"}</DialogTitle>
            <DialogDescription>
              {editingLinkId ? "Altere o título ou link do seu atalho." : "Adicione um link para acessar facilmente pelo seu resumo."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase">Título</label>
              <Input placeholder="Ex: Sistema de Ponto" value={linkTitle} onChange={e => setLinkTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase">URL (Link)</label>
              <Input placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsLinkModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveLink}>Salvar Link</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

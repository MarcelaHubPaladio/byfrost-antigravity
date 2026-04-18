import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RichTextEditor } from "@/components/RichTextEditor";
import { 
  Plus, 
  Trash2, 
  X, 
  AlertCircle, 
  ArrowLeft, 
  Save, 
  FileUp, 
  Hash,
  Layout,
  ListTodo,
  Workflow,
  Settings2,
  Loader2,
  FileIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { showError, showSuccess } from "@/utils/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type ProcessRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  checklists: any;
  flowchart_json: any;
  target_role: string | null;
  is_home_flowchart: boolean;
};

export default function ProcessEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetRole, setTargetRole] = useState<string | null>(null);
  const [isHomeFlowchart, setIsHomeFlowchart] = useState(false);
  const [checklists, setChecklists] = useState<string[]>([]);
  const [newCheckItem, setNewCheckItem] = useState("");

  const processQ = useQuery({
    queryKey: ["process_detail", id],
    enabled: !isNew && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("processes")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as ProcessRow;
    },
  });

  const tenantRolesQ = useQuery({
    queryKey: ["tenant_roles_for_processes", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_roles")
        .select("role_id, roles(key, name)")
        .eq("tenant_id", activeTenantId!)
        .eq("enabled", true);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return rows
        .map((r) => ({
          key: String(r.roles?.key ?? ""),
          name: String(r.roles?.name ?? ""),
        }))
        .filter((r) => Boolean(r.key))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  useEffect(() => {
    if (processQ.data) {
      const p = processQ.data;
      setTitle(p.title);
      setDescription(p.description || "");
      setTargetRole(p.target_role);
      setIsHomeFlowchart(p.is_home_flowchart);
      setChecklists(Array.isArray(p.checklists) ? p.checklists : []);
    }
  }, [processQ.data]);

  const upsertM = useMutation({
    mutationFn: async () => {
      if (!activeTenantId) throw new Error("Tenant não selecionado");
      if (!title.trim()) throw new Error("Título é obrigatório");

      const payload = {
        tenant_id: activeTenantId,
        title: title.trim(),
        description: description || null,
        target_role: targetRole === "all" ? null : targetRole,
        is_home_flowchart: isHomeFlowchart,
        checklists: checklists,
        updated_at: new Date().toISOString(),
      };

      if (!isNew && id) {
        const { error } = await supabase
          .from("processes")
          .update(payload)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("processes")
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        if (data?.id) return data.id;
      }
    },
    onSuccess: (newId) => {
      showSuccess(isNew ? "Processo criado" : "Processo atualizado");
      qc.invalidateQueries({ queryKey: ["processes", activeTenantId] });
      if (isNew && newId) {
        navigate(`/app/processes/${newId}`, { replace: true });
      }
    },
    onError: (err: any) => showError(err.message),
  });

  const addCheckItem = () => {
    if (newCheckItem.trim()) {
      setChecklists([...checklists, newCheckItem.trim()]);
      setNewCheckItem("");
    }
  };

  const removeCheckItem = (index: number) => {
    setChecklists(checklists.filter((_, i) => i !== index));
  };

  // Files management
  const filesQ = useQuery({
    queryKey: ["process_files_editor", id],
    enabled: !isNew && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_files")
        .select("*")
        .eq("process_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [uploading, setUploading] = useState(false);
  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || isNew || !id || !activeTenantId) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${activeTenantId}/processes/${id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      
      const { error: storageError } = await supabase.storage
        .from("process-files")
        .upload(path, file);
      
      if (storageError) throw storageError;

      const { data: publicData } = supabase.storage
        .from("process-files")
        .getPublicUrl(path);

      const { error: dbError } = await supabase
        .from("process_files")
        .insert({
          tenant_id: activeTenantId,
          process_id: id,
          file_name: file.name,
          file_path: publicData.publicUrl,
          folder_path: "/"
        });

      if (dbError) throw dbError;

      showSuccess("Arquivo enviado!");
      filesQ.refetch();
    } catch (err: any) {
      showError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteFileM = useMutation({
    mutationFn: async (fileId: string) => {
      const { error } = await supabase
        .from("process_files")
        .delete()
        .eq("id", fileId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Arquivo excluído");
      filesQ.refetch();
    },
    onError: (err: any) => showError(err.message),
  });

  return (
    <RequireAuth>
      <AppShell>
        <div className="flex flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => navigate("/app/processes")}
                className="rounded-full hover:bg-slate-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  {isNew ? "Novo Processo" : "Editar Processo"}
                </h1>
                <p className="text-sm text-slate-500">
                  {isNew ? "Crie um novo guia operacional para sua equipe." : "Atualize as instruções e documentos deste processo."}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => navigate("/app/processes")}
                className="rounded-xl px-6 border-slate-200"
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => upsertM.mutate()} 
                disabled={upsertM.isPending}
                className="rounded-xl px-8 bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200"
              >
                <Save className="mr-2 h-4 w-4" />
                {upsertM.isPending ? "Salvando..." : (isNew ? "Criar Processo" : "Salvar Alterações")}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6 rounded-[28px] border-slate-200 shadow-sm space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Hash className="h-4 w-4 text-slate-400" /> Título do Processo
                  </Label>
                  <Input 
                    id="title" 
                    placeholder="Ex: Abertura de Loja, Recebimento de Mercadoria..." 
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-12 rounded-xl border-slate-200 text-lg font-medium focus-visible:ring-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Layout className="h-4 w-4 text-slate-400" /> Descrição / Instruções Detalhadas
                  </Label>
                  <RichTextEditor 
                    value={description} 
                    onChange={setDescription} 
                    className="border-slate-200 rounded-2xl overflow-hidden"
                    minHeightClassName="min-h-[400px]"
                  />
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
                  <div className="flex gap-3 text-amber-800">
                    <Workflow className="h-5 w-5 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold">Fluxograma Visual</h4>
                      <p className="text-xs mt-1 text-amber-700/80">
                        O editor visual de nós (estilo Miro/Lucidchart) está sendo finalizado. 
                        Por enquanto, use a descrição para detalhar as etapas e os arquivos para subir imagens do fluxo.
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Sidebar Config */}
            <div className="space-y-6">
              {/* Common Config */}
              <Card className="p-6 rounded-[28px] border-slate-200 shadow-sm space-y-6">
                <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-slate-400" /> Configurações
                </h3>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cargo Alvo</Label>
                    <Select value={targetRole || "all"} onValueChange={(v) => setTargetRole(v)}>
                      <SelectTrigger className="h-11 rounded-xl border-slate-200">
                        <SelectValue placeholder="Selecione um cargo" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-slate-100">
                        <SelectItem value="all">Todos (Geral)</SelectItem>
                        {tenantRolesQ.data?.map((role) => (
                          <SelectItem key={role.key} value={role.key}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-400 px-1">
                      Define quem pode visualizar este processo na árvore hierárquica.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 group transition-colors hover:border-slate-200 cursor-pointer">
                    <Checkbox 
                      id="is_home" 
                      checked={isHomeFlowchart} 
                      onCheckedChange={(v) => setIsHomeFlowchart(!!v)}
                      className="rounded-lg h-5 w-5 data-[state=checked]:bg-slate-900 data-[state=checked]:border-slate-900" 
                    />
                    <Label htmlFor="is_home" className="text-sm font-medium text-slate-700 cursor-pointer flex-1">
                      Mapa Geral (Home)
                    </Label>
                  </div>
                </div>
              </Card>

              {/* Checklist */}
              <Card className="p-6 rounded-[28px] border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-slate-400" /> Checklist Operacional
                  <Badge variant="secondary" className="rounded-full h-5 px-1.5 ml-auto bg-slate-100 text-[10px] font-bold text-slate-500">
                    {checklists.length}
                  </Badge>
                </h3>

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Novo passo..." 
                      value={newCheckItem}
                      onChange={(e) => setNewCheckItem(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCheckItem()}
                      className="h-10 rounded-xl border-slate-200 shadow-inner"
                    />
                    <Button type="button" onClick={addCheckItem} className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 text-slate-900 hover:bg-slate-200 p-0 shadow-sm border border-slate-200">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {checklists.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm group animate-in slide-in-from-left-2 duration-200">
                        <span className="text-xs font-medium text-slate-700 leading-relaxed uppercase tracking-tight">{item}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => removeCheckItem(idx)}
                          className="h-6 w-6 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {checklists.length === 0 && (
                      <div className="py-8 text-center text-slate-400">
                        <p className="text-[10px] font-medium italic">Nenhum item adicionado.</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Files */}
              <Card className="p-6 rounded-[28px] border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-3 flex items-center gap-2">
                  <FileUp className="h-4 w-4 text-slate-400" /> Arquivos e Documentos
                  {!isNew && (
                    <Badge variant="secondary" className="rounded-full h-5 px-1.5 ml-auto bg-slate-100 text-[10px] font-bold text-slate-500">
                      {filesQ.data?.length || 0}
                    </Badge>
                  )}
                </h3>

                <div className="space-y-4">
                  {isNew ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl px-4">
                      <AlertCircle className="h-6 w-6 text-slate-300 mb-2" />
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Salve o processo primeiro para poder anexar arquivos como PDFs, Imagens e Documentos.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="relative group cursor-pointer">
                        <input 
                          type="file" 
                          onChange={uploadFile} 
                          disabled={uploading}
                          className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-wait"
                        />
                        <div className="flex items-center justify-center gap-2 py-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 group-hover:bg-slate-100 group-hover:border-slate-300 transition-all">
                          {uploading ? (
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Subindo...
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1 font-bold">
                              <Plus className="h-5 w-5 text-slate-400" />
                              <span className="text-[10px] text-slate-500 uppercase tracking-widest">Anexar Arquivo</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {filesQ.data?.map((file: any) => (
                          <div key={file.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-slate-100 shadow-sm group hover:border-slate-200 transition-colors">
                            <div className="flex items-center gap-2 min-w-0 pr-1">
                              <FileIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="text-xs font-bold text-slate-600 truncate" title={file.file_name}>
                                {file.file_name}
                              </span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => deleteFileM.mutate(file.id)}
                              className="h-7 w-7 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

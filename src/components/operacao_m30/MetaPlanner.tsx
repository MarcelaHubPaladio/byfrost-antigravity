import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Calendar, Clock, CheckCircle, XCircle, Image as ImageIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { showError, showSuccess } from "@/utils/toast";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, Edit } from "lucide-react";

export function MetaPlanner() {
  const { activeTenant } = useTenant();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form State
  const [pageId, setPageId] = useState("");
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [postNow, setPostNow] = useState(false);
  
  // Edit State
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const pagesQ = useQuery({
    queryKey: ["meta_organic_pages", activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_organic_pages")
        .select("*")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeTenant?.id
  });

  const postsQ = useQuery({
    queryKey: ["meta_scheduled_posts", activeTenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_scheduled_posts")
        .select(`
          *,
          meta_organic_pages ( name, platform )
        `)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeTenant?.id
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setMediaFile(file);
      setMediaPreview(URL.createObjectURL(file));
    }
  };

  const createPostM = useMutation({
    mutationFn: async () => {
      if (!pageId || !message || !mediaFile || (!postNow && !scheduleDate)) {
        throw new Error("Preencha todos os campos e selecione uma imagem.");
      }

      setUploading(true);
      try {
        // 1. Upload media
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${activeTenant?.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError, data: uploadData } = await supabase.storage
          .from("meta_post_media")
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("meta_post_media")
          .getPublicUrl(fileName);

        // 2. Insert record
        const { error: insertError } = await supabase
          .from("meta_scheduled_posts")
          .insert({
            tenant_id: activeTenant?.id,
            meta_organic_page_id: pageId,
            message: message,
            media_url: publicUrlData.publicUrl,
            scheduled_at: postNow ? new Date().toISOString() : new Date(scheduleDate).toISOString(),
            status: "pending"
          });

        if (insertError) throw insertError;
        
        // If postNow is checked, trigger publisher immediately
        if (postNow) {
          await supabase.functions.invoke("meta-publish");
        }

      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      showSuccess(postNow ? "Postagem iniciada!" : "Postagem agendada com sucesso!");
      qc.invalidateQueries({ queryKey: ["meta_scheduled_posts"] });
      setOpen(false);
      // Reset form
      setPageId("");
      setMessage("");
      setMediaFile(null);
      setMediaPreview("");
      setScheduleDate("");
      setPostNow(false);
      setEditingPostId(null);
    },
    onError: (err: any) => {
      showError("Erro ao agendar postagem", err);
    }
  });

  const updatePostM = useMutation({
    mutationFn: async () => {
      if (!editingPostId || !message || (!postNow && !scheduleDate)) {
        throw new Error("Preencha todos os campos.");
      }
      setUploading(true);
      try {
        let mediaUrl = mediaPreview; // keep existing by default
        
        // 1. Upload media if a new one was selected
        if (mediaFile) {
          const fileExt = mediaFile.name.split('.').pop();
          const fileName = `${activeTenant?.id}/${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
            .from("meta_post_media")
            .upload(fileName, mediaFile);
          if (uploadError) throw uploadError;
          
          const { data: publicUrlData } = supabase.storage
            .from("meta_post_media")
            .getPublicUrl(fileName);
          mediaUrl = publicUrlData.publicUrl;
        }

        // 2. Update record
        const finalSchedule = postNow ? new Date().toISOString() : new Date(scheduleDate).toISOString();
        const { error: updateError } = await supabase
          .from("meta_scheduled_posts")
          .update({
            meta_organic_page_id: pageId,
            message: message,
            media_url: mediaUrl,
            scheduled_at: finalSchedule,
            status: "pending"
          })
          .eq("id", editingPostId);

        if (updateError) throw updateError;
        
        if (postNow) {
          await supabase.functions.invoke("meta-publish");
        }
      } finally {
        setUploading(false);
      }
    },
    onSuccess: () => {
      showSuccess("Postagem atualizada com sucesso!");
      qc.invalidateQueries({ queryKey: ["meta_scheduled_posts"] });
      setOpen(false);
      setEditingPostId(null);
    },
    onError: (err: any) => {
      showError("Erro ao atualizar postagem", err);
    }
  });

  const deletePostM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("meta_scheduled_posts")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Agendamento excluído.");
      qc.invalidateQueries({ queryKey: ["meta_scheduled_posts"] });
    },
    onError: (err: any) => {
      showError("Erro ao excluir agendamento", err);
    }
  });
  
  const handleEdit = (post: any) => {
    setEditingPostId(post.id);
    setPageId(post.meta_organic_page_id);
    setMessage(post.message);
    setMediaPreview(post.media_url);
    setMediaFile(null);
    setScheduleDate(post.scheduled_at.slice(0, 16));
    setPostNow(false);
    setOpen(true);
  };

  const handleOpenNew = () => {
    setEditingPostId(null);
    setPageId("");
    setMessage("");
    setMediaFile(null);
    setMediaPreview("");
    setScheduleDate("");
    setPostNow(false);
    setOpen(true);
  };

  if (!activeTenant) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-500" />
            Agendador de Postagens
          </h2>
          <p className="text-sm text-slate-500">Agende posts para publicação automática nas suas páginas.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild onClick={handleOpenNew}>
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Agendar Post
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editingPostId ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Página de Destino</label>
                <Select value={pageId} onValueChange={setPageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a página..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(pagesQ.data || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2 border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-xl">
                  <Checkbox 
                    id="postNow" 
                    checked={postNow} 
                    onCheckedChange={(c) => setPostNow(!!c)} 
                    className="border-indigo-300 text-indigo-600 focus-visible:ring-indigo-500"
                  />
                  <label htmlFor="postNow" className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 cursor-pointer">
                    Postar Imediatamente
                  </label>
                </div>

                {!postNow && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Data e Hora (Local)</label>
                    <Input 
                      type="datetime-local" 
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Legenda da Postagem</label>
                <Textarea 
                  placeholder="Escreva algo..." 
                  className="resize-none h-24"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Imagem (Obrigatória para o Instagram)</label>
                <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 text-center">
                  {mediaPreview ? (
                    <div className="relative">
                      <img src={mediaPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                      <Button 
                        variant="destructive" 
                        size="sm" 
                        className="absolute top-2 right-2 h-7 rounded-full"
                        onClick={() => { setMediaFile(null); setMediaPreview(""); }}
                      >
                        Remover
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center gap-2 text-slate-500">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-900 rounded-full flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-slate-400" />
                      </div>
                      <span className="text-sm font-medium">Clique para selecionar uma imagem</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button 
                onClick={() => editingPostId ? updatePostM.mutate() : createPostM.mutate()} 
                disabled={createPostM.isPending || updatePostM.isPending || uploading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {(createPostM.isPending || updatePostM.isPending || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingPostId ? "Salvar" : "Agendar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Posts List */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        {postsQ.isLoading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            Carregando agendamentos...
          </div>
        ) : postsQ.data?.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Nenhuma postagem agendada ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
            {postsQ.data?.map(post => (
              <div key={post.id} className="group relative flex flex-col bg-slate-50 dark:bg-slate-950/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden transition-all hover:shadow-md hover:border-indigo-100 dark:hover:border-indigo-900/30">
                {/* Status Badge */}
                <div className="absolute top-3 right-3 z-10">
                  {post.status === "pending" && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 shadow-sm px-2.5 py-0.5 rounded-full">
                      <Clock className="w-3 h-3 mr-1" />
                      Agendado
                    </Badge>
                  )}
                  {post.status === "published" && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-sm px-2.5 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Publicado
                    </Badge>
                  )}
                  {post.status === "failed" && (
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100 shadow-sm px-2.5 py-0.5 rounded-full" title={post.error_message}>
                      <XCircle className="w-3 h-3 mr-1" />
                      Falhou
                    </Badge>
                  )}
                </div>

                <div className="aspect-[4/3] bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
                  <img src={post.media_url} alt="Post media" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                
                <div className="p-4 flex flex-col flex-1 gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className="truncate">{post.meta_organic_pages?.name}</span>
                  </div>
                  
                  <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {post.message}
                  </p>
                  
                  <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <div className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                      {format(new Date(post.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                    
                    {(post.status === "pending" || post.status === "failed") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800">
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-32">
                          <DropdownMenuItem onClick={() => handleEdit(post)} className="cursor-pointer font-medium text-slate-700">
                            <Edit className="w-3.5 h-3.5 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deletePostM.mutate(post.id)} className="cursor-pointer text-red-600 font-medium hover:text-red-700 focus:text-red-700">
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

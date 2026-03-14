import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { MessageSquare, Hash, Users, Pin, Search, Send, Plus, MoreVertical, X, Check, Lock, Globe, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/providers/TenantProvider";
import { useSession } from "@/providers/SessionProvider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { showError, showSuccess } from "@/utils/toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Communication() {
  const { activeTenantId, activeTenant, isSuperAdmin } = useTenant();
  const { user } = useSession();
  const qc = useQueryClient();
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [isNewChannelOpen, setIsNewChannelOpen] = useState(false);
  const [isEditChannelOpen, setIsEditChannelOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isAdmin = useMemo(() => isSuperAdmin || activeTenant?.role === 'admin', [isSuperAdmin, activeTenant]);

  // 1. Queries
  const channelsQ = useQuery({
    queryKey: ["communication_channels", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_channels")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const activeChannel = useMemo(
    () => channelsQ.data?.find((c) => c.id === activeChannelId),
    [channelsQ.data, activeChannelId]
  );

  const tenantUsersQ = useQuery({
    queryKey: ["tenant_users", activeTenantId],
    enabled: !!activeTenantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_tenant_users_profiles", {
        p_tenant_id: activeTenantId!,
        p_include_deleted: false,
      });
      if (error) throw error;
      return data as any[];
    },
  });

  const userName = useMemo(() => {
    const md = user?.user_metadata ?? {};
    return md.full_name || md.display_name || user?.email?.split("@")[0] || "Usuário";
  }, [user]);

  const messagesQ = useQuery({
    queryKey: ["communication_messages", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_messages")
        .select("*, user:users_profile(display_name, avatar_url)")
        .eq("channel_id", activeChannelId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const pinnedMessagesQ = useQuery({
    queryKey: ["communication_pinned_messages", activeChannelId],
    enabled: !!activeChannelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_messages")
        .select("*, user:users_profile(display_name, avatar_url)")
        .eq("channel_id", activeChannelId!)
        .eq("is_pinned", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredMessages = useMemo(() => {
    const msgs = messagesQ.data ?? [];
    if (!searchQuery.trim()) return msgs;
    const q = searchQuery.toLowerCase();
    return msgs.filter((m) => m.content.toLowerCase().includes(q));
  }, [messagesQ.data, searchQuery]);

  // 2. Realtime Subscriptions
  useEffect(() => {
    if (!activeChannelId) return;

    const channel = supabase
      .channel(`room:${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "communication_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["communication_messages", activeChannelId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannelId, qc]);

  // 3. Presence
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!activeTenantId || !user?.id) return;

    const presenceChannel = supabase.channel(`presence:${activeTenantId}`);

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const uids = new Set<string>();
        Object.values(state).forEach((presences: any) => {
          presences.forEach((p: any) => uids.add(p.user_id));
        });
        setOnlineUsers(uids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [activeTenantId, user?.id]);

  // 4. Mutations
  const sendM = useMutation({
    mutationFn: async (text: string) => {
      if (!activeChannelId || !activeTenantId || !user?.id || !text.trim()) return;
      const { error } = await supabase.from("communication_messages").insert({
        channel_id: activeChannelId,
        tenant_id: activeTenantId,
        user_id: user.id,
        content: text.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setMessageText("");
      qc.invalidateQueries({ queryKey: ["communication_messages", activeChannelId] });
    },
    onError: (err: any) => showError(err.message),
  });

  // Mutations
  const createChannelM = useMutation({
    mutationFn: async ({ name, isPrivate, memberIds }: { name: string, isPrivate: boolean, memberIds: string[] }) => {
      if (!activeTenantId || !name.trim()) return;
      
      const { data: channel, error: chError } = await supabase
        .from("communication_channels")
        .insert({
          tenant_id: activeTenantId,
          name: name.trim(),
          type: isPrivate ? 'private' : 'group',
        })
        .select()
        .single();

      if (chError) throw chError;

      // If private, sync members
      if (isPrivate && memberIds.length > 0) {
        const { error: memError } = await supabase.rpc('sync_channel_membership', {
          p_channel_id: channel.id,
          p_user_ids: memberIds
        });
        if (memError) throw memError;
      }
    },
    onSuccess: () => {
      setNewChannelName("");
      setIsPrivate(false);
      setSelectedMembers([]);
      setIsNewChannelOpen(false);
      qc.invalidateQueries({ queryKey: ["communication_channels", activeTenantId] });
      showSuccess("Canal criado com sucesso!");
    },
    onError: (err: any) => showError(err.message),
  });

  const updateChannelM = useMutation({
    mutationFn: async ({ id, name, isPrivate, memberIds }: { id: string, name: string, isPrivate: boolean, memberIds: string[] }) => {
      const { error: chError } = await supabase
        .from("communication_channels")
        .update({
          name: name.trim(),
          type: isPrivate ? 'private' : 'group',
        })
        .eq("id", id);

      if (chError) throw chError;

      // Sync members (only if not a public group transition? 
      // Actually, sync_channel_membership handles the admin check)
      const { error: memError } = await supabase.rpc('sync_channel_membership', {
        p_channel_id: id,
        p_user_ids: isPrivate ? memberIds : [] // clear members if it became public? 
                                              // Actually, public channels ignore members table for access.
      });
      if (memError) throw memError;
    },
    onSuccess: () => {
      setIsEditChannelOpen(false);
      setEditingChannel(null);
      qc.invalidateQueries({ queryKey: ["communication_channels", activeTenantId] });
      showSuccess("Canal atualizado!");
    },
    onError: (err: any) => showError(err.message),
  });

  const deleteChannelM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("communication_channels")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication_channels", activeTenantId] });
      if (activeChannelId === editingChannel?.id) setActiveChannelId(null);
      showSuccess("Canal excluído.");
    },
    onError: (err: any) => showError(err.message),
  });

  const togglePinM = useMutation({
    mutationFn: async ({ messageId, isPinned }: { messageId: string; isPinned: boolean }) => {
      const { error } = await supabase
        .from("communication_messages")
        .update({ is_pinned: isPinned })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication_messages", activeChannelId] });
      qc.invalidateQueries({ queryKey: ["communication_pinned_messages", activeChannelId] });
    },
    onError: (err: any) => showError(err.message),
  });

  const openDmM = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!activeTenantId || !user?.id || targetUserId === user.id) return;
      
      const { data, error } = await supabase.rpc('get_or_create_dm_channel', {
        p_tenant_id: activeTenantId,
        p_user_a: user.id,
        p_user_b: targetUserId
      });
      
      if (error) throw error;
      return data as string; // returns channel_id
    },
    onSuccess: (channelId) => {
      if (channelId) {
        qc.invalidateQueries({ queryKey: ["communication_channels", activeTenantId] });
        setActiveChannelId(channelId);
      }
    },
    onError: (err: any) => showError(err.message),
  });

  // Default selection
  useEffect(() => {
    if (!activeChannelId && (channelsQ.data?.length ?? 0) > 0) {
      setActiveChannelId(channelsQ.data![0].id);
    }
  }, [channelsQ.data, activeChannelId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messagesQ.data]);

  return (
    <RequireAuth>
      <AppShell hideTopBar>
        <div className="flex h-[calc(100vh-2rem)] overflow-hidden rounded-[32px] border border-slate-200 bg-white/50 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/50">
          
          {/* Sidebar - Channels & DMs */}
          <aside className="flex w-64 flex-col border-r border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-lg font-bold tracking-tight">Comunicação</h2>
            </div>
            <ScrollArea className="flex-1 px-2">
              <div className="py-4">
                <div className="mb-2 px-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Canais</span>
                  {isAdmin && (
                    <Dialog open={isNewChannelOpen} onOpenChange={(open) => {
                      setIsNewChannelOpen(open);
                      if (!open) {
                        setNewChannelName("");
                        setIsPrivate(false);
                        setSelectedMembers([]);
                      }
                    }}>
                      <DialogTrigger asChild>
                        <button className="hover:text-slate-900 transition-colors">
                          <Plus className="h-3 w-3" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="rounded-[28px] max-w-md">
                        <DialogHeader>
                          <DialogTitle>Criar novo canal</DialogTitle>
                          <DialogDescription>
                            Organize conversas por tópicos ou departamentos.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-6 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="new-name">Nome do canal</Label>
                            <Input
                              id="new-name"
                              value={newChannelName}
                              onChange={(e) => setNewChannelName(e.target.value)}
                              placeholder="ex. anuncios"
                              className="rounded-xl"
                            />
                          </div>
                          
                          <div className="flex items-center justify-between space-x-2 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
                            <div className="space-y-0.5">
                              <Label className="text-base">Canal Privado</Label>
                              <p className="text-xs text-slate-500">
                                Apenas membros selecionados poderão ver este canal.
                              </p>
                            </div>
                            <Switch
                              checked={isPrivate}
                              onCheckedChange={setIsPrivate}
                            />
                          </div>

                          {isPrivate && (
                            <div className="grid gap-2">
                              <Label>Selecionar Membros</Label>
                              <div className="relative mb-2">
                                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <Input 
                                  placeholder="Buscar usuários..." 
                                  value={userSearchQuery}
                                  onChange={(e) => setUserSearchQuery(e.target.value)}
                                  className="h-9 rounded-xl pl-9 text-xs"
                                />
                              </div>
                              <ScrollArea className="h-[150px] rounded-xl border border-slate-100 p-2 dark:border-slate-800">
                                {tenantUsersQ.data?.filter(u => 
                                  !userSearchQuery || u.display_name?.toLowerCase().includes(userSearchQuery.toLowerCase())
                                ).map(u => (
                                  <div key={u.user_id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg dark:hover:bg-slate-900 transition-colors">
                                    <Checkbox 
                                      id={`user-${u.user_id}`} 
                                      checked={selectedMembers.includes(u.user_id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) setSelectedMembers([...selectedMembers, u.user_id]);
                                        else setSelectedMembers(selectedMembers.filter(id => id !== u.user_id));
                                      }}
                                    />
                                    <label htmlFor={`user-${u.user_id}`} className="flex items-center gap-2 cursor-pointer flex-1">
                                      <Avatar className="h-6 w-6 rounded-lg">
                                        <AvatarImage src={u.avatar_url} />
                                        <AvatarFallback className="rounded-lg text-[10px]">{(u.display_name?.[0] || 'U').toUpperCase()}</AvatarFallback>
                                      </Avatar>
                                      <span className="text-xs">{u.display_name}</span>
                                    </label>
                                  </div>
                                ))}
                              </ScrollArea>
                            </div>
                          )}
                        </div>
                        <DialogFooter>
                          <Button
                            className="w-full rounded-xl"
                            disabled={!newChannelName.trim() || createChannelM.isPending}
                            onClick={() => createChannelM.mutate({ 
                              name: newChannelName, 
                              isPrivate, 
                              memberIds: isPrivate ? selectedMembers : [] 
                            })}
                          >
                            {createChannelM.isPending ? "Criando..." : "Criar Canal"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
                <div className="space-y-1">
                  {channelsQ.data?.filter(c => c.type !== 'direct').map((c) => (
                    <div key={c.id} className="group relative">
                      <button
                        onClick={() => setActiveChannelId(c.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all pr-10",
                          activeChannelId === c.id 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                            : "text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                        )}
                      >
                        {c.type === 'private' ? <Lock className="h-3.5 w-3.5 opacity-50" /> : <Hash className="h-4 w-4 opacity-50" />}
                        <span className="truncate">{c.name}</span>
                      </button>
                      
                      {isAdmin && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-900">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-2xl w-40">
                              <DropdownMenuItem 
                                className="rounded-xl flex items-center gap-2"
                                onClick={() => {
                                  setEditingChannel(c);
                                  setNewChannelName(c.name);
                                  setIsPrivate(c.type === 'private');
                                  setIsEditChannelOpen(true);
                                }}
                              >
                                <Settings className="h-3.5 w-3.5" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="rounded-xl flex items-center gap-2 text-red-600 hover:text-red-600"
                                onClick={() => {
                                  if (confirm(`Excluir o canal #${c.name}?`)) deleteChannelM.mutate(c.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Edit Channel Dialog (Hidden trigger) */}
              <Dialog open={isEditChannelOpen} onOpenChange={setIsEditChannelOpen}>
                <DialogContent className="rounded-[28px] max-w-md">
                  <DialogHeader>
                    <DialogTitle>Editar canal</DialogTitle>
                    <DialogDescription>Alterar configurações do canal #{editingChannel?.name}.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-6 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-name">Nome do canal</Label>
                      <Input
                        id="edit-name"
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between space-x-2 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
                      <div className="space-y-0.5">
                        <Label className="text-base">Canal Privado</Label>
                        <p className="text-xs text-slate-500">Privado restringe acesso a membros.</p>
                      </div>
                      <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      className="w-full rounded-xl"
                      disabled={!newChannelName.trim() || updateChannelM.isPending}
                      onClick={() => updateChannelM.mutate({ 
                        id: editingChannel.id,
                        name: newChannelName, 
                        isPrivate, 
                        memberIds: [] // Membership edit in update is complex, skipping for now or adding later
                      })}
                    >
                      {updateChannelM.isPending ? "Salvando..." : "Salvar Alterações"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="py-4">
                <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Mensagens Diretas
                </div>
                <div className="space-y-1">
                  {channelsQ.data?.filter(c => c.type === 'direct').map((c) => {
                    // In DMs, name is usually "User A, User B". We can improve this if we had members.
                    // For now, let's just show it.
                    return (
                      <button
                        key={c.id}
                        onClick={() => setActiveChannelId(c.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all",
                          activeChannelId === c.id 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                            : "text-slate-600 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:bg-slate-800/50"
                        )}
                      >
                        <MessageSquare className="h-4 w-4 opacity-50" />
                        {c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 rounded-xl">
                  <AvatarFallback className="rounded-xl bg-slate-200">
                    {(userName?.slice(0, 1) ?? "U").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{userName}</div>
                  <div className="text-[10px] text-green-500 font-medium uppercase">Online</div>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Chat Area */}
          <main className="flex flex-1 flex-col bg-white/50 dark:bg-slate-950/20">
            {/* Chat Header */}
            <header className="flex h-16 items-center justify-between border-b border-slate-200 px-6 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Hash className="h-5 w-5 text-slate-400" />
                <h3 className="font-bold">{activeChannel?.name ?? "Carregando..."}</h3>
              </div>
              <div className="flex items-center gap-4">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl text-slate-400 hover:text-slate-900">
                      <Pin className="h-5 w-5" />
                      {pinnedMessagesQ.data?.length ? (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-600 text-[10px] font-bold text-white flex items-center justify-center">
                          {pinnedMessagesQ.data.length}
                        </span>
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 rounded-[28px] p-0 shadow-2xl overflow-hidden border-slate-200 dark:border-slate-800">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50">
                      <h4 className="font-bold text-sm">Mensagens Fixadas</h4>
                    </div>
                    <ScrollArea className="max-h-[400px]">
                      <div className="p-2 space-y-1">
                        {pinnedMessagesQ.data?.map(m => (
                          <div key={m.id} className="p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors group">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-xs">{m.user?.display_name}</span>
                              <span className="text-[10px] text-slate-400">{format(new Date(m.created_at), "dd/MM HH:mm")}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3">{m.content}</p>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="w-full mt-2 h-7 rounded-lg text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => togglePinM.mutate({ messageId: m.id, isPinned: false })}
                            >
                              Remover fixado
                            </Button>
                          </div>
                        ))}
                        {!pinnedMessagesQ.data?.length && (
                          <div className="p-8 text-center text-xs text-slate-400">Nenhuma mensagem fixada.</div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar" 
                    className="h-9 w-48 rounded-xl border-none bg-slate-100/50 pl-9 text-xs focus-visible:ring-1 focus-visible:ring-blue-500 dark:bg-slate-800/50" 
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="rounded-xl text-slate-400 hover:text-slate-900 md:hidden">
                  <Users className="h-5 w-5" />
                </Button>
              </div>
            </header>

            {/* Messages */}
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6">
                {filteredMessages.map((m) => (
                  <div key={m.id} className="group flex gap-4">
                    <Avatar className="h-10 w-10 rounded-xl shrink-0">
                      <AvatarImage src={m.user?.avatar_url} />
                      <AvatarFallback className="rounded-xl bg-indigo-100 text-indigo-600">
                        {(m.user?.display_name?.slice(0, 1) ?? "U").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">{m.user?.display_name ?? "Usuário"}</span>
                          <span className="text-[10px] text-slate-400">
                            {format(new Date(m.created_at), "HH:mm", { locale: ptBR })}
                          </span>
                          {m.is_pinned && <Pin className="h-3 w-3 text-blue-500" />}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 rounded-lg"
                            onClick={() => togglePinM.mutate({ messageId: m.id, isPinned: !m.is_pinned })}
                            title={m.is_pinned ? "Desafixar" : "Fixar mensagem"}
                          >
                            <Pin className={cn("h-3.5 w-3.5", m.is_pinned ? "fill-blue-500 text-blue-500" : "text-slate-400")} />
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {m.content}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={scrollRef} />
              </div>
            </ScrollArea>

            {/* Chat Input */}
            <footer className="p-6">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  sendM.mutate(messageText);
                }}
                className="relative rounded-2xl border border-slate-200 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
              >
                <Input 
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder={`Conversar em #${activeChannel?.name ?? ""}`}
                  className="h-12 border-none bg-transparent px-4 focus-visible:ring-0"
                  disabled={sendM.isPending}
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <Button 
                    type="submit"
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 rounded-lg text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                    disabled={!messageText.trim() || sendM.isPending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </footer>
          </main>

          {/* Right Sidebar - Active Users */}
          <aside className="hidden w-64 border-l border-slate-200 bg-slate-50/30 p-4 dark:border-slate-800 dark:bg-slate-900/30 xl:block">
            <div className="mb-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Usuários Online — {onlineUsers.size}
            </div>
            <div className="space-y-4">
               {tenantUsersQ.data?.filter(u => u.user_id !== user?.id).map(u => {
                 const isOnline = onlineUsers.has(u.user_id);
                 return (
                   <button 
                     key={u.user_id} 
                     onClick={() => openDmM.mutate(u.user_id)}
                     className={cn("flex w-full items-center gap-3 transition-all hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded-xl", !isOnline && "opacity-60")}
                   >
                     <div className="relative">
                      <Avatar className="h-8 w-8 rounded-lg">
                        <AvatarImage src={u.avatar_url} />
                        <AvatarFallback className="rounded-lg bg-slate-100 text-slate-600">
                          {(u.display_name?.slice(0, 1) ?? "U").toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {isOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500 dark:border-slate-900" />
                      )}
                     </div>
                     <div className="min-w-0 text-left">
                       <div className="truncate text-xs font-bold">{u.display_name ?? 'Usuário'}</div>
                       {isOnline && <div className="truncate text-[10px] text-green-600 font-medium">Online</div>}
                     </div>
                   </button>
                 );
               })}
            </div>
          </aside>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

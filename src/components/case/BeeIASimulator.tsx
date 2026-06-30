import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { showError, showSuccess } from "@/utils/toast";
import { Bot, User, Send, Plus, MessageSquare, ThumbsDown, Activity, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type SimMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
  feedback_json?: { comment: string } | null;
};

type SimSession = {
  session_id: string;
  created_at: string;
  last_message: string;
};

export function BeeIASimulator() {
  const qc = useQueryClient();
  const { activeTenantId } = useTenant();
  const [activeSessionId, setActiveSessionId] = useState<string>(crypto.randomUUID());
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Radar State
  const [sessionTokensUsed, setSessionTokensUsed] = useState(0);

  // Fetch unique sessions
  const sessionsQ = useQuery({
    queryKey: ["beeia_sim_sessions", activeTenantId],
    enabled: Boolean(activeTenantId),
    queryFn: async () => {
      // Fetch latest 500 messages to group into sessions
      const { data, error } = await supabase
        .from("beeia_simulations")
        .select("session_id, content, created_at")
        .eq("tenant_id", activeTenantId!)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      
      const sessionMap = new Map<string, SimSession>();
      (data ?? []).forEach(m => {
        if (!sessionMap.has(m.session_id)) {
          sessionMap.set(m.session_id, {
            session_id: m.session_id,
            created_at: m.created_at,
            last_message: m.content
          });
        }
      });
      return Array.from(sessionMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  });

  // Fetch initial token usage for the active session
  useQuery({
    queryKey: ["beeia_sim_radar", activeTenantId, activeSessionId],
    enabled: Boolean(activeTenantId && activeSessionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_events")
        .select("qty")
        .eq("tenant_id", activeTenantId!)
        .eq("ref_id", activeSessionId);
      
      if (error) throw error;
      const total = (data ?? []).reduce((sum, row) => sum + (row.qty || 0), 0);
      setSessionTokensUsed(total);
      return total;
    }
  });

  // Fetch messages for active session
  const messagesQ = useQuery({
    queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId],
    enabled: Boolean(activeTenantId && activeSessionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beeia_simulations")
        .select("*")
        .eq("tenant_id", activeTenantId!)
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as SimMessage[];
    }
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQ.data]);

  const sendMut = useMutation({
    mutationFn: async (msg: string) => {
      const { data, error } = await supabase.functions.invoke("beeia-simulator", {
        body: {
          tenant_id: activeTenantId,
          session_id: activeSessionId,
          message: msg
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId] });
      qc.invalidateQueries({ queryKey: ["beeia_sim_sessions", activeTenantId] });
      
      // Update Radar
      if (data?.tokensUsed) {
        setSessionTokensUsed(prev => prev + data.tokensUsed);
      }
      
      setInputValue("");
    },
    onError: (err: any) => {
      showError("Erro ao processar mensagem: " + err.message);
    }
  });

  // Feedback mutations
  const msgFeedbackMut = useMutation({
    mutationFn: async ({ messageId, comment }: { messageId: string; comment: string }) => {
      const { error } = await supabase
        .from("beeia_simulations")
        .update({ feedback_json: { comment } })
        .eq("id", messageId);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Feedback salvo para a mensagem!");
      qc.invalidateQueries({ queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId] });
    },
    onError: (err: any) => showError("Erro ao salvar feedback: " + err.message)
  });

  const sessionFeedbackMut = useMutation({
    mutationFn: async (comment: string) => {
      const { error } = await supabase
        .from("beeia_simulations")
        .insert({
          tenant_id: activeTenantId,
          session_id: activeSessionId,
          role: "system",
          content: "FEEDBACK GLOBAL: " + comment
        });
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccess("Avaliação da sessão salva!");
      qc.invalidateQueries({ queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId] });
    },
    onError: (err: any) => showError("Erro ao avaliar sessão: " + err.message)
  });

  const evaluateMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("beeia-simulator", {
        body: {
          tenant_id: activeTenantId,
          session_id: activeSessionId,
          action: "evaluate_session"
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      showSuccess("Auto-avaliação concluída!");
      qc.invalidateQueries({ queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId] });
      if (data?.tokensUsed) {
        setSessionTokensUsed(prev => prev + data.tokensUsed);
      }
    },
    onError: (err: any) => showError("Erro ao gerar auto-avaliação: " + err.message)
  });

  const handleSend = () => {
    if (!inputValue.trim() || sendMut.isPending) return;
    sendMut.mutate(inputValue.trim());
  };

  const startNewSession = () => {
    setActiveSessionId(crypto.randomUUID());
    setSessionTokensUsed(0);
  };

  const msgs = messagesQ.data ?? [];
  const costUsd = (sessionTokensUsed * 0.0000003).toFixed(5);

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[500px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm">
      
      {/* Sidebar - History */}
      <div className="flex w-1/3 flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 p-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Histórico
          </h3>
          <Button size="icon" variant="ghost" onClick={startNewSession} title="Nova Simulação">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-2">
          {sessionsQ.isLoading ? (
            <div className="p-4 text-center text-sm text-slate-400">Carregando...</div>
          ) : sessionsQ.data?.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-400">Nenhuma simulação ainda.</div>
          ) : (
            sessionsQ.data?.map(s => (
              <div
                key={s.session_id}
                onClick={() => setActiveSessionId(s.session_id)}
                className={cn(
                  "cursor-pointer rounded-xl p-3 mb-1 transition-colors border",
                  activeSessionId === s.session_id
                    ? "bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-900/50 shadow-sm"
                    : "border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800/50"
                )}
              >
                <div className="text-xs text-slate-400 mb-1">
                  {new Date(s.created_at).toLocaleString("pt-BR")}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
                  {s.last_message}
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      {/* Chat Area */}
      <div className="flex w-2/3 flex-col bg-[#efeae2] dark:bg-slate-900/80 relative">
        
        {/* Radar Header */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
              <Activity className="h-3 w-3 text-amber-500" />
              Radar: {sessionTokensUsed.toLocaleString()} tokens ($ {costUsd})
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1.5 border-indigo-200 hover:bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:hover:bg-indigo-900/30 dark:text-indigo-400"
              onClick={() => evaluateMut.mutate()}
              disabled={evaluateMut.isPending || msgs.length === 0}
            >
              <Sparkles className={cn("h-3 w-3", evaluateMut.isPending && "animate-pulse")} />
              {evaluateMut.isPending ? "Avaliando..." : "Auto-Avaliação"}
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 border-amber-200 hover:bg-amber-50 text-amber-700 dark:border-amber-900 dark:hover:bg-amber-900/30 dark:text-amber-400">
                  <CheckCircle2 className="h-3 w-3" />
                  Avaliar Sessão
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-4" align="end">
                <h4 className="font-semibold text-sm mb-2">Feedback Geral da Simulação</h4>
                <p className="text-xs text-slate-500 mb-3">Como a IA se saiu no geral durante essa conversa? Onde ela pode melhorar no fechamento/qualificação?</p>
                <form onSubmit={e => {
                  e.preventDefault();
                  const form = e.target as HTMLFormElement;
                  const comment = (form.elements.namedItem("comment") as HTMLTextAreaElement).value;
                  if (comment) sessionFeedbackMut.mutate(comment);
                }}>
                  <Textarea name="comment" className="min-h-[80px] text-sm mb-3" placeholder="Sua avaliação geral..." />
                  <Button type="submit" size="sm" className="w-full bg-amber-500 hover:bg-amber-600" disabled={sessionFeedbackMut.isPending}>
                    Salvar Feedback
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 pt-16">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 dark:text-slate-400">
              <Bot className="h-12 w-12 opacity-20 mb-4" />
              <p>Envie um "Olá" para começar a simular com a BeeIA.</p>
            </div>
          ) : (
            msgs.map(m => (
              <div key={m.id} className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}>
                
                {m.role === "system" ? (
                  <div className="mx-auto bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs px-3 py-1.5 rounded-full my-2 text-center max-w-[80%]">
                    {m.content}
                  </div>
                ) : (
                  <div className={cn(
                    "group flex gap-2 max-w-[80%]",
                    m.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}>
                    <div className={cn(
                      "rounded-2xl p-3 text-sm shadow-sm",
                      m.role === "user" 
                        ? "bg-amber-500 text-white rounded-br-none" 
                        : "bg-white text-slate-800 border border-slate-100 rounded-bl-none dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                    )}>
                      {m.content}
                      {m.feedback_json?.comment && (
                        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs text-rose-500 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg">
                          <strong>Seu feedback:</strong> {m.feedback_json.comment}
                        </div>
                      )}
                    </div>
                    
                    {/* Feedback Button for Assistant */}
                    {m.role === "assistant" && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                              <ThumbsDown className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-3" side="right" align="start">
                            <h4 className="font-semibold text-sm mb-2 text-rose-600">Corrigir resposta</h4>
                            <form onSubmit={e => {
                              e.preventDefault();
                              const form = e.target as HTMLFormElement;
                              const comment = (form.elements.namedItem("comment") as HTMLTextAreaElement).value;
                              if (comment) msgFeedbackMut.mutate({ messageId: m.id, comment });
                            }}>
                              <Textarea name="comment" className="text-sm mb-2" placeholder="O que a IA deveria ter falado aqui?" defaultValue={m.feedback_json?.comment} />
                              <Button type="submit" size="sm" className="w-full bg-rose-500 hover:bg-rose-600" disabled={msgFeedbackMut.isPending}>
                                Salvar Correção
                              </Button>
                            </form>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {sendMut.isPending && (
            <div className="flex w-full justify-start">
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-bl-none p-3 shadow-sm flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex gap-2 relative z-10">
          <Input
            placeholder="Digite uma mensagem..."
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSend();
            }}
            className="flex-1 rounded-full bg-slate-100 border-transparent focus-visible:ring-amber-500 dark:bg-slate-800"
            disabled={sendMut.isPending}
          />
          <Button 
            onClick={handleSend} 
            disabled={!inputValue.trim() || sendMut.isPending}
            className="rounded-full bg-amber-500 hover:bg-amber-600 w-10 h-10 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

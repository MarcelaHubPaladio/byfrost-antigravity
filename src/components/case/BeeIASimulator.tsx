import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { showError } from "@/utils/toast";
import { Bot, User, Send, Plus, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

type SimMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["beeia_sim_messages", activeTenantId, activeSessionId] });
      qc.invalidateQueries({ queryKey: ["beeia_sim_sessions", activeTenantId] });
      setInputValue("");
    },
    onError: (err: any) => {
      showError("Erro ao processar mensagem: " + err.message);
    }
  });

  const handleSend = () => {
    if (!inputValue.trim() || sendMut.isPending) return;
    // Optimistic insert could be added here, but for simplicity we rely on refetch
    sendMut.mutate(inputValue.trim());
  };

  const startNewSession = () => {
    setActiveSessionId(crypto.randomUUID());
  };

  const msgs = messagesQ.data ?? [];

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
      <div className="flex w-2/3 flex-col bg-[#efeae2] dark:bg-slate-900/80">
        
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 dark:text-slate-400">
              <Bot className="h-12 w-12 opacity-20 mb-4" />
              <p>Envie um "Olá" para começar a simular com a BeeIA.</p>
            </div>
          ) : (
            msgs.map(m => (
              <div key={m.id} className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[80%] rounded-2xl p-3 text-sm shadow-sm",
                  m.role === "user" 
                    ? "bg-amber-500 text-white rounded-br-none" 
                    : "bg-white text-slate-800 border border-slate-100 rounded-bl-none dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
                )}>
                  {m.content}
                </div>
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
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex gap-2">
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

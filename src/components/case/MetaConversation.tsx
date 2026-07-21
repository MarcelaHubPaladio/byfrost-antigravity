import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useAuth } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, Bot, User, CheckCheck, Clock, Check, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { showError } from "@/utils/toast";

export function MetaConversation({ caseId, className = "" }: { caseId: string; className?: string }) {
  const { activeTenantId } = useTenant();
  const { user } = useAuth();
  const qc = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [inputText, setInputText] = useState("");

  const caseQ = useQuery({
    queryKey: ["case", activeTenantId, caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cases")
        .select("id, beeia_paused, customer_accounts(name, phone_e164)")
        .eq("id", caseId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!caseId && !!activeTenantId
  });

  const messagesQ = useQuery({
    queryKey: ["meta_messages", activeTenantId, caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_messages")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!caseId && !!activeTenantId,
    refetchInterval: 5000 // Poll for new DMs
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messagesQ.data) scrollToBottom();
  }, [messagesQ.data]);

  const sendM = useMutation({
    mutationFn: async (text: string) => {
      const { data, error } = await supabase.functions.invoke("meta-dm-send", {
        body: { case_id: caseId, message_text: text }
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Unknown error");
      return data;
    },
    onSuccess: () => {
      setInputText("");
      qc.invalidateQueries({ queryKey: ["meta_messages", activeTenantId, caseId] });
      
      // Auto pause BeeIA when human intervenes
      if (!beeiaIsPaused) {
        forcePauseBeeIA();
      }
    },
    onError: (err: any) => {
      showError("Erro ao enviar mensagem", err);
    }
  });

  const beeiaIsPaused = (caseQ.data as any)?.beeia_paused === true;

  const toggleBeeIA = async () => {
    try {
      const newPaused = !beeiaIsPaused;
      await supabase.from("cases").update({ beeia_paused: newPaused }).eq("id", caseId);
      qc.invalidateQueries({ queryKey: ["case", activeTenantId, caseId] });
    } catch (e: any) {
      showError("Erro ao alterar IA", e);
    }
  };

  const forcePauseBeeIA = async () => {
    await supabase.from("cases").update({ beeia_paused: true }).eq("id", caseId);
    qc.invalidateQueries({ queryKey: ["case", activeTenantId, caseId] });
  };

  if (!caseId || !activeTenantId) return null;

  return (
    <div className={`flex flex-col bg-slate-50 dark:bg-[#0a0a0a] ${className}`}>
      {/* Header */}
      <div className="flex-none p-3 md:p-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
            {caseQ.data?.customer_accounts?.name?.charAt(0) || "U"}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {caseQ.data?.customer_accounts?.name || "Usuário Desconhecido"}
            </h3>
            <p className="text-xs text-slate-500">Instagram / Facebook</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleBeeIA}
            className={`gap-2 rounded-xl text-xs font-semibold shadow-sm transition-colors ${
              beeiaIsPaused 
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                : "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/30 dark:hover:bg-indigo-500/20"
            }`}
          >
            <Bot className="w-4 h-4" />
            {beeiaIsPaused ? "IA Pausada" : "IA Ativa"}
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {messagesQ.isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : messagesQ.data?.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <p className="text-sm">Nenhuma mensagem neste caso.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 pb-4">
            {messagesQ.data?.map(msg => {
              const isInbound = msg.direction === "inbound";
              const isIA = !isInbound && msg.sender_id === "BEEIA"; // Simplified assumption
              
              return (
                <div key={msg.id} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                  <div 
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm relative group ${
                      isInbound 
                        ? "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-tl-sm border border-slate-100 dark:border-slate-700" 
                        : "bg-indigo-600 text-white rounded-tr-sm"
                    }`}
                  >
                    {!isInbound && isIA && (
                      <div className="text-[10px] text-indigo-200 mb-1 flex items-center gap-1 font-medium">
                        <Bot className="w-3 h-3" /> BeeIA
                      </div>
                    )}
                    
                    <p className="text-[14px] whitespace-pre-wrap break-words leading-relaxed">{msg.message_text}</p>
                    
                    <div className={`text-[10px] mt-1 flex items-center justify-end gap-1 ${isInbound ? "text-slate-400" : "text-indigo-200"}`}>
                      {format(new Date(msg.created_at), "HH:mm")}
                      {!isInbound && (
                        msg.status === "sent" ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-none p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (inputText.trim() && !sendM.isPending) {
              sendM.mutate(inputText.trim());
            }
          }}
          className="flex items-center gap-2"
        >
          <Input 
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Digite sua mensagem (a IA será pausada)..."
            className="flex-1 rounded-full bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 focus-visible:ring-indigo-500"
            disabled={sendM.isPending}
          />
          <Button 
            type="submit" 
            disabled={!inputText.trim() || sendM.isPending}
            className="w-10 h-10 rounded-full p-0 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md flex-shrink-0"
          >
            {sendM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}

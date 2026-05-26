import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/providers/TenantProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  Send, 
  MessageSquare, 
  Plus, 
  Trash2, 
  Sparkles, 
  Loader2, 
  HelpCircle,
  TrendingUp,
  Clock,
  ArrowRight,
  Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { format, subDays, subMonths, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";

type Chat = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  focus_key?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type Journey = {
  id: string;
  name: string;
};

export function OracleChat() {
  const { activeTenantId } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>(() => {
    // Default to last 90 days lookback window
    return {
      from: startOfDay(subDays(new Date(), 90)),
      to: endOfDay(new Date())
    };
  });
  const [inputMessage, setInputMessage] = useState("");
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [journeys, setJourneys] = useState<Journey[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Derived active chat
  const activeChat = chats.find(c => c.id === activeChatId);

  // Suggested questions for empty/new chats
  const suggestions = [
    { text: "Como estão as nossas finanças nos últimos 30 dias?", icon: <TrendingUp className="h-4 w-4 text-emerald-500" /> },
    { text: "Quais tarefas urgentes ou atrasadas exigem atenção?", icon: <HelpCircle className="h-4 w-4 text-rose-500" /> },
    { text: "Pode fazer um resumo da nossa operação geral?", icon: <Sparkles className="h-4 w-4 text-indigo-500" /> },
    { text: "Como melhorar o fluxo de caixa com base nas despesas?", icon: <TrendingUp className="h-4 w-4 text-amber-500" /> }
  ];

  // Fetch all chats for tenant
  const fetchChats = async (selectNewest = false) => {
    if (!activeTenantId) return;
    try {
      setLoadingChats(true);
      const { data, error } = await supabase
        .from("oracle_chats")
        .select("*")
        .eq("tenant_id", activeTenantId)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setChats(data || []);

      if (selectNewest && data && data.length > 0) {
        setActiveChatId(data[0].id);
      }
    } catch (err: any) {
      console.error("Error loading chats:", err);
      toast({ variant: "destructive", title: "Erro ao carregar chats", description: err.message });
    } finally {
      setLoadingChats(false);
    }
  };

  // Fetch active tenant journeys to populate the selector
  const fetchJourneys = async () => {
    if (!activeTenantId) return;
    try {
      const { data, error } = await supabase
        .from("journeys")
        .select("id, name")
        .eq("tenant_id", activeTenantId)
        .order("name", { ascending: true });

      if (error) throw error;
      setJourneys(data || []);
    } catch (err: any) {
      console.error("Error fetching journeys:", err);
    }
  };

  // Update conversation focus
  const handleUpdateFocus = async (chatId: string, newFocus: string) => {
    try {
      const { error } = await supabase
        .from("oracle_chats")
        .update({ focus_key: newFocus })
        .eq("id", chatId);

      if (error) throw error;

      setChats(prev => prev.map(c => c.id === chatId ? { ...c, focus_key: newFocus } : c));
      toast({
        title: "Foco da conversa atualizado",
        description: `O Oráculo direcionou o foco da IA com sucesso.`
      });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao atualizar foco", description: err.message });
    }
  };

  // Fetch messages for active chat
  const fetchMessages = async (chatId: string) => {
    try {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("oracle_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (err: any) {
      console.error("Error loading messages:", err);
      toast({ variant: "destructive", title: "Erro ao carregar histórico", description: err.message });
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchChats(true);
    fetchJourneys();
  }, [activeTenantId]);

  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
    } else {
      setMessages([]);
    }
  }, [activeChatId]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const [newChatFocus, setNewChatFocus] = useState("global");

  // Create new chat
  const handleNewChat = async (initialMessage?: string) => {
    if (!activeTenantId) return;
    try {
      const defaultTitle = initialMessage 
        ? (initialMessage.length > 30 ? initialMessage.slice(0, 30) + "..." : initialMessage)
        : `Conversa ${new Date().toLocaleDateString("pt-BR")}`;

      const { data, error } = await supabase
        .from("oracle_chats")
        .insert({
          tenant_id: activeTenantId,
          title: defaultTitle,
          focus_key: newChatFocus
        })
        .select()
        .single();

      if (error) throw error;

      setChats(prev => [data, ...prev]);
      setActiveChatId(data.id);

      if (initialMessage) {
        await sendMessage(data.id, initialMessage);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao criar conversa", description: err.message });
    }
  };

  // Delete chat
  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Deseja realmente excluir esta conversa? Todo o histórico será perdido.")) return;
    try {
      const { error } = await supabase
        .from("oracle_chats")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setChats(prev => prev.filter(c => c.id !== id));
      if (activeChatId === id) {
        setActiveChatId(null);
      }
      toast({ title: "Conversa excluída", description: "O histórico foi removido com sucesso." });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro ao excluir conversa", description: err.message });
    }
  };

  // Send message
  const sendMessage = async (chatId: string, text: string) => {
    if (!text.trim() || !activeTenantId) return;
    setSending(true);
    setInputMessage("");

    // Optimistically update UI
    const tempUserMsg: Message = {
      id: Math.random().toString(),
      role: "user",
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await supabase.functions.invoke("oracle-chat", {
        body: {
          chatId,
          message: text,
          tenantId: activeTenantId,
          startDate: dateRange.from ? dateRange.from.toISOString() : null,
          endDate: dateRange.to ? dateRange.to.toISOString() : null
        }
      });

      if (res.error) throw new Error(res.error.message || "Erro na resposta do Oráculo");

      // Reload messages to get the persisted database state
      await fetchMessages(chatId);

      // Invalidate the query key to refresh token count on the UI in real-time!
      queryClient.invalidateQueries({ queryKey: ["tenant_plan_overview", activeTenantId] });
      
      // Update chat title if it was the default and this is first message
      const currentChat = chats.find(c => c.id === chatId);
      if (currentChat && (currentChat.title?.startsWith("Conversa ") || !currentChat.title)) {
        const newTitle = text.length > 30 ? text.slice(0, 30) + "..." : text;
        await supabase
          .from("oracle_chats")
          .update({ title: newTitle })
          .eq("id", chatId);
        
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: newTitle } : c));
      }
    } catch (err: any) {
      console.error("Send message error:", err);
      toast({ variant: "destructive", title: "Erro de comunicação", description: err.message });
    } finally {
      setSending(false);
    }
  };

  const handleSend = () => {
    if (!inputMessage.trim()) return;
    if (activeChatId) {
      sendMessage(activeChatId, inputMessage);
    } else {
      handleNewChat(inputMessage);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-slate-50 rounded-3xl border border-slate-200/80 shadow-md flex overflow-hidden min-h-[600px] max-h-[800px] h-[calc(100vh-280px)]">
      {/* Sidebar - Chat list */}
      <div className="w-80 bg-white border-r border-slate-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
            Conversas
          </h3>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleNewChat()} 
            className="rounded-xl bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 h-8 w-8"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loadingChats ? (
            <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
              <span className="text-xs text-slate-400">Buscando histórico...</span>
            </div>
          ) : chats.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 px-4">
              Nenhuma conversa recente. Inicie uma nova para falar com o Oráculo!
            </div>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={`group flex items-center justify-between p-3 rounded-2xl cursor-pointer transition-all duration-200 ${
                  activeChatId === chat.id 
                    ? "bg-indigo-50/80 text-indigo-900 border-l-4 border-indigo-600 pl-2" 
                    : "hover:bg-slate-50 text-slate-600"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <MessageSquare className={`h-4 w-4 flex-shrink-0 ${activeChatId === chat.id ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="text-xs font-semibold truncate leading-none">
                    {chat.title || "Conversa"}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDeleteChat(chat.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200/60 rounded-lg text-slate-400 hover:text-rose-600 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-slate-50 relative">
        {/* Active Chat Header */}
        <div className="bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2.5 rounded-2xl">
              <Sparkles className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h4 className="font-bold text-slate-800 text-sm">Oráculo de Negócios</h4>
              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Responde com base no seu Financeiro e Tarefas reais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Foco Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/60 hover:border-slate-300 px-3 py-1.5 rounded-2xl transition-all shadow-sm">
              <Target className="w-4 h-4 text-indigo-600 animate-pulse" />
              <div className="flex flex-col text-left">
                <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 leading-none">Foco da IA</span>
                <select
                  value={activeChat ? (activeChat.focus_key || "global") : newChatFocus}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeChatId) {
                      handleUpdateFocus(activeChatId, val);
                    } else {
                      setNewChatFocus(val);
                      toast({
                        title: "Foco estratégico definido",
                        description: "A próxima conversa iniciada usará este foco estratégico."
                      });
                    }
                  }}
                  className="bg-transparent border-0 text-xs font-bold text-slate-700 focus:outline-none focus:ring-0 cursor-pointer pr-6 py-0 -mt-0.5"
                >
                  <option value="global">🌐 Geral (Operação + Finanças)</option>
                  <option value="finance">💰 Apenas Financeiro</option>
                  <option value="tasks">📋 Apenas Tarefas e Processos</option>
                  {journeys.length > 0 && <option disabled>────────────────────</option>}
                  {journeys.map(j => (
                    <option key={j.id} value={j.id}>🚀 Jornada: {j.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date Range Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  className="h-10 px-4 border border-slate-200/60 hover:border-slate-300 rounded-2xl text-xs font-bold text-slate-600 flex items-center gap-2 transition-all shadow-sm bg-slate-50"
                >
                  <CalendarIcon className="h-4 w-4 text-indigo-500" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      `${format(dateRange.from, "dd/MM/yyyy")} - ${format(dateRange.to, "dd/MM/yyyy")}`
                    ) : (
                      format(dateRange.from, "dd/MM/yyyy")
                    )
                  ) : (
                    "Todo Período"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 rounded-3xl border-slate-200 shadow-2xl overflow-hidden bg-white" align="end">
                <div className="flex flex-col md:flex-row bg-white">
                  <div className="w-full md:w-44 border-b md:border-b-0 md:border-r border-slate-100 p-3 flex flex-col gap-1 bg-slate-50/50">
                    {[
                      { label: "Hoje", get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
                      { label: "Ontem", get: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }) },
                      { label: "Últimos 7 dias", get: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
                      { label: "Últimos 30 dias", get: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
                      { label: "Mês Atual", get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
                      { label: "Mês Passado", get: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
                      { label: "Todo Período", get: () => ({ from: undefined, to: undefined }) },
                    ].map((btn) => (
                      <Button
                        key={btn.label}
                        variant="ghost"
                        className="h-9 justify-start rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-white hover:text-indigo-600 transition-all text-left"
                        onClick={() => {
                          setDateRange(btn.get());
                          toast({
                            title: "Período alterado",
                            description: `O filtro foi atualizado para: ${btn.label}`
                          });
                        }}
                      >
                        {btn.label}
                      </Button>
                    ))}
                  </div>
                  <div className="p-2">
                    <CalendarComponent
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range: any) => range && setDateRange({ from: range.from, to: range.to })}
                      numberOfMonths={2}
                      locale={ptBR}
                      className="rounded-2xl"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {!activeChatId && messages.length === 0 ? (
            // Custom landing empty state
            <div className="max-w-2xl mx-auto py-12 flex flex-col items-center justify-center text-center space-y-8">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur opacity-30 animate-pulse"></div>
                <div className="relative bg-white border border-slate-100 p-6 rounded-full shadow-md">
                  <Sparkles className="h-10 w-10 text-indigo-600" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-800">Olá! Eu sou o Oráculo.</h3>
                <p className="text-sm text-slate-500 mt-2 max-w-md">
                  Estou pronto para analisar toda a operação do seu negócio, dar insights estratégicos e responder suas dúvidas a qualquer momento.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {suggestions.map((sug, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setInputMessage(sug.text);
                    }}
                    className="bg-white border border-slate-100 p-4 rounded-2xl cursor-pointer hover:border-indigo-200 hover:shadow-md transition-all duration-200 flex items-start gap-3 text-left group"
                  >
                    <div className="bg-slate-50 p-2 rounded-xl group-hover:bg-indigo-50 transition-colors">
                      {sug.icon}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 leading-normal">{sug.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Message bubbles
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[85%] rounded-[24px] px-5 py-4 border shadow-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 border-indigo-600 text-white rounded-br-none"
                      : "bg-white border-slate-100 text-slate-800 rounded-bl-none prose prose-slate max-w-none text-sm leading-relaxed"
                  }`}>
                    {msg.role === "user" ? (
                      <p className="text-sm font-medium whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <div className="whitespace-pre-wrap font-medium">
                        {msg.content}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 rounded-[24px] rounded-bl-none px-6 py-4 flex items-center gap-3 shadow-sm">
                    <div className="flex space-x-1.5">
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
                    </div>
                    <span className="text-xs text-slate-400 font-semibold animate-pulse">Oráculo está pensando...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white p-4 border-t border-slate-100 shadow-lg">
          <div className="max-w-3xl mx-auto flex gap-3 items-center">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte qualquer coisa sobre finanças, tarefas ou operação geral..."
              className="flex-1 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200/80 focus:border-indigo-500/80 rounded-2xl px-4 py-3 text-sm font-medium resize-none h-12 focus:outline-none transition-all"
            />
            <Button
              onClick={handleSend}
              disabled={sending || !inputMessage.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 h-12 w-12 rounded-2xl flex-shrink-0 flex items-center justify-center p-0"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5 text-white" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Modal } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useTenant } from '../../providers/TenantProvider';
import { Send, Sparkles, Plus, History, X, MessageSquare } from 'lucide-react-native';

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export function MobileOracleChat() {
  const { activeTenantId } = useTenant();
  const queryClient = useQueryClient();
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<{ id: string; title: string | null; updated_at: string }[]>([]);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    async function loadOrCreateChat() {
      if (!activeTenantId) return;
      try {
        setLoadingInitial(true);
        // Pega todos os chats para popular o histórico
        const { data: allChats, error: chatsErr } = await supabase
          .from('oracle_chats')
          .select('id, title, updated_at')
          .eq('tenant_id', activeTenantId)
          .order('updated_at', { ascending: false });

        if (chatsErr) throw chatsErr;

        setChats(allChats || []);
        
        // Cria um novo chat sempre que abre a tela, como solicitado
        const newChatId = await createNewChat();
        setActiveChatId(newChatId);
      } catch (err: any) {
        console.error('Erro ao carregar chat:', err);
        Alert.alert('Erro', 'Não foi possível carregar o chat com o Oráculo.');
      } finally {
        setLoadingInitial(false);
      }
    }

    loadOrCreateChat();
  }, [activeTenantId]);

  const createNewChat = async (startMessage?: string) => {
    const title = startMessage 
      ? (startMessage.length > 30 ? startMessage.slice(0, 30) + '...' : startMessage)
      : `Conversa ${new Date().toLocaleDateString('pt-BR')}`;

    const { data: newChat, error: newChatErr } = await supabase
      .from('oracle_chats')
      .insert({
        tenant_id: activeTenantId,
        title: title,
        focus_key: 'global',
      })
      .select()
      .single();

    if (newChatErr) throw newChatErr;
    setChats(prev => [newChat, ...prev]);
    return newChat.id;
  };

  const handleNewChat = async () => {
    try {
      setLoadingInitial(true);
      const newId = await createNewChat();
      setActiveChatId(newId);
      setMessages([]);
      setShowHistory(false);
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Falha ao criar nova conversa.');
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleSelectChat = async (id: string) => {
    setActiveChatId(id);
    setShowHistory(false);
    setLoadingInitial(true);
    await loadMessages(id);
    setLoadingInitial(false);
  };

  const loadMessages = async (chatId: string) => {
    try {
      const { data, error } = await supabase
        .from('oracle_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 200);
    } catch (err: any) {
      console.error('Erro ao carregar mensagens:', err);
    }
  };

  const handleSend = async () => {
    if (!inputMessage.trim() || !activeTenantId || !activeChatId) return;
    
    const textToSend = inputMessage;
    setInputMessage('');
    setSending(true);

    // Update UI optimistic
    const tempMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const res = await supabase.functions.invoke('oracle-chat', {
        body: {
          chatId: activeChatId,
          message: textToSend,
          tenantId: activeTenantId,
          // Sem filtros de data para a versão mobile simplificada por enquanto
        },
      });

      if (res.error) throw new Error(res.error.message || 'Erro de comunicação');

      // Reload para pegar a resposta salva no banco
      await loadMessages(activeChatId);
    } catch (err: any) {
      console.error('Erro ao enviar mensagem:', err);
      Alert.alert('Erro', err.message);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
        {!isUser && (
          <View style={styles.assistantAvatar}>
            <Sparkles size={12} color="#A3FF47" />
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.messageText, isUser ? styles.textUser : styles.textAssistant]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  if (loadingInitial) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A3FF47" />
        <Text style={styles.loadingText}>Conectando ao Oráculo...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 140 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => setShowHistory(true)}>
          <History size={16} color="#9CA3AF" />
          <Text style={styles.headerButtonText}>Histórico</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerButtonPrimary} onPress={handleNewChat}>
          <Plus size={16} color="#000" />
          <Text style={styles.headerButtonTextPrimary}>Nova Conversa</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Sparkles size={32} color="#A3FF47" />
            </View>
            <Text style={styles.emptyTitle}>Olá! Eu sou o Oráculo.</Text>
            <Text style={styles.emptyText}>Estou pronto para analisar toda a operação do seu negócio. O que você gostaria de saber hoje?</Text>
          </View>
        }
        ListFooterComponent={
          sending ? (
            <View style={styles.typingContainer}>
              <ActivityIndicator size="small" color="#A3FF47" />
              <Text style={styles.typingText}>Pensando...</Text>
            </View>
          ) : null
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          placeholder="Pergunte ao Oráculo..."
          placeholderTextColor="#6B7280"
          value={inputMessage}
          onChangeText={setInputMessage}
          multiline
          maxLength={500}
        />
        <TouchableOpacity 
          style={[styles.sendButton, (!inputMessage.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputMessage.trim() || sending}
        >
          {sending ? <ActivityIndicator size="small" color="#000" /> : <Send size={18} color="#000" />}
        </TouchableOpacity>
      </View>

      {/* History Modal */}
      <Modal visible={showHistory} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Histórico de Conversas</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.closeBtn}>
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={chats}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.historyItem, activeChatId === item.id && styles.historyItemActive]}
                  onPress={() => handleSelectChat(item.id)}
                >
                  <MessageSquare size={16} color={activeChatId === item.id ? "#A3FF47" : "#9CA3AF"} />
                  <Text style={[styles.historyItemText, activeChatId === item.id && styles.historyItemTextActive]} numberOfLines={1}>
                    {item.title || "Conversa"}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyHistoryText}>Nenhum histórico encontrado.</Text>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  headerButtonText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },
  headerButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#A3FF47',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  headerButtonTextPrimary: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  messageRowUser: {
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    alignSelf: 'flex-start',
  },
  assistantAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#A3FF47',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
  },
  bubbleUser: {
    backgroundColor: '#A3FF47',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  textUser: {
    color: '#000',
    fontWeight: '500',
  },
  textAssistant: {
    color: '#E5E7EB',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    marginBottom: 16,
    marginLeft: 32,
  },
  typingText: {
    color: '#A3FF47',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#222',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: '#FFF',
    fontSize: 14,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#A3FF47',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeBtn: {
    padding: 4,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  historyItemActive: {
    borderColor: 'rgba(163, 255, 71, 0.3)',
    backgroundColor: 'rgba(163, 255, 71, 0.05)',
  },
  historyItemText: {
    color: '#D1D5DB',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  historyItemTextActive: {
    color: '#A3FF47',
    fontWeight: '700',
  },
  emptyHistoryText: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});

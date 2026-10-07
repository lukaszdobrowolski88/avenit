import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { appendMessage, mergeOlderMessages, applyMessageUpdate } from '../utils/chatLogic';

// Cache użytkowników na poziomie modułu (współdzielone między instancjami)
const usersCache = new Map();

// Cache wiadomości per konwersacja
const messagesCache = new Map();

// Uwaga: push + powiadomienia obsługuje SERWER (VPS Data API → push-hooks.notifyOnWrite):
// po insertcie do `messages` uczestnicy dostają push wiadomości, a osoby wspomniane (@,
// z messages.mentions) push 'mention' zawsze. Klient NIE wysyła już pushy (dublowałyby się,
// a dla zwykłego członka i tak kończyły się 403 na action:push_campaigns:send).
//
// Serwer (komunikator.js): wiadomość wysyła tylko uczestnik rozmowy, nadawcą jest zawsze
// zalogowany, a w kanale ogłoszeń (posting_policy='admins') piszą tylko administratorzy rozmowy.
// Zapisy mają .select(), bo serwer rozsyła realtime na podstawie zwróconych wierszy.

const PAGE_SIZE = 50;

const withSender = (m) => ({ ...m, sender: usersCache.get(m.sender_email) || m.sender || { email: m.sender_email } });

export default function useMessages(conversationId, userEmail) {
  // Inicjalizuj z cache jeśli dostępny
  const [messages, setMessagesState] = useState(() => {
    if (!conversationId) return [];
    return messagesCache.get(conversationId) || [];
  });
  const [loading, setLoading] = useState(() => !!conversationId && !messagesCache.has(conversationId));
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Bieżąca rozmowa i licznik zapytań — odpowiedzi dla nieaktualnej rozmowy/zapytania są odrzucane.
  const convRef = useRef(conversationId);
  convRef.current = conversationId;
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const messagesRef = useRef(messages);

  // Zmiana listy zawsze dla KONKRETNEJ rozmowy (nigdy nie trafi do innej).
  const updateMessages = useCallback((convId, updater) => {
    if (!convId || convId !== convRef.current) {
      // Rozmowa już nieaktywna — zaktualizuj tylko jej cache.
      const cached = messagesCache.get(convId);
      if (cached) messagesCache.set(convId, updater(cached));
      return;
    }
    setMessagesState(prev => {
      const next = updater(prev);
      messagesCache.set(convId, next);
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Dociągnij imiona/awatary nadawców w tle
  const loadSenders = useCallback((convId, rows) => {
    const uncached = [...new Set(rows.map(m => m.sender_email))].filter(e => e && !usersCache.has(e));
    if (!uncached.length) return;
    supabase
      .from('app_users')
      .select('email, full_name, avatar_url')
      .in('email', uncached)
      .then(({ data: usersData }) => {
        if (!usersData?.length) return;
        usersData.forEach(u => usersCache.set(u.email, u));
        updateMessages(convId, prev => prev.map(m => ({ ...m, sender: usersCache.get(m.sender_email) || m.sender })));
      }, () => {});
  }, [updateMessages]);

  // Najnowsza paczka wiadomości (zastępuje listę)
  const fetchMessages = useCallback(async () => {
    const convId = conversationId;
    if (!convId) {
      setMessagesState([]);
      setLoading(false);
      return;
    }
    const seq = ++requestSeqRef.current;

    try {
      if (!messagesCache.has(convId)) setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;
      // Spóźniona odpowiedź (inna rozmowa albo nowsze zapytanie) — pomiń.
      if (seq !== requestSeqRef.current || convId !== convRef.current) return;

      const rows = (data || []).map(withSender).reverse(); // od najstarszych do najnowszych
      // Zachowaj wiadomości dodane w międzyczasie (realtime/wysłane), których nie ma w paczce.
      updateMessages(convId, prev => {
        const newestFetched = rows.length ? new Date(rows[rows.length - 1].created_at).getTime() : 0;
        const later = prev.filter(m => !rows.some(r => r.id === m.id) && new Date(m.created_at).getTime() > newestFetched);
        return [...rows, ...later];
      });
      setHasMore((data || []).length === PAGE_SIZE);
      setError(null);
      loadSenders(convId, rows);
    } catch (err) {
      if (convId !== convRef.current) return;
      console.error('Error fetching messages:', err);
      setError(err);
    } finally {
      if (seq === requestSeqRef.current && convId === convRef.current) setLoading(false);
    }
  }, [conversationId, updateMessages, loadSenders]);

  // Załaduj starsze wiadomości (kursor: data najstarszej wczytanej) — bez duplikatów.
  const loadMore = useCallback(async () => {
    const convId = conversationId;
    if (!convId || !hasMore || loadingMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .is('deleted_at', null)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (fetchError) throw fetchError;
      if (convId !== convRef.current) return;

      const older = (data || []).map(withSender).reverse();
      updateMessages(convId, prev => mergeOlderMessages(prev, older));
      setHasMore((data || []).length === PAGE_SIZE);
      loadSenders(convId, older);
    } catch (err) {
      console.error('Error loading older messages:', err);
      throw err;
    } finally {
      loadingMoreRef.current = false;
      if (convId === convRef.current) setLoadingMore(false);
    }
  }, [conversationId, hasMore, updateMessages, loadSenders]);

  // Wyślij wiadomość. Rzuca błąd (np. 403 w kanale ogłoszeń) — wywołujący pokazuje komunikat.
  // extra: { messageType, metadata, mentions } – dla ankiet/modlitw/wydarzeń oraz @wzmianek
  const sendMessage = async (content, attachments = [], replyToId = null, extra = {}) => {
    const convId = conversationId;
    if (!convId || !userEmail) throw new Error(tr('Nie wybrano rozmowy.'));

    const messageData = {
      conversation_id: convId,
      sender_email: userEmail,
      content,
      attachments
    };
    if (replyToId) messageData.reply_to_id = replyToId;
    // Typ wiadomości + metadane (ankieta / modlitwa / wydarzenie)
    if (extra.messageType && extra.messageType !== 'text') messageData.message_type = extra.messageType;
    if (extra.metadata) messageData.metadata = extra.metadata;
    // Wzmianki @ (lista e-maili) – do podświetlenia i powiadomień
    const mentions = Array.isArray(extra.mentions) ? extra.mentions.filter(Boolean) : [];
    if (mentions.length > 0) messageData.mentions = mentions;

    const { data, error: sendError } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();

    if (sendError) throw sendError;

    // Dane nadawcy z cache lub bazy
    let userData = usersCache.get(userEmail);
    if (!userData) {
      const { data: fetchedUser } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .eq('email', userEmail)
        .maybeSingle();
      if (fetchedUser) {
        usersCache.set(userEmail, fetchedUser);
        userData = fetchedUser;
      }
    }

    updateMessages(convId, prev => appendMessage(prev, { ...data, sender: userData || { email: userEmail } }));
    // Push + powiadomienia (w tym 'mention') wysyła serwer po insertcie (push-hooks).
    return data;
  };

  // Edytuj wiadomość (autor). Rzuca błąd — wywołujący pokazuje komunikat.
  const editMessage = async (messageId, newContent) => {
    const convId = conversationId;
    const { data, error: editError } = await supabase
      .from('messages')
      .update({
        content: newContent,
        edited_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('sender_email', userEmail)
      .select();

    if (editError) throw editError;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error(tr('Możesz edytować tylko własne wiadomości.'));

    updateMessages(convId, prev => applyMessageUpdate(prev, row));
    return row;
  };

  // Usuń wiadomość (soft delete). Rzuca błąd — wywołujący pokazuje komunikat.
  const deleteMessage = async (messageId) => {
    const convId = conversationId;
    const { data, error: deleteError } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_email', userEmail)
      .select('id, conversation_id, deleted_at');

    if (deleteError) throw deleteError;
    if (!data || (Array.isArray(data) && data.length === 0)) {
      throw new Error(tr('Możesz usuwać tylko własne wiadomości.'));
    }

    updateMessages(convId, prev => prev.filter(m => m.id !== messageId));
  };

  // Przekaż wiadomość do innych konwersacji — każda osobno (błąd jednej nie blokuje pozostałych).
  const forwardMessage = async (message, targetConversationIds) => {
    if (!message || !targetConversationIds || targetConversationIds.length === 0) return [];

    const results = [];
    for (const targetConvId of targetConversationIds) {
      const { data, error: sendError } = await supabase
        .from('messages')
        .insert({
          conversation_id: targetConvId,
          sender_email: userEmail,
          content: message.content,
          attachments: message.attachments || [],
          forwarded_from: message.id
        })
        .select()
        .single();

      if (sendError) {
        console.error('Error forwarding to conversation:', targetConvId, sendError);
        results.push({ conversationId: targetConvId, success: false, error: sendError });
      } else {
        results.push({ conversationId: targetConvId, message: data, success: true });
        if (targetConvId === conversationId) {
          updateMessages(targetConvId, prev => appendMessage(prev, withSender(data)));
        }
      }
    }
    return results;
  };

  // Dodaj wiadomość z real-time (tylko z TEJ rozmowy)
  const addMessage = useCallback(async (newMessage) => {
    if (!newMessage?.id || newMessage.conversation_id !== convRef.current) return;
    let userData = usersCache.get(newMessage.sender_email);
    if (!userData) {
      const { data: fetchedUser } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .eq('email', newMessage.sender_email)
        .maybeSingle();
      if (fetchedUser) {
        usersCache.set(newMessage.sender_email, fetchedUser);
        userData = fetchedUser;
      }
    }
    updateMessages(newMessage.conversation_id, prev =>
      appendMessage(prev, { ...newMessage, sender: userData || { email: newMessage.sender_email } })
    );
  }, [updateMessages]);

  // Edycja / usunięcie z real-time
  const applyRemoteUpdate = useCallback((row) => {
    if (!row?.id) return;
    const convId = row.conversation_id || convRef.current;
    updateMessages(convId, prev => applyMessageUpdate(prev, row));
  }, [updateMessages]);

  const removeMessageLocal = useCallback((messageId) => {
    if (!messageId) return;
    updateMessages(convRef.current, prev => prev.filter(m => m.id !== messageId));
  }, [updateMessages]);

  // Reset przy zmianie konwersacji - użyj cache jeśli dostępny
  useEffect(() => {
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setHasMore(true);
    const cached = conversationId ? messagesCache.get(conversationId) : null;
    const next = cached || [];
    messagesRef.current = next;
    setMessagesState(next);
    setLoading(!!conversationId && !cached);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    loadMore,
    addMessage,
    applyRemoteUpdate,
    removeMessageLocal,
    forwardMessage,
    refetch: fetchMessages
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// Cache użytkowników na poziomie modułu (współdzielone między instancjami)
const usersCache = new Map();

// Cache wiadomości per konwersacja
const messagesCache = new Map();

// Wyślij push notifications do uczestników konwersacji (w tle)
async function sendPushToParticipants(conversationId, senderEmail, senderData, content) {
  try {
    // Pobierz uczestników konwersacji (oprócz nadawcy)
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_email')
      .eq('conversation_id', conversationId)
      .neq('user_email', senderEmail);

    if (!participants || participants.length === 0) return;

    // Pobierz nazwę konwersacji
    const { data: conversation } = await supabase
      .from('conversations')
      .select('name')
      .eq('id', conversationId)
      .single();

    const senderName = senderData?.full_name || senderEmail;
    const convName = conversation?.name || senderName;
    const messagePreview = content.length > 100 ? content.substring(0, 100) + '...' : content;

    // Wyślij push do każdego uczestnika (w tle, bez czekania)
    for (const p of participants) {
      supabase.functions.invoke('send-push', {
        body: {
          user_email: p.user_email,
          title: convName,
          body: `${senderName}: ${messagePreview}`,
          link: `/komunikator?conversation=${conversationId}`,
          tag: `message-${conversationId}`
        }
      }).catch(() => {
        // Ignoruj błędy - push jest opcjonalny
      });
    }
  } catch {
    // Ignoruj błędy - push jest opcjonalny, nie powinien blokować wysyłania wiadomości
  }
}

export default function useMessages(conversationId, userEmail) {
  // Inicjalizuj z cache jeśli dostępny
  const [messages, setMessages] = useState(() => {
    if (!conversationId) return [];
    return messagesCache.get(conversationId) || [];
  });
  const [loading, setLoading] = useState(() => {
    // Nie pokazuj loading jeśli mamy cache
    return !messagesCache.has(conversationId);
  });
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const abortControllerRef = useRef(null);

  const PAGE_SIZE = 50;

  const fetchMessages = useCallback(async (offset = 0, append = false) => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      if (!append) setLoading(true);

      const { data, error: fetchError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (fetchError) throw fetchError;

      // NATYCHMIAST pokaż wiadomości z cache (lub bez pełnych danych użytkowników)
      const messagesWithSenders = data.map(m => ({
        ...m,
        sender: usersCache.get(m.sender_email) || { email: m.sender_email }
      }));

      // Odwróć kolejność (od najstarszych do najnowszych dla wyświetlania)
      messagesWithSenders.reverse();

      if (append) {
        setMessages(prev => {
          const updated = [...messagesWithSenders, ...prev];
          messagesCache.set(conversationId, updated);
          return updated;
        });
      } else {
        setMessages(messagesWithSenders);
        messagesCache.set(conversationId, messagesWithSenders);
      }

      setHasMore(data.length === PAGE_SIZE);
      setLoading(false); // Zakończ ładowanie OD RAZU

      // Pobierz dane użytkowników W TLE (bez blokowania UI)
      const senderEmails = [...new Set(data.map(m => m.sender_email))];
      const uncachedEmails = senderEmails.filter(email => !usersCache.has(email));

      if (uncachedEmails.length > 0) {
        supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .in('email', uncachedEmails)
          .then(({ data: usersData }) => {
            if (usersData && usersData.length > 0) {
              usersData.forEach(u => usersCache.set(u.email, u));
              // Zaktualizuj wiadomości z pełnymi danymi użytkowników
              setMessages(prev => prev.map(m => ({
                ...m,
                sender: usersCache.get(m.sender_email) || m.sender
              })));
            }
          });
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err.message);
      setLoading(false);
    }
  }, [conversationId]);

  // Wyślij wiadomość
  const sendMessage = async (content, attachments = [], replyToId = null) => {
    if (!conversationId || !userEmail) return null;

    try {
      const messageData = {
        conversation_id: conversationId,
        sender_email: userEmail,
        content,
        attachments
      };

      // Dodaj reply_to_id jeśli istnieje
      if (replyToId) {
        messageData.reply_to_id = replyToId;
      }

      const { data, error: sendError } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();

      if (sendError) throw sendError;

      // Pobierz dane nadawcy z cache lub bazy
      let userData = usersCache.get(userEmail);
      if (!userData) {
        const { data: fetchedUser } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .eq('email', userEmail)
          .single();
        if (fetchedUser) {
          usersCache.set(userEmail, fetchedUser);
          userData = fetchedUser;
        }
      }

      const messageWithSender = {
        ...data,
        sender: userData || { email: userEmail }
      };

      setMessages(prev => {
        const updated = [...prev, messageWithSender];
        messagesCache.set(conversationId, updated);
        return updated;
      });

      // Powiadomienia w bazie są tworzone przez trigger (trigger_message_notification)
      // Push notifications wysyłamy z klienta dla niezawodności
      sendPushToParticipants(conversationId, userEmail, userData, content);

      return data;
    } catch (err) {
      console.error('Error sending message:', err);
      throw err;
    }
  };

  // Edytuj wiadomość
  const editMessage = async (messageId, newContent) => {
    try {
      const { data, error: editError } = await supabase
        .from('messages')
        .update({
          content: newContent,
          edited_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .eq('sender_email', userEmail)
        .select()
        .single();

      if (editError) throw editError;

      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, ...data } : m)
      );

      return data;
    } catch (err) {
      console.error('Error editing message:', err);
      throw err;
    }
  };

  // Usuń wiadomość (soft delete)
  const deleteMessage = async (messageId) => {
    try {
      const { error: deleteError } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_email', userEmail);

      if (deleteError) throw deleteError;

      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('Error deleting message:', err);
      throw err;
    }
  };

  // Załaduj więcej wiadomości (starszych)
  const loadMore = async () => {
    if (!hasMore || loading) return;
    await fetchMessages(messages.length, true);
  };

  // Przekaż wiadomość do innych konwersacji
  const forwardMessage = async (message, targetConversationIds) => {
    if (!message || !targetConversationIds || targetConversationIds.length === 0) return;

    const results = [];

    for (const targetConvId of targetConversationIds) {
      try {
        const forwardedContent = message.content;
        const forwardedAttachments = message.attachments || [];

        const { data, error: sendError } = await supabase
          .from('messages')
          .insert({
            conversation_id: targetConvId,
            sender_email: userEmail,
            content: forwardedContent,
            attachments: forwardedAttachments,
            forwarded_from: message.id
          })
          .select()
          .single();

        if (sendError) throw sendError;

        results.push({ conversationId: targetConvId, message: data, success: true });
      } catch (err) {
        console.error('Error forwarding to conversation:', targetConvId, err);
        results.push({ conversationId: targetConvId, success: false, error: err });
      }
    }

    return results;
  };

  // Dodaj wiadomość z real-time
  const addMessage = useCallback(async (newMessage) => {
    // Pobierz dane nadawcy z cache lub bazy
    let userData = usersCache.get(newMessage.sender_email);
    if (!userData) {
      const { data: fetchedUser } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .eq('email', newMessage.sender_email)
        .single();
      if (fetchedUser) {
        usersCache.set(newMessage.sender_email, fetchedUser);
        userData = fetchedUser;
      }
    }

    const messageWithSender = {
      ...newMessage,
      sender: userData || { email: newMessage.sender_email }
    };

    setMessages(prev => {
      // Sprawdź czy wiadomość już istnieje
      if (prev.some(m => m.id === newMessage.id)) {
        return prev;
      }
      const updated = [...prev, messageWithSender];
      messagesCache.set(newMessage.conversation_id, updated);
      return updated;
    });
  }, []);

  // Reset przy zmianie konwersacji - użyj cache jeśli dostępny
  useEffect(() => {
    if (conversationId) {
      const cached = messagesCache.get(conversationId);
      if (cached) {
        setMessages(cached);
        setLoading(false);
      } else {
        setMessages([]);
        setLoading(true);
      }
    } else {
      setMessages([]);
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return {
    messages,
    loading,
    error,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    loadMore,
    addMessage,
    forwardMessage,
    refetch: fetchMessages
  };
}

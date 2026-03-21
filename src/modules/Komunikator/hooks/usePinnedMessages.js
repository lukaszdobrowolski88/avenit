import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export default function usePinnedMessages(conversationId, userEmail) {
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pobierz przypięte wiadomości
  const fetchPinnedMessages = useCallback(async () => {
    if (!conversationId) {
      setPinnedMessages([]);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('pinned_messages')
        .select(`
          id,
          message_id,
          pinned_by,
          pinned_at,
          messages (
            id,
            content,
            sender_email,
            created_at,
            attachments
          )
        `)
        .eq('conversation_id', conversationId)
        .order('pinned_at', { ascending: false });

      if (error) {
        // Tabela może nie istnieć
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setPinnedMessages([]);
          return;
        }
        throw error;
      }

      // Pobierz dane użytkowników dla wiadomości
      const senderEmails = [...new Set((data || []).map(p => p.messages?.sender_email).filter(Boolean))];

      let usersMap = {};
      if (senderEmails.length > 0) {
        const { data: usersData } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .in('email', senderEmails);

        (usersData || []).forEach(u => {
          usersMap[u.email] = u;
        });
      }

      // Mapuj z danymi użytkowników
      const enrichedPins = (data || []).map(pin => ({
        ...pin,
        message: pin.messages ? {
          ...pin.messages,
          sender: usersMap[pin.messages.sender_email] || { email: pin.messages.sender_email }
        } : null
      }));

      setPinnedMessages(enrichedPins);
    } catch (err) {
      console.error('Error fetching pinned messages:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Przypnij wiadomość
  const pinMessage = useCallback(async (messageId) => {
    if (!conversationId || !userEmail || !messageId) return;

    try {
      const { data, error } = await supabase
        .from('pinned_messages')
        .insert({
          message_id: messageId,
          conversation_id: conversationId,
          pinned_by: userEmail
        })
        .select()
        .single();

      if (error) throw error;

      // Odśwież listę
      await fetchPinnedMessages();
      return data;
    } catch (err) {
      console.error('Error pinning message:', err);
      throw err;
    }
  }, [conversationId, userEmail, fetchPinnedMessages]);

  // Odepnij wiadomość
  const unpinMessage = useCallback(async (messageId) => {
    if (!conversationId || !messageId) return;

    try {
      const { error } = await supabase
        .from('pinned_messages')
        .delete()
        .eq('message_id', messageId)
        .eq('conversation_id', conversationId);

      if (error) throw error;

      // Aktualizuj lokalnie
      setPinnedMessages(prev => prev.filter(p => p.message_id !== messageId));
    } catch (err) {
      console.error('Error unpinning message:', err);
      throw err;
    }
  }, [conversationId]);

  // Sprawdź czy wiadomość jest przypięta
  const isMessagePinned = useCallback((messageId) => {
    return pinnedMessages.some(p => p.message_id === messageId);
  }, [pinnedMessages]);

  // Toggle pin
  const togglePin = useCallback(async (messageId) => {
    if (isMessagePinned(messageId)) {
      await unpinMessage(messageId);
    } else {
      await pinMessage(messageId);
    }
  }, [isMessagePinned, pinMessage, unpinMessage]);

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    const channelName = `pinned-${conversationId}-${Date.now()}`;

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pinned_messages',
        filter: `conversation_id=eq.${conversationId}`
      }, () => {
        // Odśwież przy każdej zmianie
        fetchPinnedMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [conversationId, fetchPinnedMessages]);

  // Pobierz przy zmianie konwersacji
  useEffect(() => {
    fetchPinnedMessages();
  }, [fetchPinnedMessages]);

  return {
    pinnedMessages,
    loading,
    pinMessage,
    unpinMessage,
    togglePin,
    isMessagePinned,
    refetch: fetchPinnedMessages
  };
}

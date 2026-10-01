import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useReadReceipts(conversationId, userEmail) {
  const [readReceipts, setReadReceipts] = useState({});
  // readReceipts: { messageId: [{ user_email, read_at }] }

  // Pobierz potwierdzenia przeczytania dla konwersacji
  const fetchReadReceipts = useCallback(async () => {
    if (!conversationId) return;

    // Pobierz ID wiadomości z tej konwersacji
    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null);

    if (!messages || messages.length === 0) return;

    const messageIds = messages.map(m => m.id);

    // Pobierz potwierdzenia przeczytania/doręczenia
    const { data: receipts } = await supabase
      .from('message_read_receipts')
      .select('message_id, user_email, read_at, delivered_at')
      .in('message_id', messageIds);

    if (receipts) {
      // Grupuj po message_id
      const grouped = {};
      receipts.forEach(r => {
        if (!grouped[r.message_id]) {
          grouped[r.message_id] = [];
        }
        grouped[r.message_id].push({
          user_email: r.user_email,
          read_at: r.read_at,
          delivered_at: r.delivered_at
        });
      });
      setReadReceipts(grouped);
    }
  }, [conversationId]);

  // Oznacz wiadomości jako przeczytane
  const markMessagesAsRead = useCallback(async (messageIds) => {
    if (!userEmail || !messageIds || messageIds.length === 0) return;

    try {
      const now = new Date().toISOString();
      // Przeczytane = również doręczone. Aktualizuj istniejące wiersze (np. "doręczone" -> "przeczytane").
      const receiptsToInsert = messageIds.map(messageId => ({
        message_id: messageId,
        user_email: userEmail,
        read_at: now,
        delivered_at: now
      }));

      await supabase
        .from('message_read_receipts')
        .upsert(receiptsToInsert, {
          onConflict: 'message_id,user_email',
          ignoreDuplicates: false
        });
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }, [userEmail]);

  // Oznacz wiadomości jako doręczone (bez oznaczania jako przeczytane)
  const markMessagesAsDelivered = useCallback(async (messageIds) => {
    if (!userEmail || !messageIds || messageIds.length === 0) return;

    try {
      const receiptsToInsert = messageIds.map(messageId => ({
        message_id: messageId,
        user_email: userEmail,
        delivered_at: new Date().toISOString(),
        read_at: null
      }));

      // ignoreDuplicates: nie nadpisuj istniejącego "przeczytane"
      await supabase
        .from('message_read_receipts')
        .upsert(receiptsToInsert, {
          onConflict: 'message_id,user_email',
          ignoreDuplicates: true
        });
    } catch (err) {
      // delivered jest opcjonalne – ignoruj błędy
    }
  }, [userEmail]);

  // Subskrypcja real-time
  useEffect(() => {
    if (!conversationId) return;

    fetchReadReceipts();

    const subscription = supabase
      .channel(`read-receipts-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_read_receipts'
      }, (payload) => {
        const rec = payload.new;
        if (!rec) return;
        setReadReceipts(prev => {
          const updated = { ...prev };
          const list = updated[rec.message_id] ? [...updated[rec.message_id]] : [];
          const idx = list.findIndex(r => r.user_email === rec.user_email);
          const entry = { user_email: rec.user_email, read_at: rec.read_at, delivered_at: rec.delivered_at };
          if (idx >= 0) list[idx] = entry; else list.push(entry);
          updated[rec.message_id] = list;
          return updated;
        });
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId, fetchReadReceipts]);

  // Sprawdź czy wiadomość została przeczytana przez kogokolwiek (oprócz nadawcy)
  const isMessageRead = useCallback((messageId, senderEmail) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.some(r => r.user_email !== senderEmail);
  }, [readReceipts]);

  // Pobierz listę użytkowników, którzy przeczytali wiadomość
  const getReadBy = useCallback((messageId, senderEmail) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.filter(r => r.user_email !== senderEmail && r.read_at);
  }, [readReceipts]);

  // Status doręczenia dla ptaszków: 'sent' | 'delivered' | 'read'
  const getDeliveryStatus = useCallback((messageId, senderEmail) => {
    const receipts = (readReceipts[messageId] || []).filter(r => r.user_email !== senderEmail);
    if (receipts.some(r => r.read_at)) return 'read';
    if (receipts.some(r => r.delivered_at)) return 'delivered';
    return 'sent';
  }, [readReceipts]);

  return {
    readReceipts,
    markMessagesAsRead,
    markMessagesAsDelivered,
    isMessageRead,
    getReadBy,
    getDeliveryStatus,
    refetch: fetchReadReceipts
  };
}

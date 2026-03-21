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

    // Pobierz potwierdzenia przeczytania
    const { data: receipts } = await supabase
      .from('message_read_receipts')
      .select('message_id, user_email, read_at')
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
          read_at: r.read_at
        });
      });
      setReadReceipts(grouped);
    }
  }, [conversationId]);

  // Oznacz wiadomości jako przeczytane
  const markMessagesAsRead = useCallback(async (messageIds) => {
    if (!userEmail || !messageIds || messageIds.length === 0) return;

    try {
      // Filtruj tylko wiadomości, które nie są nasze
      const receiptsToInsert = messageIds.map(messageId => ({
        message_id: messageId,
        user_email: userEmail,
        read_at: new Date().toISOString()
      }));

      await supabase
        .from('message_read_receipts')
        .upsert(receiptsToInsert, {
          onConflict: 'message_id,user_email',
          ignoreDuplicates: true
        });
    } catch (err) {
      console.error('Error marking messages as read:', err);
    }
  }, [userEmail]);

  // Subskrypcja real-time
  useEffect(() => {
    if (!conversationId) return;

    fetchReadReceipts();

    const subscription = supabase
      .channel(`read-receipts-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_read_receipts'
      }, (payload) => {
        const newReceipt = payload.new;
        setReadReceipts(prev => {
          const updated = { ...prev };
          if (!updated[newReceipt.message_id]) {
            updated[newReceipt.message_id] = [];
          }
          // Unikaj duplikatów
          if (!updated[newReceipt.message_id].some(r => r.user_email === newReceipt.user_email)) {
            updated[newReceipt.message_id] = [
              ...updated[newReceipt.message_id],
              { user_email: newReceipt.user_email, read_at: newReceipt.read_at }
            ];
          }
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
    return receipts.filter(r => r.user_email !== senderEmail);
  }, [readReceipts]);

  return {
    readReceipts,
    markMessagesAsRead,
    isMessageRead,
    getReadBy,
    refetch: fetchReadReceipts
  };
}

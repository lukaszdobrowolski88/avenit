import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// Zmiany wiadomości TEJ rozmowy. Serwer wysyła zdarzenia tylko uczestnikom, ale filtr kanału
// nie jest stosowany — zdarzenia innych rozmów odrzucamy tutaj (po conversation_id).
export default function useRealtimeMessages(conversationId, onNewMessage, onMessageUpdate, onMessageDelete) {
  const handlersRef = useRef({ onNewMessage, onMessageUpdate, onMessageDelete });
  handlersRef.current = { onNewMessage, onMessageUpdate, onMessageDelete };

  const handleChanges = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload || {};
    const h = handlersRef.current;

    switch (eventType) {
      case 'INSERT':
        if (newRecord?.conversation_id === conversationId && !newRecord.deleted_at) {
          h.onNewMessage?.(newRecord);
        }
        break;
      case 'UPDATE':
        if (newRecord?.id && (!newRecord.conversation_id || newRecord.conversation_id === conversationId)) {
          // Usunięcie to „soft delete” (deleted_at) — zdarzenie UPDATE.
          if (newRecord.deleted_at) h.onMessageDelete?.(newRecord.id);
          else if (newRecord.conversation_id === conversationId) h.onMessageUpdate?.(newRecord);
        }
        break;
      case 'DELETE':
        if (oldRecord?.id && oldRecord.conversation_id === conversationId) {
          h.onMessageDelete?.(oldRecord.id);
        }
        break;
      default:
        break;
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;

    const subscription = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, handleChanges)
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [conversationId, handleChanges]);
}

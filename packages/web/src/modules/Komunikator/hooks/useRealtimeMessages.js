import { useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useRealtimeMessages(conversationId, onNewMessage, onMessageUpdate, onMessageDelete) {
  const handleChanges = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (onNewMessage && newRecord.conversation_id === conversationId) {
          onNewMessage(newRecord);
        }
        break;
      case 'UPDATE':
        if (onMessageUpdate && newRecord.conversation_id === conversationId) {
          // Jeśli wiadomość została usunięta (soft delete)
          if (newRecord.deleted_at && !oldRecord?.deleted_at) {
            if (onMessageDelete) {
              onMessageDelete(newRecord.id);
            }
          } else {
            onMessageUpdate(newRecord);
          }
        }
        break;
      case 'DELETE':
        if (onMessageDelete && oldRecord?.conversation_id === conversationId) {
          onMessageDelete(oldRecord.id);
        }
        break;
    }
  }, [conversationId, onNewMessage, onMessageUpdate, onMessageDelete]);

  useEffect(() => {
    if (!conversationId) return;

    const channelName = `messages:${conversationId}`;

    const subscription = supabase
      .channel(channelName)
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

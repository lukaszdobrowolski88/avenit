import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useRealtimeMail(accountId, onNewMessage, onMessageUpdate, onMessageDelete) {
  const channelRef = useRef(null);

  // Callback refs to avoid re-subscribing
  const onNewMessageRef = useRef(onNewMessage);
  const onMessageUpdateRef = useRef(onMessageUpdate);
  const onMessageDeleteRef = useRef(onMessageDelete);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
    onMessageUpdateRef.current = onMessageUpdate;
    onMessageDeleteRef.current = onMessageDelete;
  }, [onNewMessage, onMessageUpdate, onMessageDelete]);

  // Obsługa zmian
  const handleChanges = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        if (onNewMessageRef.current) {
          onNewMessageRef.current(newRecord);
        }
        break;

      case 'UPDATE':
        if (onMessageUpdateRef.current) {
          onMessageUpdateRef.current(newRecord, oldRecord);
        }
        break;

      case 'DELETE':
        if (onMessageDeleteRef.current) {
          onMessageDeleteRef.current(oldRecord);
        }
        break;
    }
  }, []);

  // Subskrybuj na zmiany
  useEffect(() => {
    if (!accountId) return;

    // Utwórz kanał
    const channel = supabase
      .channel(`mail-messages-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'mail_messages',
          filter: `account_id=eq.${accountId}`
        },
        handleChanges
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Subscribed to mail updates');
        }
      });

    channelRef.current = channel;

    // Cleanup
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [accountId, handleChanges]);

  // Subskrybuj również na zmiany folderów (liczniki)
  useEffect(() => {
    if (!accountId) return;

    const channel = supabase
      .channel(`mail-folders-${accountId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mail_folders',
          filter: `account_id=eq.${accountId}`
        },
        (payload) => {
          // Można dodać callback dla aktualizacji folderów
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId]);

  // Wyślij powiadomienie o nowej wiadomości
  const notifyNewMessage = useCallback(async (message) => {
    // Integracja z NotificationContext
    // Można dodać push notification
  }, []);

  return {
    notifyNewMessage
  };
}

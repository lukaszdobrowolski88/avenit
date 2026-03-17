import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useTypingStatus(conversationId, userEmail) {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // Pobierz aktualnie piszących użytkowników
  const fetchTypingUsers = useCallback(async () => {
    if (!conversationId) return;

    const { data } = await supabase
      .from('typing_status')
      .select('user_email, started_at')
      .eq('conversation_id', conversationId)
      .neq('user_email', userEmail)
      .gt('started_at', new Date(Date.now() - 10000).toISOString());

    if (data) {
      setTypingUsers(data.map(t => t.user_email));
    }
  }, [conversationId, userEmail]);

  // Ustaw status "piszę"
  const startTyping = useCallback(async () => {
    if (!conversationId || !userEmail || isTypingRef.current) return;

    isTypingRef.current = true;

    try {
      await supabase
        .from('typing_status')
        .upsert({
          conversation_id: conversationId,
          user_email: userEmail,
          started_at: new Date().toISOString()
        }, {
          onConflict: 'conversation_id,user_email'
        });
    } catch (err) {
      console.error('Error setting typing status:', err);
    }

    // Automatycznie usuń status po 3 sekundach nieaktywności
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [conversationId, userEmail]);

  // Usuń status "piszę"
  const stopTyping = useCallback(async () => {
    if (!conversationId || !userEmail) return;

    isTypingRef.current = false;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    try {
      await supabase
        .from('typing_status')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_email', userEmail);
    } catch (err) {
      console.error('Error removing typing status:', err);
    }
  }, [conversationId, userEmail]);

  // Subskrypcja real-time
  useEffect(() => {
    if (!conversationId) return;

    fetchTypingUsers();

    const subscription = supabase
      .channel(`typing-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'typing_status',
        filter: `conversation_id=eq.${conversationId}`
      }, () => {
        fetchTypingUsers();
      })
      .subscribe();

    // Czyszczenie starych statusów co 5 sekund
    const cleanupInterval = setInterval(() => {
      setTypingUsers(prev => prev.filter(() => true)); // Trigger re-fetch
      fetchTypingUsers();
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearInterval(cleanupInterval);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, fetchTypingUsers]);

  // Cleanup przy odmontowaniu
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        stopTyping();
      }
    };
  }, [stopTyping]);

  return {
    typingUsers,
    startTyping,
    stopTyping
  };
}

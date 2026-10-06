import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { sameEmail } from '../utils/chatLogic';

// „Pisze…” — zapis w tle (.silent(): błąd nie jest komunikatem dla użytkownika).
// canWrite=false (brak uprawnienia z roli) → tylko odczyt, bez zapisów kończących się 403.
export default function useTypingStatus(conversationId, userEmail, { canWrite = true } = {}) {
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const convRef = useRef(conversationId);
  convRef.current = conversationId;

  // Pobierz aktualnie piszących użytkowników
  const fetchTypingUsers = useCallback(async () => {
    if (!conversationId) return;

    const { data, error } = await supabase
      .from('typing_status')
      .select('user_email, started_at')
      .eq('conversation_id', conversationId)
      .gt('started_at', new Date(Date.now() - 10000).toISOString());

    if (error || conversationId !== convRef.current) return;
    setTypingUsers((data || []).map(t => t.user_email).filter(e => e && !sameEmail(e, userEmail)));
  }, [conversationId, userEmail]);

  // Usuń status "piszę"
  const stopTyping = useCallback(async () => {
    if (!conversationId || !userEmail) return;
    const wasTyping = isTypingRef.current;
    isTypingRef.current = false;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (!wasTyping || !canWrite) return;

    await supabase
      .from('typing_status')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_email', userEmail)
      .select('conversation_id, user_email')
      .silent()
      .then(() => {}, () => {});
  }, [conversationId, userEmail, canWrite]);

  // Ustaw status "piszę"
  const startTyping = useCallback(async () => {
    if (!conversationId || !userEmail || !canWrite || isTypingRef.current) return;
    isTypingRef.current = true;

    await supabase
      .from('typing_status')
      .upsert({
        conversation_id: conversationId,
        user_email: userEmail,
        started_at: new Date().toISOString()
      }, {
        onConflict: 'conversation_id,user_email'
      })
      .select('conversation_id, user_email')
      .silent()
      .then(() => {}, () => {});

    // Automatycznie usuń status po 3 sekundach nieaktywności
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [conversationId, userEmail, canWrite, stopTyping]);

  // Subskrypcja real-time + odświeżanie co 5 s (wygasanie starych statusów)
  useEffect(() => {
    if (!conversationId) return;

    setTypingUsers([]);
    fetchTypingUsers();

    const subscription = supabase
      .channel(`typing-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'typing_status',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        const row = payload?.new || payload?.old;
        if (row?.conversation_id && row.conversation_id !== conversationId) return;
        fetchTypingUsers();
      })
      .subscribe();

    const cleanupInterval = setInterval(fetchTypingUsers, 5000);

    return () => {
      subscription.unsubscribe();
      clearInterval(cleanupInterval);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId, fetchTypingUsers]);

  // Cleanup przy odmontowaniu / zmianie rozmowy
  useEffect(() => {
    return () => {
      if (isTypingRef.current) stopTyping();
    };
  }, [stopTyping]);

  return {
    typingUsers,
    startTyping,
    stopTyping
  };
}

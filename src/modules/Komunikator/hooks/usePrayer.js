import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sameEmail } from '../utils/chatLogic';

// Odpowiedzi "🙏 Modlę się": messageId -> [{ id, user_email }]
export default function usePrayer(conversationId, userEmail) {
  const [responses, setResponses] = useState({});
  const pendingRef = useRef(new Set()); // strażnik podwójnego kliknięcia

  const fetchResponses = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('prayer_responses')
        .select('id, message_id, user_email')
        .in('message_id', messageIds);

      if (error) {
        if (error.code === '42P01') return;
        throw error;
      }

      const grouped = (data || []).reduce((acc, r) => {
        (acc[r.message_id] = acc[r.message_id] || []).push(r);
        return acc;
      }, {});
      setResponses(prev => ({ ...prev, ...grouped }));
    } catch (err) {
      console.error('Error fetching prayer responses:', err);
    }
  }, []);

  const togglePraying = useCallback(async (messageId) => {
    if (!messageId || !userEmail || pendingRef.current.has(messageId)) return;
    pendingRef.current.add(messageId);
    const current = responses[messageId] || [];
    const mine = current.find(r => sameEmail(r.user_email, userEmail));

    try {
      if (mine) {
        const { error } = await supabase
          .from('prayer_responses')
          .delete()
          .eq('id', mine.id)
          .select('id, message_id');
        if (error) throw error;
        setResponses(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== mine.id)
        }));
      } else {
        const { data, error } = await supabase
          .from('prayer_responses')
          .insert({ message_id: messageId, user_email: userEmail })
          .select()
          .single();
        if (error) throw error;
        setResponses(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []).filter(r => r.id !== data.id), data]
        }));
      }
    } catch (err) {
      console.error('Error toggling prayer:', err);
      toast.error(err, { fallback: tr('Nie udało się zapisać. Spróbuj ponownie.') });
    } finally {
      pendingRef.current.delete(messageId);
    }
  }, [responses, userEmail]);

  const getForMessage = useCallback((messageId) => {
    const list = responses[messageId] || [];
    return {
      count: list.length,
      voters: list.map(r => r.user_email),
      hasPrayed: list.some(r => sameEmail(r.user_email, userEmail))
    };
  }, [responses, userEmail]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`prayer-responses-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'prayer_responses' }, (payload) => {
        if (payload?.eventType === 'INSERT' && payload.new?.message_id) {
          const r = payload.new;
          setResponses(prev => {
            const existing = prev[r.message_id] || [];
            if (existing.some(x => x.id === r.id)) return prev;
            return { ...prev, [r.message_id]: [...existing, r] };
          });
        } else if (payload?.eventType === 'DELETE' && payload.old?.message_id) {
          const r = payload.old;
          setResponses(prev => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] || []).filter(x => x.id !== r.id)
          }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  return { responses, fetchResponses, togglePraying, getForMessage };
}

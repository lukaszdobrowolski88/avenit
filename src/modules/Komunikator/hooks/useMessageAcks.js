import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sameEmail } from '../utils/chatLogic';

// „Ważne — potwierdź przeczytanie” (migracja 115): potwierdzenia „Rozumiem” wiadomości z
// requires_ack. Odczyt message_acks przez /api/db (uczestnicy rozmowy), zapis tylko serwer
// (fn chat-ack) — realtime dopisuje potwierdzenia innych osób na żywo.
// acks: messageId -> [{ id, message_id, user_email, acked_at }]

export const isImportantMessage = (m) => m?.requires_ack === true && !m?.deleted_at && m?.message_type !== 'system';

// Wywołanie fn chat-ack; błąd z kodem serwera (np. ACK_REMIND_TOO_SOON + next_remind_at).
export async function chatAck(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('chat-ack', { body: { action, ...body }, silent: true });
  if (error) {
    const err = new Error(error.message || tr('Nie udało się zapisać. Spróbuj ponownie.'));
    err.status = error.status;
    err.code = error.context?.code;
    err.nextRemindAt = error.context?.next_remind_at || null;
    throw err;
  }
  return data;
}

export default function useMessageAcks(conversationId, userEmail) {
  const [acks, setAcks] = useState({});
  const pendingRef = useRef(new Set()); // strażnik podwójnego kliknięcia
  const [busyIds, setBusyIds] = useState(() => new Set());

  const fetchAcks = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('message_acks')
        .select('id, message_id, user_email, acked_at')
        .in('message_id', messageIds);
      if (error) {
        if (error.code === '42P01') return; // tenant przed migracją 115
        throw error;
      }
      const grouped = Object.fromEntries(messageIds.map(id => [id, []]));
      (data || []).forEach(r => { (grouped[r.message_id] = grouped[r.message_id] || []).push(r); });
      setAcks(prev => ({ ...prev, ...grouped }));
    } catch (err) {
      console.error('Error fetching acks:', err);
    }
  }, []);

  const acknowledge = useCallback(async (messageId) => {
    if (!messageId || !userEmail || pendingRef.current.has(messageId)) return;
    pendingRef.current.add(messageId);
    setBusyIds(prev => new Set(prev).add(messageId));
    try {
      const out = await chatAck('ack', { message_id: messageId });
      const row = out?.ack;
      if (row?.id) {
        setAcks(prev => {
          const list = prev[messageId] || [];
          if (list.some(x => x.id === row.id)) return prev;
          return { ...prev, [messageId]: [...list, row] };
        });
      }
      window.dispatchEvent(new CustomEvent('komunikator:acks-changed'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się potwierdzić. Spróbuj ponownie.') });
    } finally {
      pendingRef.current.delete(messageId);
      setBusyIds(prev => { const n = new Set(prev); n.delete(messageId); return n; });
    }
  }, [userEmail]);

  const getForMessage = useCallback((messageId) => {
    const list = acks[messageId] || [];
    return {
      count: list.length,
      mine: list.some(r => sameEmail(r.user_email, userEmail)),
      emails: list.map(r => r.user_email),
      busy: busyIds.has(messageId),
    };
  }, [acks, userEmail, busyIds]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = supabase
      .channel(`message-acks-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_acks' }, (payload) => {
        const r = payload?.new;
        if (payload?.eventType !== 'INSERT' || !r?.message_id || !r.id) return;
        setAcks(prev => {
          // Tylko wiadomości tej rozmowy (wczytane — klucz już jest); realtime ignoruje filtr.
          if (!(r.message_id in prev)) return prev;
          const list = prev[r.message_id] || [];
          if (list.some(x => x.id === r.id)) return prev;
          return { ...prev, [r.message_id]: [...list, r] };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  return { acks, fetchAcks, acknowledge, getForMessage };
}

// Plakietka „Ważne” na liście rozmów: ile ważnych wiadomości czeka na moje „Rozumiem”.
// Odświeżenie: po wejściu, po moim potwierdzeniu, po nowej ważnej wiadomości (realtime).
export function usePendingAcks(userEmail) {
  const [counts, setCounts] = useState({});
  const timerRef = useRef(null);

  const refetch = useCallback(async () => {
    if (!userEmail) { setCounts({}); return; }
    try {
      const out = await chatAck('pending');
      setCounts(out?.counts || {});
    } catch {
      /* brak funkcji/migracji — bez plakietek */
    }
  }, [userEmail]);

  useEffect(() => {
    refetch();
    const schedule = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(refetch, 600);
    };
    const onChanged = () => schedule();
    window.addEventListener('komunikator:acks-changed', onChanged);
    const channel = supabase
      .channel('pending-acks')
      // Nowa (albo usunięta) ważna wiadomość od kogoś innego.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        if (payload?.new?.requires_ack === true && !sameEmail(payload.new.sender_email, userEmail)) schedule();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_acks' }, (payload) => {
        if (sameEmail(payload?.new?.user_email, userEmail)) schedule();
      })
      .subscribe();
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener('komunikator:acks-changed', onChanged);
      supabase.removeChannel(channel);
    };
  }, [refetch, userEmail]);

  return { counts, refetch };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { unreadIdsToMark, sameEmail, receiptStatus, seenBy } from '../utils/chatLogic';

const RECEIPT_COLS = 'message_id, user_email, read_at, delivered_at';

export default function useReadReceipts(conversationId, userEmail) {
  const [readReceipts, setReadReceipts] = useState({});
  // readReceipts: { messageId: [{ user_email, read_at, delivered_at }] }
  const receiptsRef = useRef(readReceipts);
  receiptsRef.current = readReceipts;
  const fetchedRef = useRef(new Set()); // wiadomości, dla których pobrano już potwierdzenia
  const markedRef = useRef(new Set());  // wiadomości oznaczone już przeze mnie jako przeczytane

  // Reset przy zmianie rozmowy
  useEffect(() => {
    fetchedRef.current = new Set();
    markedRef.current = new Set();
    setReadReceipts({});
  }, [conversationId]);

  const mergeReceipt = (prev, rec) => {
    const list = prev[rec.message_id] ? [...prev[rec.message_id]] : [];
    const idx = list.findIndex(r => sameEmail(r.user_email, rec.user_email));
    const entry = { user_email: rec.user_email, read_at: rec.read_at, delivered_at: rec.delivered_at };
    if (idx >= 0) list[idx] = { ...list[idx], ...entry }; else list.push(entry);
    return { ...prev, [rec.message_id]: list };
  };

  // Pobierz potwierdzenia dla podanych (wczytanych) wiadomości — tylko tych, których jeszcze nie znamy.
  const fetchReadReceipts = useCallback(async (messageIds = []) => {
    if (!conversationId) return;
    const ids = messageIds.filter(id => id && !fetchedRef.current.has(id));
    if (ids.length === 0) return;
    ids.forEach(id => fetchedRef.current.add(id));

    const { data: receipts, error } = await supabase
      .from('message_read_receipts')
      .select(RECEIPT_COLS)
      .in('message_id', ids);

    if (error) {
      ids.forEach(id => fetchedRef.current.delete(id));
      return;
    }
    setReadReceipts(prev => (receipts || []).reduce(mergeReceipt, prev));
  }, [conversationId]);

  // Oznacz cudze wiadomości jako przeczytane (zapis w tle; każda wiadomość tylko raz).
  const markMessagesAsRead = useCallback(async (messages) => {
    if (!userEmail || !messages || messages.length === 0) return;
    const ids = unreadIdsToMark(messages, userEmail, markedRef.current, receiptsRef.current);
    if (ids.length === 0) return;
    ids.forEach(id => markedRef.current.add(id));

    const now = new Date().toISOString();
    // Przeczytane = również doręczone; nadpisuje wiersz „tylko doręczone”.
    const { error } = await supabase
      .from('message_read_receipts')
      .upsert(ids.map(messageId => ({
        message_id: messageId,
        user_email: userEmail,
        read_at: now,
        delivered_at: now
      })), {
        onConflict: 'message_id,user_email',
        ignoreDuplicates: false
      })
      .select(RECEIPT_COLS) // serwer roześle zmianę nadawcy (ptaszki)
      .silent();

    if (error) {
      ids.forEach(id => markedRef.current.delete(id));
      console.warn('Nie udało się zapisać potwierdzeń przeczytania:', error.message);
    }
  }, [userEmail]);

  // Oznacz wiadomości jako doręczone (bez oznaczania jako przeczytane)
  const markMessagesAsDelivered = useCallback(async (messageIds) => {
    if (!userEmail || !messageIds || messageIds.length === 0) return;
    // ignoreDuplicates: nie nadpisuj istniejącego "przeczytane"
    await supabase
      .from('message_read_receipts')
      .upsert(messageIds.map(messageId => ({
        message_id: messageId,
        user_email: userEmail,
        delivered_at: new Date().toISOString(),
        read_at: null
      })), {
        onConflict: 'message_id,user_email',
        ignoreDuplicates: true
      })
      .select(RECEIPT_COLS)
      .silent()
      .then(() => {}, () => {});
  }, [userEmail]);

  // Subskrypcja real-time (zdarzenia tylko z moich rozmów; kluczem jest message_id)
  useEffect(() => {
    if (!conversationId) return;

    const subscription = supabase
      .channel(`read-receipts-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_read_receipts'
      }, (payload) => {
        const rec = payload?.new;
        if (!rec?.message_id) return;
        setReadReceipts(prev => mergeReceipt(prev, rec));
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [conversationId]);

  // Sprawdź czy wiadomość została przeczytana przez kogokolwiek (oprócz nadawcy)
  const isMessageRead = useCallback((messageId, senderEmail) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.some(r => !sameEmail(r.user_email, senderEmail) && r.read_at);
  }, [readReceipts]);

  // Pobierz listę użytkowników, którzy przeczytali wiadomość
  const getReadBy = useCallback((messageId, senderEmail) => {
    const receipts = readReceipts[messageId] || [];
    return receipts.filter(r => !sameEmail(r.user_email, senderEmail) && r.read_at);
  }, [readReceipts]);

  // Status doręczenia dla ptaszków: 'sent' | 'delivered' | 'read' (K6). Z listą uczestników:
  // „przeczytane” dopiero, gdy przeczytali WSZYSCY pozostali (1:1 — druga osoba).
  const getDeliveryStatus = useCallback((messageId, senderEmail, participantEmails = []) =>
    receiptStatus(readReceipts[messageId] || [], senderEmail, participantEmails), [readReceipts]);

  // „Widziane przez”: kto i kiedy przeczytał (bez nadawcy), od najwcześniejszych.
  const getSeenBy = useCallback((messageId, senderEmail) =>
    seenBy(readReceipts[messageId] || [], senderEmail), [readReceipts]);

  return {
    readReceipts,
    fetchReadReceipts,
    markMessagesAsRead,
    markMessagesAsDelivered,
    isMessageRead,
    getReadBy,
    getDeliveryStatus,
    getSeenBy,
    refetch: fetchReadReceipts
  };
}

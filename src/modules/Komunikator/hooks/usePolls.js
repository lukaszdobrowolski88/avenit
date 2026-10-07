import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sameEmail, pollOf, isPollClosed } from '../utils/chatLogic';

// Głosy w ankietach: messageId -> [{ id, option_id, user_email }]
export default function usePolls(conversationId, userEmail) {
  const [votes, setVotes] = useState({});
  const votingRef = useRef(new Set()); // strażnik podwójnego kliknięcia (per ankieta)

  const fetchVotes = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('poll_votes')
        .select('id, message_id, option_id, user_email')
        .in('message_id', messageIds);

      if (error) {
        if (error.code === '42P01') return; // tabela nie istnieje – pomiń
        throw error;
      }

      // Każda pobrana ankieta dostaje świeżą listę (także pustą — po wycofaniu ostatniego głosu).
      const grouped = Object.fromEntries(messageIds.map(id => [id, []]));
      (data || []).forEach(v => { (grouped[v.message_id] = grouped[v.message_id] || []).push(v); });
      setVotes(prev => ({ ...prev, ...grouped }));
    } catch (err) {
      console.error('Error fetching poll votes:', err);
    }
  }, []);

  // Oddaj/wycofaj głos. Dla ankiet jednokrotnego wyboru usuwa poprzedni głos.
  const castVote = useCallback(async (message, optionId) => {
    if (!message?.id || !userEmail || !optionId) return;
    const messageId = message.id;
    const poll = pollOf(message);
    if (isPollClosed(poll)) { toast.info(tr('Ankieta jest już zamknięta.')); return; }
    if (votingRef.current.has(messageId)) return; // poprzedni klik jeszcze się zapisuje
    votingRef.current.add(messageId);

    const multiple = poll.multiple;
    const current = votes[messageId] || [];
    const mine = current.filter(v => sameEmail(v.user_email, userEmail));
    const already = mine.find(v => v.option_id === optionId);

    try {
      if (already) {
        // Klik w wybraną opcję = wycofanie głosu
        const { error } = await supabase.from('poll_votes').delete().eq('id', already.id).select('id, message_id');
        if (error) throw error;
        setVotes(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(v => v.id !== already.id)
        }));
        return;
      }

      // Jednokrotny wybór: nowy głos zastępuje poprzedni — robi to serwer (usuwa poprzedni głos
      // tej osoby w ankiecie). Bez osobnego kasowania tutaj: po zamknięciu ankiety (403) głos
      // nie znika. Lokalnie zdejmujemy moje wcześniejsze głosy dopiero po udanym zapisie.
      const { data, error } = await supabase
        .from('poll_votes')
        .insert({ message_id: messageId, option_id: optionId, user_email: userEmail })
        .select()
        .single();
      if (error) throw error;

      const replaced = multiple ? [] : mine.map(v => v.id);
      setVotes(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []).filter(v => v.id !== data.id && !replaced.includes(v.id)), data]
      }));
    } catch (err) {
      console.error('Error casting vote:', err);
      toast.error(err, { fallback: tr('Nie udało się zapisać głosu. Spróbuj ponownie.') });
    } finally {
      votingRef.current.delete(messageId);
    }
  }, [votes, userEmail]);

  // Wyniki ankiety pogrupowane po opcji. Ankieta anonimowa: serwer zwraca e-mail tylko przy moich
  // głosach — liczymy głosy, nie osoby, i nie pokazujemy, kto głosował.
  const getResults = useCallback((message) => {
    const messageId = message?.id;
    const poll = pollOf(message);
    const messageVotes = votes[messageId] || [];
    const total = messageVotes.length;
    const known = messageVotes.filter(v => v.user_email);

    return {
      total,
      anonymous: poll.anonymous,
      voterCount: poll.anonymous ? total : new Set(known.map(v => String(v.user_email).toLowerCase())).size,
      options: poll.options.map(opt => {
        const optVotes = messageVotes.filter(v => v.option_id === opt.id);
        return {
          ...opt,
          count: optVotes.length,
          percent: total > 0 ? Math.round((optVotes.length / total) * 100) : 0,
          voters: poll.anonymous ? [] : optVotes.map(v => v.user_email).filter(Boolean),
          hasVoted: optVotes.some(v => sameEmail(v.user_email, userEmail))
        };
      })
    };
  }, [votes, userEmail]);

  // Realtime (serwer wysyła tylko zdarzenia z moich rozmów)
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`poll-votes-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, (payload) => {
        // Niepełny wiersz (np. zapis bez pełnego RETURNING ze starszej wersji aplikacji) — dociągnij.
        const row = payload?.new || payload?.old;
        const partial = payload?.eventType === 'DELETE' ? !row?.id : !(row?.id && row?.option_id && row?.user_email);
        if (row?.message_id && partial) { fetchVotes([row.message_id]); return; }
        if (payload?.eventType === 'INSERT' && payload.new?.message_id) {
          const v = payload.new;
          setVotes(prev => {
            const existing = prev[v.message_id] || [];
            if (existing.some(x => x.id === v.id)) return prev;
            return { ...prev, [v.message_id]: [...existing, v] };
          });
        } else if (payload?.eventType === 'DELETE' && payload.old?.message_id) {
          const v = payload.old;
          setVotes(prev => ({
            ...prev,
            [v.message_id]: (prev[v.message_id] || []).filter(x => x.id !== v.id)
          }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, fetchVotes]);

  return { votes, fetchVotes, castVote, getResults };
}

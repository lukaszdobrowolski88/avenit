import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

// Głosy w ankietach: messageId -> [{ id, option_id, user_email }]
export default function usePolls(conversationId, userEmail) {
  const [votes, setVotes] = useState({});

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

      const grouped = (data || []).reduce((acc, v) => {
        (acc[v.message_id] = acc[v.message_id] || []).push(v);
        return acc;
      }, {});
      setVotes(prev => ({ ...prev, ...grouped }));
    } catch (err) {
      console.error('Error fetching poll votes:', err);
    }
  }, []);

  // Oddaj/wycofaj głos. Dla ankiet jednokrotnego wyboru usuwa poprzedni głos.
  const castVote = useCallback(async (message, optionId) => {
    if (!message?.id || !userEmail || !optionId) return;
    const messageId = message.id;
    const multiple = !!message.metadata?.multiple;
    const current = votes[messageId] || [];
    const mine = current.filter(v => v.user_email === userEmail);
    const already = mine.find(v => v.option_id === optionId);

    try {
      if (already) {
        // Klik w wybraną opcję = wycofanie głosu
        await supabase.from('poll_votes').delete().eq('id', already.id);
        setVotes(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(v => v.id !== already.id)
        }));
        return;
      }

      // Jednokrotny wybór – usuń wcześniejsze głosy tego użytkownika
      if (!multiple && mine.length > 0) {
        const ids = mine.map(v => v.id);
        await supabase.from('poll_votes').delete().in('id', ids);
        setVotes(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(v => !ids.includes(v.id))
        }));
      }

      const { data, error } = await supabase
        .from('poll_votes')
        .insert({ message_id: messageId, option_id: optionId, user_email: userEmail })
        .select()
        .single();
      if (error) throw error;

      setVotes(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []).filter(v => v.id !== data.id), data]
      }));
    } catch (err) {
      console.error('Error casting vote:', err);
    }
  }, [votes, userEmail]);

  // Wyniki ankiety pogrupowane po opcji
  const getResults = useCallback((message) => {
    const messageId = message?.id;
    const options = message?.metadata?.options || [];
    const messageVotes = votes[messageId] || [];
    const total = messageVotes.length;

    return {
      total,
      voterCount: new Set(messageVotes.map(v => v.user_email)).size,
      options: options.map(opt => {
        const optVotes = messageVotes.filter(v => v.option_id === opt.id);
        return {
          ...opt,
          count: optVotes.length,
          percent: total > 0 ? Math.round((optVotes.length / total) * 100) : 0,
          voters: optVotes.map(v => v.user_email),
          hasVoted: optVotes.some(v => v.user_email === userEmail)
        };
      })
    };
  }, [votes, userEmail]);

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`poll-votes-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const v = payload.new;
          setVotes(prev => {
            const existing = prev[v.message_id] || [];
            if (existing.some(x => x.id === v.id)) return prev;
            return { ...prev, [v.message_id]: [...existing, v] };
          });
        } else if (payload.eventType === 'DELETE') {
          const v = payload.old;
          setVotes(prev => ({
            ...prev,
            [v.message_id]: (prev[v.message_id] || []).filter(x => x.id !== v.id)
          }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  return { votes, fetchVotes, castVote, getResults };
}

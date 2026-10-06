import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sameEmail } from '../utils/chatLogic';

// Dostępne emoji do reakcji
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function useReactions(conversationId, userEmail) {
  // Mapa reakcji: messageId -> [{ emoji, user_email, id }]
  const [reactions, setReactions] = useState({});
  const [loading] = useState(false);
  const pendingRef = useRef(new Set()); // strażnik podwójnego kliknięcia (wiadomość+emoji)

  // Pobierz reakcje dla wiadomości w konwersacji
  const fetchReactions = useCallback(async (messageIds) => {
    if (!messageIds || messageIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) {
        // Tabela może nie istnieć - ignoruj błąd
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return;
        }
        throw error;
      }

      // Grupuj po message_id
      const grouped = (data || []).reduce((acc, reaction) => {
        if (!acc[reaction.message_id]) {
          acc[reaction.message_id] = [];
        }
        acc[reaction.message_id].push(reaction);
        return acc;
      }, {});

      setReactions(prev => ({ ...prev, ...grouped }));
    } catch (err) {
      console.error('Error fetching reactions:', err);
    }
  }, []);

  // Dodaj lub usuń reakcję
  const toggleReaction = useCallback(async (messageId, emoji) => {
    if (!messageId || !userEmail || !emoji) return;
    const key = `${messageId}|${emoji}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);

    try {
      // Sprawdź czy już istnieje
      const existingReactions = reactions[messageId] || [];
      const existingReaction = existingReactions.find(
        r => r.emoji === emoji && sameEmail(r.user_email, userEmail)
      );

      if (existingReaction) {
        // Usuń reakcję (.select — serwer roześle zmianę pozostałym uczestnikom)
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('id', existingReaction.id)
          .select('id, message_id');

        if (error) throw error;

        // Aktualizuj stan lokalnie
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== existingReaction.id)
        }));
      } else {
        // Dodaj reakcję
        const { data, error } = await supabase
          .from('message_reactions')
          .insert({
            message_id: messageId,
            user_email: userEmail,
            emoji
          })
          .select()
          .single();

        if (error) throw error;

        // Aktualizuj stan lokalnie
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []).filter(r => r.id !== data.id), data]
        }));
      }
    } catch (err) {
      console.error('Error toggling reaction:', err);
      toast.error(err, { fallback: tr('Nie udało się zapisać reakcji. Spróbuj ponownie.') });
    } finally {
      pendingRef.current.delete(key);
    }
  }, [reactions, userEmail]);

  // Pobierz reakcje dla konkretnej wiadomości (pogrupowane po emoji)
  const getReactionsForMessage = useCallback((messageId) => {
    const messageReactions = reactions[messageId] || [];

    // Grupuj po emoji i policz
    const grouped = messageReactions.reduce((acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = {
          emoji: reaction.emoji,
          count: 0,
          users: [],
          hasUserReacted: false
        };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user_email);
      if (sameEmail(reaction.user_email, userEmail)) {
        acc[reaction.emoji].hasUserReacted = true;
      }
      return acc;
    }, {});

    return Object.values(grouped);
  }, [reactions, userEmail]);

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    const channelName = `reactions-${conversationId}-${Date.now()}`;

    const subscription = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions'
      }, (payload) => {
        if (payload?.eventType === 'INSERT' && payload.new?.message_id) {
          const newReaction = payload.new;
          // Sprawdź duplikaty - reakcja mogła już być dodana lokalnie
          setReactions(prev => {
            const existing = prev[newReaction.message_id] || [];
            if (existing.some(r => r.id === newReaction.id)) {
              return prev; // Już istnieje, nie dodawaj
            }
            return {
              ...prev,
              [newReaction.message_id]: [...existing, newReaction]
            };
          });
        } else if (payload?.eventType === 'DELETE' && payload.old?.message_id) {
          const deletedReaction = payload.old;
          setReactions(prev => ({
            ...prev,
            [deletedReaction.message_id]: (prev[deletedReaction.message_id] || [])
              .filter(r => r.id !== deletedReaction.id)
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [conversationId]);

  return {
    reactions,
    loading,
    fetchReactions,
    toggleReaction,
    getReactionsForMessage,
    REACTION_EMOJIS
  };
}

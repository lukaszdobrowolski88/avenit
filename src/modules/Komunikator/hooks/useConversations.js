import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

// Cache konwersacji na poziomie modułu
const CACHE_KEY = 'komunikator_conversations_cache';

export default function useConversations(userEmail) {
  // Inicjalizuj z cache
  const [conversations, setConversations] = useState(() => {
    if (!userEmail) return [];
    try {
      const cached = localStorage.getItem(`${CACHE_KEY}_${userEmail}`);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false); // Nie blokuj - mamy cache lub pustą listę
  const [error, setError] = useState(null);
  const isFirstFetch = useRef(true);

  const fetchConversations = useCallback(async () => {
    if (!userEmail) return;

    try {
      // Pokaż loading tylko przy pierwszym pobraniu jeśli nie ma cache
      if (isFirstFetch.current && conversations.length === 0) {
        setLoading(true);
      }
      isFirstFetch.current = false;

      // Pobierz konwersacje użytkownika z uczestnikami i ostatnią wiadomością
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at, muted, role, starred, archived')
        .eq('user_email', userEmail);

      if (participantError) throw participantError;

      if (!participantData || participantData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      const conversationIds = participantData.map(p => p.conversation_id);
      const participantMap = {};
      participantData.forEach(p => {
        participantMap[p.conversation_id] = p;
      });

      // Pobierz szczegóły konwersacji
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      if (convError) throw convError;

      // Pobierz wszystkich uczestników dla tych konwersacji
      const { data: allParticipants, error: allPartError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, user_email, role')
        .in('conversation_id', conversationIds);

      if (allPartError) throw allPartError;

      // Grupuj uczestników po konwersacji
      const participantsByConv = {};
      allParticipants.forEach(p => {
        if (!participantsByConv[p.conversation_id]) {
          participantsByConv[p.conversation_id] = [];
        }
        participantsByConv[p.conversation_id].push(p);
      });

      // Pobierz dane użytkowników (imiona)
      const allEmails = [...new Set(allParticipants.map(p => p.user_email))];
      const { data: usersData } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url')
        .in('email', allEmails);

      const usersMap = {};
      (usersData || []).forEach(u => {
        usersMap[u.email] = u;
      });

      // Pobierz ostatnie wiadomości dla WSZYSTKICH konwersacji jednym zapytaniem
      // Używamy RPC lub pobieramy wszystkie ostatnie wiadomości
      const { data: allLastMessages } = await supabase
        .from('messages')
        .select('conversation_id, content, sender_email, created_at')
        .in('conversation_id', conversationIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      // Grupuj ostatnie wiadomości po konwersacji (bierzemy tylko pierwszą = najnowszą)
      const lastMessageByConv = {};
      (allLastMessages || []).forEach(msg => {
        if (!lastMessageByConv[msg.conversation_id]) {
          lastMessageByConv[msg.conversation_id] = msg;
        }
      });

      // Mapuj konwersacje z danymi
      const conversationsWithMessages = convData.map(conv => {
        const myParticipation = participantMap[conv.id];
        const lastMsg = lastMessageByConv[conv.id];
        const participants = participantsByConv[conv.id] || [];

        // Nazwa konwersacji (dla direct - imię drugiej osoby)
        let displayName = conv.name;
        let displayAvatar = conv.avatar_url;

        if (conv.type === 'direct') {
          const otherParticipant = participants.find(p => p.user_email !== userEmail);
          if (otherParticipant) {
            const otherUser = usersMap[otherParticipant.user_email];
            displayName = otherUser?.full_name || otherParticipant.user_email;
            displayAvatar = otherUser?.avatar_url;
          }
        }

        // Liczba nieprzeczytanych - oblicz na podstawie pobranych wiadomości
        // (uproszczone - dokładne liczenie wymaga dodatkowego zapytania, ale dla UX wystarczy znacznik)
        let hasUnread = false;
        if (lastMsg && lastMsg.sender_email !== userEmail) {
          if (!myParticipation?.last_read_at) {
            hasUnread = true;
          } else {
            hasUnread = new Date(lastMsg.created_at) > new Date(myParticipation.last_read_at);
          }
        }

        return {
          ...conv,
          displayName,
          displayAvatar,
          participants: participants.map(p => ({
            ...p,
            ...usersMap[p.user_email]
          })),
          lastMessage: lastMsg,
          unreadCount: hasUnread ? 1 : 0, // Uproszczone - pokazuje czy są nieprzeczytane
          muted: myParticipation?.muted || false,
          starred: myParticipation?.starred || false,
          archived: myParticipation?.archived || false,
          myRole: myParticipation?.role || 'member'
        };
      });

      // Sortuj - gwiazdki na górze, potem nieprzeczytane, potem po updated_at
      conversationsWithMessages.sort((a, b) => {
        // Gwiazdki zawsze na górze
        if (a.starred && !b.starred) return -1;
        if (!a.starred && b.starred) return 1;
        // Potem nieprzeczytane
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        // Na końcu po dacie
        return new Date(b.updated_at) - new Date(a.updated_at);
      });

      setConversations(conversationsWithMessages);

      // Zapisz do cache
      try {
        localStorage.setItem(`${CACHE_KEY}_${userEmail}`, JSON.stringify(conversationsWithMessages));
      } catch (e) {
        // Ignoruj błędy cache
      }
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userEmail, conversations.length]);

  // Tworzenie konwersacji direct
  const createDirectConversation = async (otherUserEmail) => {
    try {
      // Sprawdź czy konwersacja już istnieje
      const existing = conversations.find(c =>
        c.type === 'direct' &&
        c.participants.some(p => p.user_email === otherUserEmail)
      );

      if (existing) {
        return existing.id;
      }

      // Utwórz nową konwersację
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'direct',
          created_by: userEmail
        })
        .select()
        .single();

      if (convError) throw convError;

      // Dodaj uczestników
      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert([
          { conversation_id: conv.id, user_email: userEmail, role: 'admin' },
          { conversation_id: conv.id, user_email: otherUserEmail, role: 'admin' }
        ]);

      if (partError) throw partError;

      await fetchConversations();
      return conv.id;
    } catch (err) {
      console.error('Error creating direct conversation:', err);
      throw err;
    }
  };

  // Tworzenie konwersacji grupowej
  const createGroupConversation = async (name, participantEmails) => {
    try {
      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .insert({
          type: 'group',
          name,
          created_by: userEmail
        })
        .select()
        .single();

      if (convError) throw convError;

      // Dodaj uczestników (twórca jako admin)
      const participants = [
        { conversation_id: conv.id, user_email: userEmail, role: 'admin' },
        ...participantEmails
          .filter(email => email !== userEmail)
          .map(email => ({
            conversation_id: conv.id,
            user_email: email,
            role: 'member'
          }))
      ];

      const { error: partError } = await supabase
        .from('conversation_participants')
        .insert(participants);

      if (partError) throw partError;

      await fetchConversations();
      return conv.id;
    } catch (err) {
      console.error('Error creating group conversation:', err);
      throw err;
    }
  };

  // Oznacz konwersację jako przeczytaną
  const markAsRead = async (conversationId) => {
    try {
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_email', userEmail);

      setConversations(prev =>
        prev.map(c =>
          c.id === conversationId ? { ...c, unreadCount: 0 } : c
        )
      );
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  // Przełącz gwiazdkę
  const toggleStar = async (conversationId) => {
    try {
      const current = conversations.find(c => c.id === conversationId);
      const newStarred = !current?.starred;

      await supabase
        .from('conversation_participants')
        .update({ starred: newStarred })
        .eq('conversation_id', conversationId)
        .eq('user_email', userEmail);

      setConversations(prev =>
        prev.map(c =>
          c.id === conversationId ? { ...c, starred: newStarred } : c
        ).sort((a, b) => {
          if (a.starred && !b.starred) return -1;
          if (!a.starred && b.starred) return 1;
          if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
          if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
          return new Date(b.updated_at) - new Date(a.updated_at);
        })
      );
    } catch (err) {
      console.error('Error toggling star:', err);
    }
  };

  // Przełącz archiwizację
  const toggleArchive = async (conversationId) => {
    try {
      const current = conversations.find(c => c.id === conversationId);
      const newArchived = !current?.archived;

      await supabase
        .from('conversation_participants')
        .update({ archived: newArchived })
        .eq('conversation_id', conversationId)
        .eq('user_email', userEmail);

      setConversations(prev =>
        prev.map(c =>
          c.id === conversationId ? { ...c, archived: newArchived } : c
        )
      );
    } catch (err) {
      console.error('Error toggling archive:', err);
    }
  };

  // Usuń konwersację (tylko dla direct)
  const deleteConversation = async (conversationId) => {
    try {
      // Najpierw usuń wiadomości
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      // Usuń uczestników
      await supabase
        .from('conversation_participants')
        .delete()
        .eq('conversation_id', conversationId);

      // Usuń konwersację
      const { error: deleteError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId);

      if (deleteError) throw deleteError;

      // Usuń z lokalnego stanu
      setConversations(prev => prev.filter(c => c.id !== conversationId));

      // Zaktualizuj cache
      try {
        const updated = conversations.filter(c => c.id !== conversationId);
        localStorage.setItem(`${CACHE_KEY}_${userEmail}`, JSON.stringify(updated));
      } catch (e) {
        // Ignoruj błędy cache
      }

      return true;
    } catch (err) {
      console.error('Error deleting conversation:', err);
      throw err;
    }
  };

  // Debounced refresh - nie odświeżaj za często
  const refreshTimeoutRef = useRef(null);
  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      fetchConversations();
    }, 1000); // Odśwież max raz na sekundę
  }, [fetchConversations]);

  // Subskrypcja na nowe wiadomości (dla aktualizacji liczników)
  useEffect(() => {
    if (!userEmail) return;

    const subscription = supabase
      .channel('conversations-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, () => {
        // Odśwież konwersacje przy nowej wiadomości (z debounce)
        debouncedRefresh();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [userEmail, debouncedRefresh]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    error,
    refetch: fetchConversations,
    createDirectConversation,
    createGroupConversation,
    markAsRead,
    deleteConversation,
    toggleStar,
    toggleArchive
  };
}

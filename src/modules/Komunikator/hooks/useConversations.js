import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import { sortConversations, buildParticipantRows, findDirectConversation, sameEmail, emailPattern } from '../utils/chatLogic';

// Cache konwersacji na poziomie modułu
const CACHE_KEY = 'komunikator_conversations_cache';

// Kolejność zapisu nowej rozmowy jest wymuszona przez serwer (komunikator.js):
//  1) rozmowa (created_by = zalogowany), 2) skład — twórca jako 'admin' (pierwszy skład wolno dodać
//  tylko do pustej rozmowy albo jako jej twórca), 3) dopiero potem wiadomości (pisze tylko uczestnik).

export default function useConversations(userEmail, opts = {}) {
  // Uprawnienia z roli: zmiana własnego wiersza uczestnika (przeczytane, gwiazdka, przypięcie,
  // archiwum, wyciszenie). Bez nich nie wysyłamy zapisów, które i tak skończyłyby się 403.
  const canManageOwn = opts.canManageOwn !== false;

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
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const fetchSeqRef = useRef(0);

  const saveCache = useCallback((list) => {
    try {
      localStorage.setItem(`${CACHE_KEY}_${userEmail}`, JSON.stringify(list));
    } catch { /* ignoruj błędy cache */ }
  }, [userEmail]);

  // Pobiera listę rozmów i ZWRACA świeżą listę (wywołujący może od razu w niej szukać).
  const fetchConversations = useCallback(async () => {
    if (!userEmail) return [];
    const seq = ++fetchSeqRef.current;

    try {
      // Pokaż loading tylko gdy nie ma czego pokazać (brak cache)
      if (conversationsRef.current.length === 0) setLoading(true);

      // Pobierz konwersacje użytkownika z uczestnikami i ostatnią wiadomością
      const { data: participantData, error: participantError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at, muted, role, starred, archived, pinned')
        .ilike('user_email', emailPattern(userEmail));

      if (participantError) throw participantError;
      if (seq !== fetchSeqRef.current) return conversationsRef.current;

      if (!participantData || participantData.length === 0) {
        setConversations([]);
        saveCache([]);
        return [];
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
      (allParticipants || []).forEach(p => {
        if (!participantsByConv[p.conversation_id]) {
          participantsByConv[p.conversation_id] = [];
        }
        participantsByConv[p.conversation_id].push(p);
      });

      // Pobierz dane użytkowników (imiona)
      const allEmails = [...new Set((allParticipants || []).map(p => p.user_email))];
      const { data: usersData } = allEmails.length
        ? await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .in('email', allEmails)
        : { data: [] };

      const usersMap = {};
      (usersData || []).forEach(u => {
        usersMap[u.email] = u;
      });

      // Ostatnie wiadomości dla wszystkich rozmów jednym zapytaniem (tylko potrzebne kolumny)
      const { data: allLastMessages } = await supabase
        .from('messages')
        .select('conversation_id, content, sender_email, created_at, message_type')
        .in('conversation_id', conversationIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (seq !== fetchSeqRef.current) return conversationsRef.current;

      // Grupuj ostatnie wiadomości po konwersacji (bierzemy tylko pierwszą = najnowszą)
      const lastMessageByConv = {};
      (allLastMessages || []).forEach(msg => {
        if (!lastMessageByConv[msg.conversation_id]) {
          lastMessageByConv[msg.conversation_id] = msg;
        }
      });

      // Mapuj konwersacje z danymi
      const conversationsWithMessages = (convData || []).map(conv => {
        const myParticipation = participantMap[conv.id];
        const lastMsg = lastMessageByConv[conv.id];
        const participants = participantsByConv[conv.id] || [];

        // Nazwa konwersacji (dla direct - imię drugiej osoby)
        let displayName = conv.name;
        let displayAvatar = conv.avatar_url;

        if (conv.type === 'direct') {
          const otherParticipant = participants.find(p => !sameEmail(p.user_email, userEmail));
          if (otherParticipant) {
            const otherUser = usersMap[otherParticipant.user_email];
            displayName = otherUser?.full_name || otherParticipant.user_email;
            displayAvatar = otherUser?.avatar_url;
          }
        }

        // Znacznik nieprzeczytanych: ostatnia cudza wiadomość nowsza niż moje „przeczytane”.
        let hasUnread = false;
        if (lastMsg && !sameEmail(lastMsg.sender_email, userEmail)) {
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
          pinned: myParticipation?.pinned || false,
          lastReadAt: myParticipation?.last_read_at || null,
          myRole: myParticipation?.role || 'member'
        };
      });

      conversationsWithMessages.sort(sortConversations);

      setConversations(conversationsWithMessages);
      setError(null);
      saveCache(conversationsWithMessages);
      return conversationsWithMessages;
    } catch (err) {
      console.error('Error fetching conversations:', err);
      setError(err.message || String(err));
      return conversationsRef.current;
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [userEmail, saveCache]);

  // Zapis nowej rozmowy: rozmowa → skład (twórca = admin). Zwraca id rozmowy.
  const insertConversation = async (values, memberEmails, participantOpts) => {
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .insert({ ...values, created_by: userEmail })
      .select('id')
      .single();
    if (convError) throw convError;

    // .select() — żeby serwer rozesłał zmianę (realtime) do zaproszonych osób.
    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert(buildParticipantRows(conv.id, userEmail, memberEmails, participantOpts))
      .select('conversation_id, user_email');
    if (partError) throw partError;

    await fetchConversations();
    return conv.id;
  };

  // Tworzenie konwersacji direct. Zwraca { id, created } (created=false → rozmowa już istniała).
  const createDirectConversation = async (otherUserEmail) => {
    const existing = findDirectConversation(conversationsRef.current, userEmail, otherUserEmail);
    if (existing) return { id: existing.id, created: false };
    const id = await insertConversation({ type: 'direct' }, [otherUserEmail], { allAdmins: true });
    return { id, created: true };
  };

  // Tworzenie konwersacji grupowej.
  // opts: { type: 'group'|'announcement', posting_policy: 'everyone'|'admins', description }
  const createGroupConversation = async (name, participantEmails, groupOpts = {}) => {
    const insertData = {
      type: groupOpts.type === 'announcement' ? 'announcement' : 'group',
      name,
    };
    if (groupOpts.posting_policy) insertData.posting_policy = groupOpts.posting_policy;
    if (groupOpts.description) insertData.description = groupOpts.description;
    const id = await insertConversation(insertData, participantEmails);
    return { id, created: true };
  };

  // Tworzenie kanału ogłoszeń (broadcast) – tylko admini piszą, reszta czyta
  const createAnnouncementChannel = async (name, participantEmails, description = null) => {
    return createGroupConversation(name, participantEmails, {
      type: 'announcement',
      posting_policy: 'admins',
      description
    });
  };

  // Zmiana MOJEGO wiersza uczestnika: optymistycznie, a przy błędzie cofnięcie + komunikat.
  const updateMyParticipation = async (conversationId, patch, localPatch, errorText) => {
    const before = conversationsRef.current.find(c => c.id === conversationId);
    if (!before) return false;
    const revert = Object.fromEntries(Object.keys(localPatch).map(k => [k, before[k]]));
    setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, ...localPatch } : c)).sort(sortConversations));

    const { error: updError } = await supabase
      .from('conversation_participants')
      .update(patch)
      .eq('conversation_id', conversationId)
      .ilike('user_email', emailPattern(userEmail));

    if (updError) {
      setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, ...revert } : c)).sort(sortConversations));
      toast.error(updError, { fallback: errorText });
      return false;
    }
    return true;
  };

  // Oznacz konwersację jako przeczytaną (zapis w tle — bez komunikatów)
  const markAsRead = useCallback(async (conversationId) => {
    if (!conversationId || !userEmail) return;
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
    if (!canManageOwn) return;
    const { error: readError } = await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .ilike('user_email', emailPattern(userEmail))
      .silent();
    if (readError) console.warn('Nie udało się zapisać „przeczytane”:', readError.message);
  }, [userEmail, canManageOwn]);

  const toggleStar = async (conversationId) => {
    const current = conversationsRef.current.find(c => c.id === conversationId);
    const starred = !current?.starred;
    // Bez komunikatu sukcesu — gwiazdka i przesunięcie wiersza są widoczne od razu.
    await updateMyParticipation(conversationId, { starred }, { starred }, tr('Nie udało się zmienić ulubionych. Spróbuj ponownie.'));
  };

  // Przypnij / odepnij rozmowę (na górze listy)
  const togglePin = async (conversationId) => {
    const current = conversationsRef.current.find(c => c.id === conversationId);
    const pinned = !current?.pinned;
    await updateMyParticipation(conversationId, { pinned }, { pinned }, tr('Nie udało się przypiąć rozmowy. Spróbuj ponownie.'));
  };

  // Przełącz archiwizację
  const toggleArchive = async (conversationId) => {
    const current = conversationsRef.current.find(c => c.id === conversationId);
    const archived = !current?.archived;
    const ok = await updateMyParticipation(conversationId, { archived }, { archived }, tr('Nie udało się zmienić archiwum. Spróbuj ponownie.'));
    if (ok) toast.success(archived ? tr('Rozmowa przeniesiona do archiwum') : tr('Rozmowa przywrócona z archiwum'));
  };

  // Wycisz / włącz powiadomienia z rozmowy (mój wiersz uczestnika)
  const toggleMute = async (conversationId) => {
    const current = conversationsRef.current.find(c => c.id === conversationId);
    const muted = !current?.muted;
    const ok = await updateMyParticipation(conversationId, { muted }, { muted }, tr('Nie udało się zmienić powiadomień. Spróbuj ponownie.'));
    if (ok) toast.success(muted ? tr('Powiadomienia z tej rozmowy wyciszone') : tr('Powiadomienia z tej rozmowy włączone'));
  };

  // Usuń konwersację (dla wszystkich jej uczestników). Wiadomości i skład usuwa baza (ON DELETE CASCADE).
  // Najpierw rozmowa: serwer pozwala na to administratorowi rozmowy, a tym jest się tylko jako uczestnik.
  const deleteConversation = async (conversationId) => {
    const { data: removed, error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId)
      .select('id');

    if (deleteError) throw deleteError;
    if (!removed || removed.length === 0) {
      throw new Error(tr('Rozmowę może usunąć tylko jej administrator.'));
    }

    setConversations(prev => {
      const next = prev.filter(c => c.id !== conversationId);
      saveCache(next);
      return next;
    });
    return true;
  };

  // Opuść rozmowę (usuń mój wiersz uczestnika).
  const leaveConversation = async (conversationId) => {
    const { error: leaveError } = await supabase
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .ilike('user_email', emailPattern(userEmail))
      .select('conversation_id, user_email');
    if (leaveError) throw leaveError;
    setConversations(prev => {
      const next = prev.filter(c => c.id !== conversationId);
      saveCache(next);
      return next;
    });
    return true;
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

  // Realtime: serwer wysyła zmiany tylko uczestnikom rozmowy (filtr kanału nie jest stosowany,
  // więc zdarzenia filtrujemy sami).
  useEffect(() => {
    if (!userEmail) return;

    const subscription = supabase
      .channel('conversations-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, (payload) => {
        // Oznacz jako "doręczone" wiadomości od innych (apka jest otwarta gdziekolwiek)
        const msg = payload?.new;
        if (msg?.id && !sameEmail(msg.sender_email, userEmail)) {
          supabase
            .from('message_read_receipts')
            .upsert(
              { message_id: msg.id, user_email: userEmail, delivered_at: new Date().toISOString(), read_at: null },
              { onConflict: 'message_id,user_email', ignoreDuplicates: true }
            )
            .select('message_id, user_email, read_at, delivered_at')
            .silent()
            .then(() => {}, () => {});
        }
        // Odśwież konwersacje przy nowej wiadomości (z debounce)
        debouncedRefresh();
      })
      // Dodanie do rozmowy / usunięcie ze składu / zmiana roli → odśwież listę.
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversation_participants'
      }, () => debouncedRefresh())
      // Zmiana nazwy / ustawień rozmowy.
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversations'
      }, () => debouncedRefresh())
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
    createAnnouncementChannel,
    markAsRead,
    deleteConversation,
    leaveConversation,
    toggleStar,
    toggleArchive,
    togglePin,
    toggleMute
  };
}

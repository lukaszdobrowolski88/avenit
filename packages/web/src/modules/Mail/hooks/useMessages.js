import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

const MESSAGES_PER_PAGE = 50;

export default function useMessages(accountId, folderId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  // Pobierz wiadomości dla folderu
  const fetchMessages = useCallback(async (pageNum = 0, append = false) => {
    if (!accountId || !folderId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const from = pageNum * MESSAGES_PER_PAGE;
      const to = from + MESSAGES_PER_PAGE - 1;

      const { data, error: fetchError } = await supabase
        .from('mail_messages')
        .select(`
          *,
          attachments:mail_attachments(id, filename, mime_type, file_size),
          labels:mail_message_labels(
            label:mail_labels(id, name, color)
          )
        `)
        .eq('account_id', accountId)
        .eq('folder_id', folderId)
        .is('deleted_at', null)
        .order('received_at', { ascending: false })
        .range(from, to);

      if (fetchError) throw fetchError;

      const formattedMessages = (data || []).map(msg => ({
        ...msg,
        labels: msg.labels?.map(l => l.label).filter(Boolean) || [],
        hasAttachments: msg.attachments?.length > 0
      }));

      if (append) {
        setMessages(prev => [...prev, ...formattedMessages]);
      } else {
        setMessages(formattedMessages);
      }

      setHasMore(formattedMessages.length === MESSAGES_PER_PAGE);
      setPage(pageNum);
      setError(null);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [accountId, folderId]);

  // Pobierz przy zmianie folderu
  useEffect(() => {
    setPage(0);
    setHasMore(true);
    fetchMessages(0, false);
  }, [accountId, folderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Załaduj więcej
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchMessages(page + 1, true);
    }
  }, [loading, hasMore, page, fetchMessages]);

  // Pobierz pojedynczą wiadomość
  const getMessage = useCallback(async (messageId) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('mail_messages')
        .select(`
          *,
          attachments:mail_attachments(*),
          labels:mail_message_labels(
            label:mail_labels(id, name, color)
          )
        `)
        .eq('id', messageId)
        .single();

      if (fetchError) throw fetchError;

      return {
        ...data,
        labels: data.labels?.map(l => l.label).filter(Boolean) || []
      };
    } catch (err) {
      console.error('Error fetching message:', err);
      return null;
    }
  }, []);

  // Oznacz jako przeczytane
  const markAsRead = useCallback(async (messageIds, isRead = true) => {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

    try {
      const { error: updateError } = await supabase
        .from('mail_messages')
        .update({ is_read: isRead })
        .in('id', ids);

      if (updateError) throw updateError;

      // Aktualizuj lokalnie
      setMessages(prev => prev.map(msg =>
        ids.includes(msg.id) ? { ...msg, is_read: isRead } : msg
      ));

      return true;
    } catch (err) {
      console.error('Error marking as read:', err);
      return false;
    }
  }, []);

  // Oznacz gwiazdką
  const toggleStar = useCallback(async (messageId) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return false;

    try {
      const { error: updateError } = await supabase
        .from('mail_messages')
        .update({ is_starred: !message.is_starred })
        .eq('id', messageId);

      if (updateError) throw updateError;

      // Aktualizuj lokalnie
      setMessages(prev => prev.map(msg =>
        msg.id === messageId ? { ...msg, is_starred: !msg.is_starred } : msg
      ));

      return true;
    } catch (err) {
      console.error('Error toggling star:', err);
      return false;
    }
  }, [messages]);

  // Przenieś do folderu
  const moveToFolder = useCallback(async (messageIds, targetFolderId) => {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

    try {
      const { error: updateError } = await supabase
        .from('mail_messages')
        .update({ folder_id: targetFolderId })
        .in('id', ids);

      if (updateError) throw updateError;

      // Usuń z aktualnej listy
      setMessages(prev => prev.filter(msg => !ids.includes(msg.id)));

      return true;
    } catch (err) {
      console.error('Error moving messages:', err);
      return false;
    }
  }, []);

  // Usuń wiadomości (soft delete lub przeniesienie do kosza)
  const deleteMessages = useCallback(async (messageIds, permanent = false) => {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

    try {
      if (permanent) {
        // Trwałe usunięcie (z kosza)
        const { error: deleteError } = await supabase
          .from('mail_messages')
          .delete()
          .in('id', ids);

        if (deleteError) throw deleteError;
      } else {
        // Soft delete
        const { error: updateError } = await supabase
          .from('mail_messages')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', ids);

        if (updateError) throw updateError;
      }

      // Usuń z listy
      setMessages(prev => prev.filter(msg => !ids.includes(msg.id)));

      return true;
    } catch (err) {
      console.error('Error deleting messages:', err);
      return false;
    }
  }, []);

  // Przywróć z kosza
  const restoreMessages = useCallback(async (messageIds, targetFolderId) => {
    const ids = Array.isArray(messageIds) ? messageIds : [messageIds];

    try {
      const { error: updateError } = await supabase
        .from('mail_messages')
        .update({
          deleted_at: null,
          folder_id: targetFolderId
        })
        .in('id', ids);

      if (updateError) throw updateError;

      // Usuń z aktualnej listy (kosz)
      setMessages(prev => prev.filter(msg => !ids.includes(msg.id)));

      return true;
    } catch (err) {
      console.error('Error restoring messages:', err);
      return false;
    }
  }, []);

  // Dodaj/usuń etykietę
  const toggleLabel = useCallback(async (messageId, labelId) => {
    const message = messages.find(m => m.id === messageId);
    if (!message) return false;

    const hasLabel = message.labels?.some(l => l.id === labelId);

    try {
      if (hasLabel) {
        // Usuń etykietę
        const { error: deleteError } = await supabase
          .from('mail_message_labels')
          .delete()
          .eq('message_id', messageId)
          .eq('label_id', labelId);

        if (deleteError) throw deleteError;
      } else {
        // Dodaj etykietę
        const { error: insertError } = await supabase
          .from('mail_message_labels')
          .insert({ message_id: messageId, label_id: labelId });

        if (insertError) throw insertError;
      }

      // Odśwież wiadomość
      const updated = await getMessage(messageId);
      if (updated) {
        setMessages(prev => prev.map(msg =>
          msg.id === messageId ? { ...msg, labels: updated.labels } : msg
        ));
      }

      return true;
    } catch (err) {
      console.error('Error toggling label:', err);
      return false;
    }
  }, [messages, getMessage]);

  // Wyszukaj wiadomości
  const searchMessages = useCallback(async (query, options = {}) => {
    if (!accountId) return [];

    try {
      let queryBuilder = supabase
        .from('mail_messages')
        .select(`
          *,
          attachments:mail_attachments(id, filename),
          labels:mail_message_labels(label:mail_labels(id, name, color))
        `)
        .eq('account_id', accountId)
        .is('deleted_at', null);

      // Wyszukiwanie pełnotekstowe
      if (query) {
        queryBuilder = queryBuilder.or(`subject.ilike.%${query}%,body_text.ilike.%${query}%,from_email.ilike.%${query}%`);
      }

      // Filtry
      if (options.folderId) {
        queryBuilder = queryBuilder.eq('folder_id', options.folderId);
      }
      if (options.isRead !== undefined) {
        queryBuilder = queryBuilder.eq('is_read', options.isRead);
      }
      if (options.isStarred !== undefined) {
        queryBuilder = queryBuilder.eq('is_starred', options.isStarred);
      }
      if (options.hasAttachments) {
        // Wymaga subquery - uproszczona wersja
      }
      if (options.fromDate) {
        queryBuilder = queryBuilder.gte('received_at', options.fromDate);
      }
      if (options.toDate) {
        queryBuilder = queryBuilder.lte('received_at', options.toDate);
      }

      const { data, error: searchError } = await queryBuilder
        .order('received_at', { ascending: false })
        .limit(100);

      if (searchError) throw searchError;

      return (data || []).map(msg => ({
        ...msg,
        labels: msg.labels?.map(l => l.label).filter(Boolean) || [],
        hasAttachments: msg.attachments?.length > 0
      }));
    } catch (err) {
      console.error('Error searching messages:', err);
      return [];
    }
  }, [accountId]);

  // Statystyki
  const unreadCount = messages.filter(m => !m.is_read).length;
  const starredCount = messages.filter(m => m.is_starred).length;

  return {
    messages,
    loading,
    error,
    hasMore,
    refetch: () => fetchMessages(0, false),
    loadMore,
    getMessage,
    markAsRead,
    toggleStar,
    moveToFolder,
    deleteMessages,
    restoreMessages,
    toggleLabel,
    searchMessages,
    unreadCount,
    starredCount
  };
}

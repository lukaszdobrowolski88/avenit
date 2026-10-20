import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import { addReply, applyReplyUpdate, isFollowing } from './threadLogic';

// Jeden wątek: wiadomość główna, odpowiedzi, obserwowanie, wysyłka. Serwer pilnuje zasad pisania
// (uczestnik, kanał „tylko administratorzy”), a obserwujących dopisuje trigger (autor, odpowiadający,
// wspomniani). Zmiany na żywo: nowe/zmienione odpowiedzi i liczniki wiadomości głównej.
const REPLIES_LIMIT = 500;

export default function useThread(conversationId, rootId, userEmail, { initialRoot = null } = {}) {
  const [root, setRoot] = useState(initialRoot && initialRoot.id === rootId ? initialRoot : null);
  const [replies, setReplies] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const rootRef = useRef(rootId);
  rootRef.current = rootId;

  const fetchFollowers = useCallback(async () => {
    if (!rootId) return;
    const { data } = await supabase.from('message_thread_followers').select('root_id, user_email, following').eq('root_id', rootId);
    if (rootRef.current === rootId) setFollowers(data || []);
  }, [rootId]);

  const fetchAll = useCallback(async () => {
    if (!rootId) return;
    setLoading(true);
    try {
      const [rootRes, repliesRes] = await Promise.all([
        supabase.from('messages').select('*').eq('id', rootId).maybeSingle(),
        supabase.from('messages').select('*').eq('thread_root_id', rootId).is('deleted_at', null)
          .order('created_at', { ascending: true }).limit(REPLIES_LIMIT),
      ]);
      if (rootRes.error) throw rootRes.error;
      if (repliesRes.error) throw repliesRes.error;
      if (rootRef.current !== rootId) return;
      if (rootRes.data && String(rootRes.data.conversation_id) !== String(conversationId)) throw new Error(tr('Nie znaleziono tego wątku.'));
      setRoot(rootRes.data || null);
      setReplies(repliesRes.data || []);
      setError(null);
    } catch (err) {
      if (rootRef.current === rootId) setError(err);
    } finally {
      if (rootRef.current === rootId) setLoading(false);
    }
    fetchFollowers().catch(() => {});
  }, [rootId, conversationId, fetchFollowers]);

  useEffect(() => {
    setReplies([]);
    setFollowers([]);
    setError(null);
    fetchAll();
  }, [fetchAll]);

  // Na żywo: odpowiedzi tego wątku, liczniki wiadomości głównej, obserwujący.
  useEffect(() => {
    if (!rootId) return undefined;
    const channel = supabase
      .channel(`thread:${rootId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload?.new || payload?.old;
        if (!row?.id) return;
        if (row.id === rootId) {
          if (payload.eventType === 'DELETE') setRoot(null);
          else setRoot((prev) => ({ ...(prev || {}), ...row }));
          return;
        }
        if (String(row.thread_root_id ?? '') !== String(rootId)) {
          // Usunięcie z wąskim zestawem pól (bez thread_root_id) — zdejmij, jeśli to nasza odpowiedź.
          if (row.deleted_at || payload.eventType === 'DELETE') setReplies((prev) => prev.filter((m) => m.id !== row.id));
          return;
        }
        if (payload.eventType === 'INSERT') setReplies((prev) => addReply(prev, row));
        else if (payload.eventType === 'DELETE') setReplies((prev) => prev.filter((m) => m.id !== row.id));
        else setReplies((prev) => applyReplyUpdate(prev, row));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_thread_followers' }, (payload) => {
        const row = payload?.new || payload?.old;
        if (row?.root_id && String(row.root_id) === String(rootId)) fetchFollowers().catch(() => {});
      })
      .subscribe();
    const onReconnect = () => fetchAll();
    window.addEventListener('avenit:realtime-reconnect', onReconnect);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('avenit:realtime-reconnect', onReconnect);
    };
  }, [rootId, fetchAll, fetchFollowers]);

  // Wysyłka odpowiedzi (podpis jak MessageInput.onSend). Rzuca błąd — wywołujący pokazuje komunikat.
  const sendReply = useCallback(async (content, attachments = [], _replyToId = null, extra = {}) => {
    if (!conversationId || !rootId || !userEmail) throw new Error(tr('Nie wybrano rozmowy.'));
    const row = { conversation_id: conversationId, thread_root_id: rootId, sender_email: userEmail, content, attachments };
    const mentions = Array.isArray(extra.mentions) ? extra.mentions.filter(Boolean) : [];
    if (mentions.length) row.mentions = mentions;
    const { data, error: sendError } = await supabase.from('messages').insert(row).select().single();
    if (sendError) throw sendError;
    setReplies((prev) => addReply(prev, data));
    // Odpowiadający obserwuje wątek (trigger) — stan przełącznika od razu.
    setFollowers((prev) => [...prev.filter((f) => String(f.user_email).toLowerCase() !== String(userEmail).toLowerCase()),
      { root_id: rootId, user_email: userEmail, following: true }]);
    return data;
  }, [conversationId, rootId, userEmail]);

  const editReply = useCallback(async (messageId, content) => {
    const { data, error: editError } = await supabase.from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId).select();
    if (editError) throw editError;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error(tr('Możesz edytować tylko własne wiadomości.'));
    if (row.id === rootId) setRoot((prev) => ({ ...(prev || {}), ...row }));
    else setReplies((prev) => applyReplyUpdate(prev, row));
    return row;
  }, [rootId]);

  const deleteReply = useCallback(async (messageId) => {
    const { data, error: deleteError } = await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId).select('id, conversation_id, deleted_at');
    if (deleteError) throw deleteError;
    if (!data || (Array.isArray(data) && data.length === 0)) throw new Error(tr('Możesz usuwać tylko własne wiadomości.'));
    setReplies((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  const following = isFollowing(followers, userEmail);
  // Obserwuj / nie obserwuj — własny wpis (serwer: rozmowa z wiadomości głównej, e-mail = ja).
  const setFollowing = useCallback(async (next) => {
    const prev = followers;
    setFollowers((list) => [...list.filter((f) => String(f.user_email).toLowerCase() !== String(userEmail).toLowerCase()),
      { root_id: rootId, user_email: userEmail, following: !!next }]);
    const { error: followError } = await supabase.from('message_thread_followers')
      .upsert({ root_id: rootId, user_email: userEmail, following: !!next }, { onConflict: 'root_id,user_email' })
      .select('root_id, user_email, following');
    if (followError) {
      setFollowers(prev);
      throw followError;
    }
  }, [followers, rootId, userEmail]);

  return { root, replies, loading, error, following, followersCount: followers.filter((f) => f.following !== false).length,
    sendReply, editReply, deleteReply, setFollowing, refetch: fetchAll };
}

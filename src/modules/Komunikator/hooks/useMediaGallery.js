import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { isImageFile } from '../utils/messageHelpers';
import { attachmentsOf } from '../utils/chatLogic';

// Galeria rozmowy (K11): tylko wiadomości z załącznikami (attachments != '[]'), paczkami po
// PAGE wiadomości, od najnowszych — „Wczytaj starsze” dociąga kolejną paczkę.
// enabled=false → nie pobieraj (galeria zamknięta); pobranie przy otwarciu.
const PAGE = 60;

export function flattenMedia(rows = []) {
  const out = [];
  for (const msg of rows) {
    attachmentsOf(msg).forEach((att, i) => {
      if (!att?.url) return;
      out.push({ ...att, key: `${msg.id}-${i}`, messageId: msg.id, senderEmail: msg.sender_email, createdAt: msg.created_at });
    });
  }
  return out;
}

export default function useMediaGallery(conversationId, enabled = true) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const seqRef = useRef(0);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const query = useCallback((before) => {
    let q = supabase
      .from('messages')
      .select('id, attachments, sender_email, created_at')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .not('attachments', 'is', null)
      .neq('attachments', '[]')
      .neq('attachments', '{}');
    if (before) q = q.lt('created_at', before);
    return q.order('created_at', { ascending: false }).limit(PAGE);
  }, [conversationId]);

  const fetchFirst = useCallback(async () => {
    if (!conversationId) { setRows([]); setHasMore(false); return; }
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const { data, error } = await query(null);
      if (error) throw error;
      if (seq !== seqRef.current) return;
      setRows(data || []);
      setHasMore((data || []).length === PAGE);
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [conversationId, query]);

  const loadMore = useCallback(async () => {
    const last = rowsRef.current[rowsRef.current.length - 1];
    if (!last || loadingMore) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const { data, error } = await query(last.created_at);
      if (error) throw error;
      if (seq !== seqRef.current) return;
      setRows((prev) => {
        const ids = new Set(prev.map((r) => r.id));
        return [...prev, ...(data || []).filter((r) => !ids.has(r.id))];
      });
      setHasMore((data || []).length === PAGE);
    } catch (err) {
      console.error('Error loading more media:', err);
      throw err;
    } finally {
      setLoadingMore(false);
    }
  }, [query, loadingMore]);

  const media = useMemo(() => flattenMedia(rows), [rows]);
  const images = useMemo(() => media.filter((m) => isImageFile(m.type)), [media]);
  const files = useMemo(() => media.filter((m) => !isImageFile(m.type)), [media]);

  useEffect(() => {
    if (enabled) fetchFirst();
  }, [fetchFirst, enabled]);

  return { media, images, files, loading, loadingMore, hasMore, loadMore, refetch: fetchFirst };
}

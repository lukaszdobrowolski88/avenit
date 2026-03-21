import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { isImageFile } from '../utils/messageHelpers';

export default function useMediaGallery(conversationId) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(false);

  // Pobierz wszystkie załączniki z konwersacji
  const fetchMedia = useCallback(async () => {
    if (!conversationId) {
      setMedia([]);
      return;
    }

    try {
      setLoading(true);

      // Pobierz wiadomości z załącznikami
      const { data, error } = await supabase
        .from('messages')
        .select('id, attachments, sender_email, created_at')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .not('attachments', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Rozpakuj załączniki
      const allMedia = [];
      (data || []).forEach(msg => {
        if (msg.attachments && Array.isArray(msg.attachments)) {
          msg.attachments.forEach(att => {
            allMedia.push({
              ...att,
              messageId: msg.id,
              senderEmail: msg.sender_email,
              createdAt: msg.created_at
            });
          });
        }
      });

      setMedia(allMedia);
    } catch (err) {
      console.error('Error fetching media:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  // Filtruj tylko obrazy
  const images = useMemo(() => {
    return media.filter(m => isImageFile(m.type));
  }, [media]);

  // Filtruj tylko pliki (nie-obrazy)
  const files = useMemo(() => {
    return media.filter(m => !isImageFile(m.type));
  }, [media]);

  // Pobierz przy zmianie konwersacji
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  return {
    media,
    images,
    files,
    loading,
    refetch: fetchMedia
  };
}

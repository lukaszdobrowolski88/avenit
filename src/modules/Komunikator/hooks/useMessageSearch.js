import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export default function useMessageSearch(conversationId) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const search = useCallback(async (searchQuery) => {
    if (!conversationId || !searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setQuery('');
      return;
    }

    try {
      setLoading(true);
      setQuery(searchQuery);

      // Szukaj w treści wiadomości
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, sender_email, created_at')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .ilike('content', `%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Pobierz dane użytkowników
      const senderEmails = [...new Set((data || []).map(m => m.sender_email))];

      let usersMap = {};
      if (senderEmails.length > 0) {
        const { data: usersData } = await supabase
          .from('app_users')
          .select('email, full_name, avatar_url')
          .in('email', senderEmails);

        (usersData || []).forEach(u => {
          usersMap[u.email] = u;
        });
      }

      // Wzbogać wyniki o dane użytkowników
      const enrichedResults = (data || []).map(msg => ({
        ...msg,
        sender: usersMap[msg.sender_email] || { email: msg.sender_email }
      }));

      setResults(enrichedResults);
    } catch (err) {
      console.error('Error searching messages:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const clearSearch = useCallback(() => {
    setResults([]);
    setQuery('');
  }, []);

  return {
    results,
    loading,
    query,
    search,
    clearSearch
  };
}

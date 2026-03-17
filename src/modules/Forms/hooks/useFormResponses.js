import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useFormResponses(formId) {
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0
  });

  const fetchResponses = useCallback(async (page = 1, limit = 50) => {
    if (!formId) return [];

    setLoading(true);
    setError(null);
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error: fetchError, count } = await supabase
        .from('form_responses')
        .select('*', { count: 'exact' })
        .eq('form_id', formId)
        .order('submitted_at', { ascending: false })
        .range(from, to);

      if (fetchError) throw fetchError;

      setResponses(data || []);
      setPagination({
        page,
        limit,
        total: count || 0
      });
      return data || [];
    } catch (err) {
      console.error('Error fetching responses:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [formId]);

  const getResponse = useCallback(async (responseId) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('form_responses')
        .select('*')
        .eq('id', responseId)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching response:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const submitResponse = useCallback(async (answers, respondentInfo = {}) => {
    setError(null);
    try {
      const response = {
        form_id: formId,
        answers,
        respondent_email: respondentInfo.email || null,
        respondent_name: respondentInfo.name || null
      };

      const { data, error: insertError } = await supabase
        .from('form_responses')
        .insert(response)
        .select()
        .single();

      if (insertError) throw insertError;
      return { success: true, data };
    } catch (err) {
      console.error('Error submitting response:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [formId]);

  const deleteResponse = useCallback(async (responseId) => {
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('form_responses')
        .delete()
        .eq('id', responseId);

      if (deleteError) throw deleteError;

      setResponses(prev => prev.filter(r => r.id !== responseId));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
      return { success: true };
    } catch (err) {
      console.error('Error deleting response:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const deleteAllResponses = useCallback(async () => {
    if (!formId) return { success: false, error: 'No form ID' };

    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('form_responses')
        .delete()
        .eq('form_id', formId);

      if (deleteError) throw deleteError;

      setResponses([]);
      setPagination(prev => ({ ...prev, total: 0 }));
      return { success: true };
    } catch (err) {
      console.error('Error deleting all responses:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [formId]);

  return {
    responses,
    loading,
    error,
    pagination,
    fetchResponses,
    getResponse,
    submitResponse,
    deleteResponse,
    deleteAllResponses
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useSmsTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sms_campaign_templates')
        .select('*')
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('useSmsTemplates error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const createTemplate = async (data) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from('sms_campaign_templates')
      .insert({ ...data, created_by: user?.email })
      .select()
      .single();
    if (error) throw error;
    setTemplates(prev => [created, ...prev]);
    return created;
  };

  const updateTemplate = async (id, data) => {
    const { data: updated, error } = await supabase
      .from('sms_campaign_templates')
      .update(data)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    setTemplates(prev => prev.map(t => t.id === id ? updated : t));
    return updated;
  };

  const deleteTemplate = async (id) => {
    const { error } = await supabase
      .from('sms_campaign_templates')
      .delete()
      .eq('id', id)
      .eq('is_system', false);
    if (error) throw error;
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  return { templates, loading, fetchTemplates, createTemplate, updateTemplate, deleteTemplate };
}

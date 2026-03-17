import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export function useTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('email_templates')
        .select(`
          *,
          creator:app_users!email_templates_created_by_fkey(full_name)
        `)
        .order('is_system', { ascending: false })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (templateData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');

      const { data, error: insertError } = await supabase
        .from('email_templates')
        .insert({
          ...templateData,
          created_by: user.email,
          is_system: false
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setTemplates(prev => [data, ...prev]);
      return data;
    } catch (err) {
      console.error('Error creating template:', err);
      throw err;
    }
  };

  const updateTemplate = async (id, updates) => {
    try {
      const { data, error: updateError } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...data } : t));
      return data;
    } catch (err) {
      console.error('Error updating template:', err);
      throw err;
    }
  };

  const deleteTemplate = async (id) => {
    try {
      // Nie można usunąć szablonów systemowych
      const template = templates.find(t => t.id === id);
      if (template?.is_system) {
        throw new Error('Nie można usunąć szablonu systemowego');
      }

      const { error: deleteError } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error('Error deleting template:', err);
      throw err;
    }
  };

  const getTemplate = useCallback(async (id) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching template:', err);
      throw err;
    }
  }, []);

  const duplicateTemplate = async (id) => {
    try {
      const original = await getTemplate(id);
      if (!original) throw new Error('Szablon nie istnieje');

      const newTemplate = {
        name: `${original.name} (kopia)`,
        subject: original.subject,
        html_content: original.html_content,
        json_design: original.json_design,
        category: original.category
      };

      return await createTemplate(newTemplate);
    } catch (err) {
      console.error('Error duplicating template:', err);
      throw err;
    }
  };

  // Grupuj szablony według kategorii
  const templatesByCategory = templates.reduce((acc, template) => {
    const category = template.category || 'general';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {});

  return {
    templates,
    templatesByCategory,
    loading,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getTemplate,
    duplicateTemplate
  };
}

// Kategorie szablonów
export const TEMPLATE_CATEGORIES = {
  general: { label: 'Ogólne', icon: 'FileText' },
  newsletter: { label: 'Newsletter', icon: 'Newspaper' },
  event: { label: 'Wydarzenie', icon: 'Calendar' },
  announcement: { label: 'Ogłoszenie', icon: 'Megaphone' }
};

import { useState, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { DEFAULT_FORM_SETTINGS } from '../utils/fieldTypes';

export function useForms(userEmail) {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchForms = useCallback(async (includeTemplates = false) => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('forms')
        .select('*')
        .order('created_at', { ascending: false });

      if (!includeTemplates) {
        query = query.eq('is_template', false);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setForms(data || []);
      return data || [];
    } catch (err) {
      console.error('Error fetching forms:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('forms')
        .select('*')
        .eq('is_template', true)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      return data || [];
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const getForm = useCallback(async (formId) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (fetchError) throw fetchError;
      return data;
    } catch (err) {
      console.error('Error fetching form:', err);
      setError(err.message);
      return null;
    }
  }, []);

  const createForm = useCallback(async (formData) => {
    setError(null);
    try {
      const newForm = {
        title: formData.title || 'Nowy formularz',
        description: formData.description || '',
        fields: formData.fields || [],
        settings: formData.settings || DEFAULT_FORM_SETTINGS,
        status: 'draft',
        is_template: formData.is_template || false,
        template_category: formData.template_category || null,
        created_by: userEmail
      };

      const { data, error: insertError } = await supabase
        .from('forms')
        .insert(newForm)
        .select()
        .single();

      if (insertError) throw insertError;

      setForms(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      console.error('Error creating form:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [userEmail]);

  const updateForm = useCallback(async (formId, updates) => {
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('forms')
        .update(updates)
        .eq('id', formId)
        .select()
        .single();

      if (updateError) throw updateError;

      setForms(prev => prev.map(f => f.id === formId ? data : f));
      return { success: true, data };
    } catch (err) {
      console.error('Error updating form:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const deleteForm = useCallback(async (formId) => {
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('forms')
        .delete()
        .eq('id', formId);

      if (deleteError) throw deleteError;

      setForms(prev => prev.filter(f => f.id !== formId));
      return { success: true };
    } catch (err) {
      console.error('Error deleting form:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  const duplicateForm = useCallback(async (formId) => {
    setError(null);
    try {
      const original = await getForm(formId);
      if (!original) throw new Error('Form not found');

      const duplicate = {
        title: `${original.title} (kopia)`,
        description: original.description,
        fields: original.fields,
        settings: original.settings,
        status: 'draft',
        is_template: false,
        template_category: null,
        created_by: userEmail
      };

      const { data, error: insertError } = await supabase
        .from('forms')
        .insert(duplicate)
        .select()
        .single();

      if (insertError) throw insertError;

      setForms(prev => [data, ...prev]);
      return { success: true, data };
    } catch (err) {
      console.error('Error duplicating form:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [getForm, userEmail]);

  const publishForm = useCallback(async (formId) => {
    return updateForm(formId, {
      status: 'published',
      published_at: new Date().toISOString()
    });
  }, [updateForm]);

  const unpublishForm = useCallback(async (formId) => {
    return updateForm(formId, {
      status: 'draft',
      published_at: null
    });
  }, [updateForm]);

  const closeForm = useCallback(async (formId) => {
    return updateForm(formId, {
      status: 'closed'
    });
  }, [updateForm]);

  const archiveForm = useCallback(async (formId) => {
    return updateForm(formId, {
      is_archived: true,
      archived_at: new Date().toISOString()
    });
  }, [updateForm]);

  const restoreForm = useCallback(async (formId) => {
    return updateForm(formId, {
      is_archived: false,
      archived_at: null
    });
  }, [updateForm]);

  const saveAsTemplate = useCallback(async (formId, category = null) => {
    setError(null);
    try {
      const original = await getForm(formId);
      if (!original) throw new Error('Form not found');

      const template = {
        title: original.title,
        description: original.description,
        fields: original.fields,
        settings: original.settings,
        status: 'draft',
        is_template: true,
        template_category: category,
        created_by: userEmail
      };

      const { data, error: insertError } = await supabase
        .from('forms')
        .insert(template)
        .select()
        .single();

      if (insertError) throw insertError;
      return { success: true, data };
    } catch (err) {
      console.error('Error saving as template:', err);
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, [getForm, userEmail]);

  const createFromTemplate = useCallback(async (template) => {
    const newForm = {
      title: template.title,
      description: template.description,
      fields: JSON.parse(JSON.stringify(template.fields)),
      settings: JSON.parse(JSON.stringify(template.settings || DEFAULT_FORM_SETTINGS)),
      is_template: false
    };
    return createForm(newForm);
  }, [createForm]);

  return {
    forms,
    loading,
    error,
    fetchForms,
    fetchTemplates,
    getForm,
    createForm,
    updateForm,
    deleteForm,
    duplicateForm,
    publishForm,
    unpublishForm,
    closeForm,
    archiveForm,
    restoreForm,
    saveAsTemplate,
    createFromTemplate
  };
}

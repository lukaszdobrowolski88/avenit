import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Rekordy własnych kolekcji kreatora (tabela module_records). Zapytania są ZAWSZE
// zawężone przez module_key — tego wymaga serwerowe egzekwowanie per moduł
// (routes.js: capability module:<key>). Rekord = { id, data:{...}, created_at, ... }.
export function useModuleRecords({ moduleId, moduleKey, tabId, collectionKey }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecords = useCallback(async () => {
    if (!moduleKey || !collectionKey) { setRecords([]); setLoading(false); return; }
    setLoading(true);
    try {
      let q = supabase
        .from('module_records')
        .select('*')
        .eq('module_key', moduleKey)
        .eq('collection_key', collectionKey);
      if (tabId) q = q.eq('tab_id', tabId);
      const { data, error: err } = await q.order('created_at', { ascending: false });
      if (err) throw err;
      setRecords(data || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [moduleKey, collectionKey, tabId]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const create = useCallback(async (dataObj) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('module_records').insert([{
        module_id: moduleId,
        module_key: moduleKey,
        tab_id: tabId || null,
        collection_key: collectionKey,
        data: dataObj || {},
        created_by: auth?.user?.id || null,
      }]);
      if (err) throw err;
      await fetchRecords();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [moduleId, moduleKey, tabId, collectionKey, fetchRecords]);

  const update = useCallback(async (id, dataObj) => {
    try {
      const { error: err } = await supabase
        .from('module_records')
        .update({ data: dataObj, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('module_key', moduleKey);
      if (err) throw err;
      await fetchRecords();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [moduleKey, fetchRecords]);

  const remove = useCallback(async (id) => {
    try {
      const { error: err } = await supabase
        .from('module_records')
        .delete()
        .eq('id', id)
        .eq('module_key', moduleKey);
      if (err) throw err;
      await fetchRecords();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [moduleKey, fetchRecords]);

  return { records, loading, error, create, update, remove, refresh: fetchRecords };
}

export default useModuleRecords;

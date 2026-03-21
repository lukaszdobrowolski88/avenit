import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useModules() {
  const [modules, setModules] = useState([]);
  const [tabs, setTabs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pobierz wszystkie moduły
  const fetchModules = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('app_modules')
        .select('*')
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;
      setModules(data || []);
    } catch (err) {
      console.error('Błąd pobierania modułów:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Pobierz zakładki dla modułu
  const fetchTabs = useCallback(async (moduleId) => {
    try {
      const { data, error: fetchError } = await supabase
        .from('app_module_tabs')
        .select('*')
        .eq('module_id', moduleId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setTabs(prev => ({
        ...prev,
        [moduleId]: data || []
      }));

      return data || [];
    } catch (err) {
      console.error('Błąd pobierania zakładek:', err);
      return [];
    }
  }, []);

  // Pobierz wszystkie zakładki dla wszystkich modułów
  const fetchAllTabs = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('app_module_tabs')
        .select('*')
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      // Grupuj zakładki po module_id
      const grouped = (data || []).reduce((acc, tab) => {
        if (!acc[tab.module_id]) acc[tab.module_id] = [];
        acc[tab.module_id].push(tab);
        return acc;
      }, {});

      setTabs(grouped);
    } catch (err) {
      console.error('Błąd pobierania zakładek:', err);
    }
  }, []);

  // Inicjalizacja wszystkich struktur dla niestandardowego modułu
  const initializeCustomModule = useCallback(async (moduleKey) => {
    try {
      // Wywołaj główną funkcję inicjalizacji (tworzy wszystkie tabele i kolumny)
      const { error } = await supabase.rpc('initialize_custom_module', {
        module_key: moduleKey
      });

      if (error) {
        // Jeśli główna funkcja nie istnieje, próbuj pojedyncze funkcje
        console.log('RPC initialize_custom_module nie dostępne, próbuję pojedyncze funkcje...');

        // Tabela członków
        await supabase.rpc('create_custom_members_table', {
          table_name: `custom_${moduleKey}_members`
        });

        // Tabela zadań
        await supabase.rpc('create_custom_tasks_table', {
          table_name: `custom_${moduleKey}_tasks`
        });

        // Tabela tablicy
        await supabase.rpc('create_custom_wall_table', {
          table_name: `custom_${moduleKey}_wall`
        });

        // Kolumna grafiku
        await supabase.rpc('create_schedule_column', {
          module_key: moduleKey
        });
      } else {
        console.log(`Struktury dla modułu ${moduleKey} utworzone pomyślnie`);
      }
    } catch (err) {
      console.log('Struktury modułu zostaną utworzone automatycznie przez trigger w bazie danych');
    }
  }, []);

  // Dodaj moduł
  const addModule = useCallback(async (moduleData) => {
    try {
      // Pobierz najwyższy display_order
      const maxOrder = modules.reduce((max, m) => Math.max(max, m.display_order || 0), 0);

      const { data, error: insertError } = await supabase
        .from('app_modules')
        .insert([{
          ...moduleData,
          display_order: maxOrder + 1,
          is_system: false
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      // Inicjalizuj wszystkie struktury dla nowego modułu
      // (trigger w bazie danych również to robi, ale wywołujemy dla pewności)
      await initializeCustomModule(moduleData.key);

      setModules(prev => [...prev, data]);
      return { success: true, data };
    } catch (err) {
      console.error('Błąd dodawania modułu:', err);
      return { success: false, error: err.message };
    }
  }, [modules, initializeCustomModule]);

  // Aktualizuj moduł
  const updateModule = useCallback(async (id, updates) => {
    try {
      const { data, error: updateError } = await supabase
        .from('app_modules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      setModules(prev => prev.map(m => m.id === id ? data : m));
      return { success: true, data };
    } catch (err) {
      console.error('Błąd aktualizacji modułu:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Usuń moduł
  const deleteModule = useCallback(async (id) => {
    try {
      const { error: deleteError } = await supabase
        .from('app_modules')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setModules(prev => prev.filter(m => m.id !== id));
      return { success: true };
    } catch (err) {
      console.error('Błąd usuwania modułu:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Aktualizuj kolejność modułów
  const updateModuleOrder = useCallback(async (reorderedModules) => {
    try {
      // Aktualizuj lokalnie natychmiast
      setModules(reorderedModules);

      // Przygotuj wszystkie aktualizacje
      const updates = reorderedModules.map((m, index) => ({
        id: m.id,
        display_order: index
      }));

      // Wykonaj wszystkie aktualizacje równolegle
      const promises = updates.map(update =>
        supabase
          .from('app_modules')
          .update({ display_order: update.display_order })
          .eq('id', update.id)
      );

      await Promise.all(promises);

      // Wymuś odświeżenie przez "dotknięcie" ostatniego modułu z timestampem
      // To zapewni że realtime wyłapie zmianę
      const lastModule = reorderedModules[reorderedModules.length - 1];
      if (lastModule) {
        await supabase
          .from('app_modules')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', lastModule.id);
      }

      return { success: true };
    } catch (err) {
      console.error('Błąd aktualizacji kolejności:', err);
      // Przywróć poprzednią kolejność
      fetchModules();
      return { success: false, error: err.message };
    }
  }, [fetchModules]);

  // Przełącz włączenie modułu
  const toggleModule = useCallback(async (id, isEnabled) => {
    return updateModule(id, { is_enabled: isEnabled });
  }, [updateModule]);

  // Dodaj zakładkę
  const addTab = useCallback(async (moduleId, tabData) => {
    try {
      const moduleTabs = tabs[moduleId] || [];
      const maxOrder = moduleTabs.reduce((max, t) => Math.max(max, t.display_order || 0), 0);

      const { data, error: insertError } = await supabase
        .from('app_module_tabs')
        .insert([{
          ...tabData,
          module_id: moduleId,
          display_order: maxOrder + 1,
          is_system: false
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      setTabs(prev => ({
        ...prev,
        [moduleId]: [...(prev[moduleId] || []), data]
      }));

      return { success: true, data };
    } catch (err) {
      console.error('Błąd dodawania zakładki:', err);
      return { success: false, error: err.message };
    }
  }, [tabs, modules]);

  // Aktualizuj zakładkę
  const updateTab = useCallback(async (tabId, moduleId, updates) => {
    try {
      const { data, error: updateError } = await supabase
        .from('app_module_tabs')
        .update(updates)
        .eq('id', tabId)
        .select()
        .single();

      if (updateError) throw updateError;

      setTabs(prev => ({
        ...prev,
        [moduleId]: (prev[moduleId] || []).map(t => t.id === tabId ? data : t)
      }));

      return { success: true, data };
    } catch (err) {
      console.error('Błąd aktualizacji zakładki:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Usuń zakładkę
  const deleteTab = useCallback(async (tabId, moduleId) => {
    try {
      const { error: deleteError } = await supabase
        .from('app_module_tabs')
        .delete()
        .eq('id', tabId);

      if (deleteError) throw deleteError;

      setTabs(prev => ({
        ...prev,
        [moduleId]: (prev[moduleId] || []).filter(t => t.id !== tabId)
      }));

      return { success: true };
    } catch (err) {
      console.error('Błąd usuwania zakładki:', err);
      return { success: false, error: err.message };
    }
  }, []);

  // Aktualizuj kolejność zakładek
  const updateTabOrder = useCallback(async (moduleId, reorderedTabs) => {
    try {
      // Aktualizuj lokalnie natychmiast
      setTabs(prev => ({
        ...prev,
        [moduleId]: reorderedTabs
      }));

      // Przygotuj wszystkie aktualizacje
      const updates = reorderedTabs.map((t, index) => ({
        id: t.id,
        display_order: index
      }));

      // Wykonaj wszystkie aktualizacje równolegle
      const promises = updates.map(update =>
        supabase
          .from('app_module_tabs')
          .update({ display_order: update.display_order })
          .eq('id', update.id)
      );

      await Promise.all(promises);

      return { success: true };
    } catch (err) {
      console.error('Błąd aktualizacji kolejności zakładek:', err);
      // Przywróć poprzednią kolejność
      fetchTabs(moduleId);
      return { success: false, error: err.message };
    }
  }, [fetchTabs]);

  // Pobierz dane przy montowaniu
  useEffect(() => {
    fetchModules();
    fetchAllTabs();
  }, [fetchModules, fetchAllTabs]);

  return {
    modules,
    tabs,
    loading,
    error,
    fetchModules,
    fetchTabs,
    fetchAllTabs,
    addModule,
    updateModule,
    deleteModule,
    updateModuleOrder,
    toggleModule,
    addTab,
    updateTab,
    deleteTab,
    updateTabOrder
  };
}

export default useModules;

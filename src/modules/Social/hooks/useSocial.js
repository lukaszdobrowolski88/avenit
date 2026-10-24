import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { socialApi } from '../lib/socialApi';

// Stan modułu: kanały, moje prawa, liczniki zakładek, konfiguracja Meta. Zmiany postów
// (publikacja przez worker, akceptacja na innym urządzeniu) przychodzą realtime → `version`
// rośnie, a widoki przeładowują listy.
export default function useSocial() {
  const [state, setState] = useState({ loading: true, accounts: [], access: {}, counts: {}, meta: {}, me: {}, error: null });
  const [version, setVersion] = useState(0);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const s = await socialApi.status();
      setState({ loading: false, accounts: s.accounts || [], access: s.access || {}, counts: s.counts || {}, meta: s.meta || {}, me: s.me || {}, error: null });
    } catch (e) {
      setState((prev) => ({ ...prev, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const bump = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setVersion((v) => v + 1); refresh(); }, 400);
  }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel('social_posts:module')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_posts' }, bump)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_accounts' }, bump)
      .subscribe();
    return () => { clearTimeout(timer.current); supabase.removeChannel(channel); };
  }, [bump]);

  return { ...state, version, refresh, reload: bump };
}

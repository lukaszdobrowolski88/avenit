import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { remindersApi } from './scheduleUi';

// „Moje przypomnienia” — aktywne przypomnienia o wiadomościach (z podglądem i miejscem rozmowy).
// Lista dociągana przy otwarciu i po każdej zmianie (realtime tylko do właściciela).
export default function useMyReminders(open) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { reminders } = await remindersApi.list();
      setItems(Array.isArray(reminders) ? reminders : []);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const channel = supabase
      .channel('message_reminders:mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reminders' }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, refresh]);

  const cancel = useCallback(async (id) => {
    await remindersApi.cancel(id);
    setItems((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { items, loading, error, refresh, cancel };
}

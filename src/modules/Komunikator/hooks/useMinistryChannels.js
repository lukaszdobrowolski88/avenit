import { useCallback, useState } from 'react';
import { supabase } from '../../../lib/supabase';

// Kanały służb i grup domowych (K8). Skład kanałów utrzymuje SERWER (fn chat-channels-sync:
// worker co 10 min — dopisuje nowych, usuwa tych, których już nie ma w zespole/grupie, lider =
// administrator kanału; usunięta grupa/moduł → kanał archiwalny). Przeglądarka niczego już nie
// zapisuje (dawniej każdy klient sam zakładał kanały i dopisywał osoby — wyścigi i duplikaty).
// Tu zostaje tylko odczyt (kanały przychodzą z listą rozmów) i ręczne „odśwież teraz” dla
// administratora aplikacji (POST /api/fn/chat-channels-sync).
export default function useMinistryChannels(userEmail, { onSynced } = {}) {
  const [syncing, setSyncing] = useState(false);

  // Rzuca błąd — wywołujący pokazuje komunikat.
  const syncNow = useCallback(async () => {
    if (!userEmail) return null;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('chat-channels-sync', { body: {}, silent: true });
      if (error) throw error;
      onSynced?.(true);
      return data;
    } finally {
      setSyncing(false);
    }
  }, [userEmail, onSynced]);

  return { syncNow, syncing };
}

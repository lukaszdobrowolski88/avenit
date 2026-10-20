// Hooki wątku: zadania utworzone z widocznych wiadomości (paczką, tylko dla nowych id) i moje
// zapisane wiadomości (przełącznik „Zapisz / Usuń z zapisanych”).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadMessageTasks, loadSavedIds, saveMessage, unsaveMessage } from './api';

// Zadania z wiadomości. Pytamy tylko o wiadomości, o które jeszcze nie pytaliśmy (doczytanie
// starszych, nowa wiadomość) — jedno zapytanie na paczkę, nie na każdą wiadomość.
export function useMessageTasks(messages, enabled = true) {
  const [byMessage, setByMessage] = useState(() => new Map());
  const asked = useRef(new Set());
  const ids = useMemo(
    () => (messages || []).filter((m) => m?.id && !m.deleted_at && m.message_type !== 'system').map((m) => String(m.id)),
    [messages],
  );

  // Odpowiedź po zmianie listy też trafia do mapy (id są już „zapytane”) — pomijamy tylko po odmontowaniu.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // Brak dostępu do zadań — nie pytamy przy każdej nowej wiadomości.
  const off = useRef(false);

  useEffect(() => {
    if (!enabled || off.current) return;
    const fresh = ids.filter((id) => !asked.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => asked.current.add(id));
    loadMessageTasks(fresh).then((map) => {
      if (map === null) { off.current = true; return; }
      if (!mounted.current || !map.size) return;
      setByMessage((prev) => {
        const next = new Map(prev);
        for (const [k, v] of map) next.set(k, v);
        return next;
      });
    }, () => { fresh.forEach((id) => asked.current.delete(id)); });
  }, [ids, enabled]);

  // Świeżo utworzone zadanie — od razu przy wiadomości (bez czekania na odczyt).
  const addLocal = useCallback((messageId, task) => {
    setByMessage((prev) => {
      const next = new Map(prev);
      next.set(String(messageId), [...(next.get(String(messageId)) || []), task]);
      return next;
    });
  }, []);

  const tasksFor = useCallback((messageId) => byMessage.get(String(messageId)) || null, [byMessage]);
  return { tasksFor, addLocal };
}

// Moje zakładki: Set id wiadomości + przełącznik (optymistycznie, cofany przy błędzie).
export function useSavedMessageIds(enabled = true) {
  const [saved, setSaved] = useState(() => new Set());
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadSavedIds().then(
      (rows) => { if (alive) setSaved(new Set(rows.map((r) => String(r.message_id)))); },
      // Stary serwer (bez tabeli) albo brak dostępu — bez akcji „Zapisz”.
      () => { if (alive) setAvailable(false); },
    );
    return () => { alive = false; };
  }, [enabled]);

  const isSaved = useCallback((messageId) => saved.has(String(messageId)), [saved]);

  const toggleSaved = useCallback(async (messageId) => {
    const key = String(messageId);
    const was = saved.has(key);
    setSaved((prev) => { const n = new Set(prev); if (was) n.delete(key); else n.add(key); return n; });
    try {
      if (was) await unsaveMessage(key); else await saveMessage(key);
      return !was;
    } catch (err) {
      setSaved((prev) => { const n = new Set(prev); if (was) n.add(key); else n.delete(key); return n; });
      throw err;
    }
  }, [saved]);

  return { isSaved, toggleSaved, available };
}

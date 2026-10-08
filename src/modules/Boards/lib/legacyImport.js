import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';

// Stare tabele zadań (media_tasks, mlodziezowka_tasks, home_group_tasks, custom_<key>_tasks, tasks
// z Kalendarza) → Tablica. Import i uzupełnianie robi SERWER (fn board-import-legacy) w jednej
// transakcji: z osobami przypisanymi i komentarzami, idempotentnie po boards.source_kind.
// Dawniej robiła to przeglądarka (z uprawnieniami odwiedzającego) i gubiła osoby oraz komentarze.

async function invoke(body, silent) {
  const { data, error } = await supabase.functions.invoke('board-import-legacy', { body, silent });
  if (error) throw Object.assign(new Error(error.message || String(error)), { status: error.status });
  if (!data?.board_id) throw new Error(data?.error || tr('Nie udało się przenieść zadań'));
  return data;
}

// Tablica dla źródła: istniejąca albo świeżo zaimportowana. → { boardId, created, imported, backfillNeeded }
export async function importLegacyTasks({ sourceKind, title }) {
  const d = await invoke({ source: sourceKind, mode: 'import', title });
  return { boardId: d.board_id, created: !!d.created, imported: d.imported || 0, backfillNeeded: !!d.backfill_needed };
}

// Uzupełnienie tablicy zaimportowanej dawniej w przeglądarce: puste „Osoby” + brakujące komentarze.
// Ciche (bez globalnego komunikatu) — dzieje się w tle. → { changed, peopleFilled, commentsAdded }
export async function backfillLegacyTasks({ sourceKind }) {
  const d = await invoke({ source: sourceKind, mode: 'backfill' }, true);
  return { changed: !!d.changed, peopleFilled: d.people_filled || 0, commentsAdded: d.comments_added || 0 };
}

// Czy tablica wymaga uzupełnienia: brak znacznika legacy_backfill_at (kolumna przychodzi z select('*');
// baza przed migracją 092 jej nie ma — wtedy też próbujemy, serwer jest idempotentny).
export const needsLegacyBackfill = (board) => !!board?.source_kind && !board.legacy_backfill_at;

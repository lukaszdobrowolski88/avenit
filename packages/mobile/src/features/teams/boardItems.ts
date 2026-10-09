import { supabase } from '../../lib/supabase';

// Zapisy elementów tablic (zadań) — wspólne dla zakładek „Zadania”, „Moich zadań” i modułów
// z kreatora. Kontrakt jak web (src/modules/Boards/hooks/useBoardData.js):
//   • komórki zmieniamy przez fn board-item-patch (serwer scala je pod blokadą wiersza) —
//     zapis CAŁYCH komórek z pamięci podręcznej nadpisywał zmiany innych osób;
//   • na starym serwerze (bez tej funkcji) — świeży odczyt komórek, scalenie, zapis;
//   • każda zmiana trafia do dziennika board_item_activity (błąd dziennika nie cofa zmiany).

export type Cells = Record<string, unknown>;

const asObject = (v: unknown): Cells => {
  if (!v) return {};
  if (typeof v === 'string') {
    try {
      const o = JSON.parse(v);
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Cells) : {};
    } catch {
      return {};
    }
  }
  return typeof v === 'object' && !Array.isArray(v) ? (v as Cells) : {};
};

interface FnError {
  message?: string;
  status?: number;
  context?: { message?: string; error?: string } | null;
}

// Brak trasy funkcji na serwerze (stary backend) — Fastify: 404 „Route POST:/api/fn/… not found”.
// 404 z treścią od funkcji (np. „Nie znaleziono zadania”) to zwykły błąd, nie brak funkcji.
export const isMissingFn = (error: FnError | null | undefined): boolean => {
  if (!error || error.status !== 404) return false;
  const msg = `${error.context?.message ?? ''} ${error.message ?? ''}`;
  return /route .* not found|^\s*not found\s*$/i.test(msg) || error.context?.error === 'Not Found';
};

const fail = (error: FnError | { message?: string } | null | undefined, fallback: string) =>
  new Error((error as { message?: string } | null)?.message || fallback);

// Zmiana wybranych komórek (null usuwa klucz). Zwraca komórki po zapisie i — gdy znany
// (ścieżka zapasowa) — stan sprzed zapisu.
export async function patchBoardItemCells(
  itemId: string,
  cells: Record<string, unknown | null>,
): Promise<{ cells: Cells; before: Cells | null }> {
  const { data, error } = await supabase.functions.invoke('board-item-patch', { body: { item_id: itemId, cells } });
  if (!error) return { cells: asObject((data as { item?: { cells?: unknown } } | null)?.item?.cells), before: null };
  if (!isMissingFn(error as FnError)) throw fail(error, 'Nie udało się zapisać zmiany.');

  // Stary serwer: świeży stan elementu tuż przed zapisem — nie nadpiszemy cudzych zmian.
  const { data: fresh, error: e1 } = await supabase.from('board_items').select('cells').eq('id', itemId).maybeSingle();
  if (e1) throw fail(e1, 'Nie udało się wczytać zadania.');
  if (!fresh) throw new Error('Nie znaleziono zadania — mogło zostać usunięte.');
  const before = asObject((fresh as { cells?: unknown }).cells);
  const merged: Cells = { ...before };
  for (const [k, v] of Object.entries(cells)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  const { error: e2 } = await (supabase.from('board_items') as any).update({ cells: merged }).eq('id', itemId);
  if (e2) throw fail(e2, 'Nie udało się zapisać zmiany.');
  return { cells: merged, before };
}

// from_value/to_value to JSONB — skalar opakowujemy w { value } (jak web).
const asJson = (x: unknown) => (x === null || x === undefined ? null : typeof x === 'object' ? x : { value: x });

export interface ActivityEntry {
  itemId: string;
  boardId: string | null;
  action: 'created' | 'status_changed' | 'assigned' | 'value_changed' | 'moved';
  columnId?: string | null;
  from?: unknown;
  to?: unknown;
  actorEmail: string | null;
  actorName?: string | null;
}

// Wpis dziennika aktywności — w tle; błąd nie blokuje zmiany.
export function logBoardActivity(e: ActivityEntry): void {
  if (!e.boardId) return;
  try {
    Promise.resolve(
      (supabase.from('board_item_activity') as any).insert({
        item_id: e.itemId,
        board_id: e.boardId,
        actor_email: e.actorEmail || null,
        actor_name: e.actorName || null,
        column_id: e.columnId || null,
        action: e.action,
        from_value: asJson(e.from),
        to_value: asJson(e.to),
      }),
    ).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    /* dziennik nie może blokować zmiany */
  }
}

// Tablica zadań modułu (source_kind = stara tabela zadań: media_tasks, custom_<key>_tasks…).
// Najstarsza tablica źródła — tę samą wybiera web i serwer (gdyby kiedyś powstały dwie).
export async function findTasksBoardId(sourceKind: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('boards')
    .select('id')
    .eq('source_kind', sourceKind)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw fail(error, 'Nie udało się wczytać tablicy zadań.');
  const id = ((data ?? []) as { id?: string | number }[])[0]?.id;
  return id != null ? String(id) : null;
}

// Gdy tablicy jeszcze nie ma — serwer tworzy ją i przenosi stare zadania (fn board-import-legacy,
// idempotentnie po source_kind; jak ModuleBoard na webie przy pierwszym otwarciu zakładki).
export async function ensureTasksBoardId(sourceKind: string, title?: string | null): Promise<string> {
  const existing = await findTasksBoardId(sourceKind);
  if (existing) return existing;
  const { data, error } = await supabase.functions.invoke('board-import-legacy', {
    body: { source: sourceKind, mode: 'import', ...(title ? { title } : {}) },
  });
  if (error) throw fail(error, 'Nie udało się utworzyć tablicy zadań.');
  const id = (data as { board_id?: string | number; error?: string } | null)?.board_id;
  if (id == null) throw new Error((data as { error?: string } | null)?.error || 'Nie udało się utworzyć tablicy zadań.');
  return String(id);
}

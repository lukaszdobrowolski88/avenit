// Automatyzacje tablic — czysta logika akcji wykonywanych w kliencie (testy obok).
import { addDays, format } from 'date-fns';

// Wiersz nowego elementu dla akcji „Utwórz element” (params z AutomationsPanel → createItemParams):
// { name, groupId?, cells?, dueColumnId?, dueOffsetDays? }. Komórki tylko dla istniejących kolumn,
// grupa — wskazana, gdy wciąż istnieje, inaczej pierwsza. null = brak grupy (nie ma gdzie dodać).
export function buildCreatedItem({ params = {}, boardId, groups = [], items = [], columns = [], userEmail = null, now = new Date(), fallbackName = '' }) {
  const ordered = [...groups].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const group = ordered.find((g) => g.id === params.groupId) || ordered[0];
  if (!group) return null;
  const colIds = new Set(columns.map((c) => c.id));
  const cells = {};
  for (const [k, v] of Object.entries(params.cells || {})) if (colIds.has(k) && v != null) cells[k] = v;
  if (params.dueColumnId && colIds.has(params.dueColumnId)) {
    cells[params.dueColumnId] = format(addDays(now, Number(params.dueOffsetDays) || 0), 'yyyy-MM-dd');
  }
  const maxOrder = items.filter((it) => it.group_id === group.id && !it.parent_item_id)
    .reduce((m, it) => Math.max(m, it.display_order || 0), -1);
  return {
    board_id: boardId, group_id: group.id, name: String(params.name || fallbackName || '').slice(0, 500),
    cells, display_order: maxOrder + 1, created_by: userEmail,
  };
}

import { supabase } from '../../../lib/supabase';

// Cache pełnych elementów i kolumn tablic (dla kolumn relacyjnych i Lustra).
// Prosty cache modułowy z krótkim TTL i możliwością inwalidacji.
const itemsCache = new Map(); // boardId → { at, rows }
const colsCache = new Map();
const TTL = 30_000;

export async function fetchBoardItemsFull(boardId) {
  if (!boardId) return [];
  const c = itemsCache.get(boardId);
  if (c && (Date.now() - c.at) < TTL) return c.rows;
  const { data } = await supabase.from('board_items').select('id, name, cells').eq('board_id', boardId).is('parent_item_id', null);
  const rows = data || [];
  itemsCache.set(boardId, { at: Date.now(), rows });
  return rows;
}

export async function fetchBoardColumnsCached(boardId) {
  if (!boardId) return [];
  const c = colsCache.get(boardId);
  if (c && (Date.now() - c.at) < TTL) return c.rows;
  const { data } = await supabase.from('board_columns').select('id, name, type, settings').eq('board_id', boardId).order('display_order');
  const rows = data || [];
  colsCache.set(boardId, { at: Date.now(), rows });
  return rows;
}

export function invalidateRelationCache(boardId) {
  itemsCache.delete(boardId);
  colsCache.delete(boardId);
}

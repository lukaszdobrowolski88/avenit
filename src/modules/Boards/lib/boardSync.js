// Synchronizacja zapisów tablicy — czysta logika (bez Reacta), testowana w boardSync.test.js.
//
//  • zapis komórki/pola idzie przez fn board-item-patch (serwer scala TYLKO zmienione klucze pod blokadą
//    wiersza) — wcześniej klient wysyłał całe `cells`, więc dwie osoby edytujące różne kolumny tego
//    samego zadania nadpisywały sobie zmiany. Stary serwer (404 trasy) → świeży odczyt + scalenie;
//  • „edycje w locie” (pendingEdits): wiersz z realtime/odświeżenia nie cofa wartości, której zapis
//    jeszcze trwa;
//  • kolejka usunięć z „Cofnij” (undoQueue): usunięcie wykonuje się po kilku sekundach, chyba że ktoś
//    cofnie; flush przy odmontowaniu/zamknięciu karty.

// cells + patch → nowe cells; null/undefined usuwa klucz (jak board-item-patch na serwerze).
export function applyCellPatch(cells, patch) {
  const out = { ...(cells && typeof cells === 'object' ? cells : {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

// Rejestr edycji w locie: itemId → klucz ('c:<kolumna>' | 'f:<pole>') → { value, seq }.
// end(token) zdejmuje wpis tylko, gdy w międzyczasie nie było nowszej edycji tego samego klucza.
export function createPendingEdits() {
  const byItem = new Map();
  let seq = 0;
  return {
    begin(itemId, { cells = null, fields = null } = {}) {
      const id = String(itemId);
      const m = byItem.get(id) || new Map();
      const s = ++seq;
      const keys = [];
      for (const [k, v] of Object.entries(cells || {})) { m.set(`c:${k}`, { value: v, seq: s }); keys.push(`c:${k}`); }
      for (const [k, v] of Object.entries(fields || {})) { m.set(`f:${k}`, { value: v, seq: s }); keys.push(`f:${k}`); }
      byItem.set(id, m);
      return { itemId: id, seq: s, keys };
    },
    end(token) {
      if (!token) return;
      const m = byItem.get(token.itemId);
      if (!m) return;
      for (const k of token.keys) {
        const e = m.get(k);
        if (e && e.seq === token.seq) m.delete(k);
      }
      if (!m.size) byItem.delete(token.itemId);
    },
    has(itemId) { return byItem.has(String(itemId)); },
    // Wiersz z serwera + wartości, których zapis jeszcze trwa.
    overlay(row) {
      if (!row || row.id == null) return row;
      const m = byItem.get(String(row.id));
      if (!m || !m.size) return row;
      let cells = null;
      const fields = {};
      for (const [k, e] of m) {
        if (k.startsWith('c:')) {
          if (!cells) cells = { ...(row.cells || {}) };
          const ck = k.slice(2);
          if (e.value === null || e.value === undefined) delete cells[ck];
          else cells[ck] = e.value;
        } else {
          fields[k.slice(2)] = e.value;
        }
      }
      return { ...row, ...fields, ...(cells ? { cells } : {}) };
    },
    clear() { byItem.clear(); },
  };
}

// Wiersz starszy niż ten, który już mamy (spóźnione echo realtime) — pomijamy.
export function isStaleRow(incoming, current) {
  const a = Date.parse(incoming?.updated_at || '');
  const b = Date.parse(current?.updated_at || '');
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

// Wstaw/zastąp wiersz po id (z nakładką edycji w locie); spóźnione echo nie cofa nowszego stanu.
export function upsertRow(list, row, overlay = (r) => r) {
  if (!row || row.id == null) return list;
  const i = list.findIndex((x) => x.id === row.id);
  if (i < 0) return [...list, overlay(row)];
  if (isStaleRow(row, list[i])) return list;
  const next = list.slice();
  next[i] = overlay(row);
  return next;
}

// ── Funkcje serwera z obsługą starego serwera (brak trasy → 404 Fastify) ──
const missingFns = new Set();

export function isFnMissing(error) {
  if (!error || Number(error.status) !== 404) return false;
  const ctx = error.context;
  if (!ctx || typeof ctx !== 'object') return true;
  if (typeof ctx.message === 'string' && /^Route\s/i.test(ctx.message)) return true;
  return ctx.error === 'Not Found' && !ctx.code;
}

// → { data } | { error } | { missing: true }. silent: błąd obsługuje wywołujący (bez globalnego toastu).
export async function invokeFn(client, name, body) {
  if (missingFns.has(name)) return { missing: true };
  let res;
  try {
    res = await client.functions.invoke(name, { body, silent: true });
  } catch (e) {
    return { error: e };
  }
  if (res?.error) {
    if (isFnMissing(res.error)) { missingFns.add(name); return { missing: true }; }
    return { error: res.error };
  }
  return { data: res?.data ?? null };
}

export function resetFnCache() { missingFns.clear(); }

const PATCH_FIELDS = ['name', 'description', 'group_id', 'parent_item_id', 'event_id'];

// Zapis zadania: { cells?, name?, description?, group_id?, parent_item_id?, event_id? }.
// Zwraca { ok, item?, error? }. Stary serwer: świeże cells z bazy + scalenie tylko zmienionych kluczy.
export async function patchBoardItem(client, itemId, patch) {
  const body = { item_id: itemId };
  if (patch.cells) body.cells = patch.cells;
  for (const f of PATCH_FIELDS) if (f in patch) body[f] = patch[f];
  const r = await invokeFn(client, 'board-item-patch', body);
  if (!r.missing) {
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, item: r.data?.item || null };
  }
  const upd = {};
  for (const f of PATCH_FIELDS) if (f in patch) upd[f] = patch[f];
  if (patch.cells) {
    const fresh = await client.from('board_items').select('cells').eq('id', itemId).single();
    if (fresh.error) return { ok: false, error: fresh.error };
    upd.cells = applyCellPatch(fresh.data?.cells, patch.cells);
  }
  if (!Object.keys(upd).length) return { ok: true, item: null };
  const { data, error } = await client.from('board_items').update(upd).eq('id', itemId).select().single();
  if (error) return { ok: false, error };
  return { ok: true, item: data || null };
}

// Kolejność (i grupa) zadań jednym wywołaniem; stary serwer — zapis po kolei.
export async function reorderBoardItems(client, { boardId, groupId, orderedIds }) {
  const r = await invokeFn(client, 'board-items-reorder', { board_id: boardId, group_id: groupId, ordered_ids: orderedIds });
  if (!r.missing) return r.error ? { ok: false, error: r.error } : { ok: true };
  const results = await Promise.all(orderedIds.map((id, i) =>
    client.from('board_items').update({ display_order: i, group_id: groupId }).eq('id', id)));
  const bad = results.find((x) => x?.error);
  return bad ? { ok: false, error: bad.error } : { ok: true };
}

// ── Kolejka usunięć z „Cofnij” ─────────────────────────────────────────
// schedule(run) → { undo, commit }. run wykonuje się po delayMs (albo przy flushAll). undo() przed
// wykonaniem anuluje i zwraca true; po wykonaniu zwraca false (już za późno).
export function createUndoQueue({ delayMs = 6000, timers = { set: setTimeout, clear: clearTimeout } } = {}) {
  const pending = new Map();
  let n = 0;
  const api = {
    schedule(run) {
      const key = ++n;
      let state = 'pending';
      const commit = () => {
        if (state !== 'pending') return Promise.resolve(false);
        state = 'committed';
        timers.clear(entry.timer);
        pending.delete(key);
        return Promise.resolve().then(run).then(() => true, () => true);
      };
      const undo = () => {
        if (state !== 'pending') return false;
        state = 'undone';
        timers.clear(entry.timer);
        pending.delete(key);
        return true;
      };
      const entry = { commit, timer: null };
      entry.timer = timers.set(commit, delayMs);
      pending.set(key, entry);
      return { undo, commit };
    },
    flushAll() { return Promise.all([...pending.values()].map((e) => e.commit())); },
    size() { return pending.size; },
  };
  return api;
}

// Id zadania + wszystkich jego podzadań (dowolnie głęboko) — usuwane i chowane razem.
export function withDescendants(ids, items) {
  const byParent = new Map();
  for (const it of items || []) {
    if (it.parent_item_id == null) continue;
    const k = String(it.parent_item_id);
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(it.id);
  }
  const out = new Set();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const c of byParent.get(String(id)) || []) stack.push(c);
  }
  return out;
}

// Licznik komentarzy: Map(itemId → Set(id komentarza)) + zdarzenie realtime board_item_updates.
// Realtime ignoruje filtr — odsiewamy po board_id. Idempotentne (echo własnego wpisu nie dubluje).
export function applyCommentEvent(map, payload, boardId) {
  const type = payload?.eventType;
  if (type === 'DELETE') {
    const id = payload.old?.id;
    if (id == null) return map;
    let changed = false;
    const next = new Map(map);
    for (const [k, set] of map) {
      if (set.has(id)) { const s = new Set(set); s.delete(id); next.set(k, s); changed = true; }
    }
    return changed ? next : map;
  }
  const row = payload?.new;
  if (!row || row.id == null || row.item_id == null) return map;
  if (boardId != null && row.board_id != null && String(row.board_id) !== String(boardId)) return map;
  const k = String(row.item_id);
  const cur = map.get(k);
  if (cur?.has(row.id)) return map;
  const next = new Map(map);
  next.set(k, new Set([...(cur || []), row.id]));
  return next;
}

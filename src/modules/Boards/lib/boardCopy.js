// Kopia tablicy — „Duplikuj”, „Zapisz jako szablon” i „Utwórz z mojego szablonu” (czysta logika).
// Każda kolumna, grupa, element (z podelementami) i widok dostaje NOWE id nadane po stronie
// klienta, a każde odwołanie do starego id — klucze komórek, ustawienia kolumn, config widoków,
// form_settings.fields, zależności między elementami tej tablicy — jest przepisane na nowe.
// Dzięki znanym z góry id zapis to kilka wstawek paczkami (zamiast setek pojedynczych), bez
// RETURNING — serwer nie traktuje kopii jak przypisania osób (boardNotify pomija takie wstawki).

export function newId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Zamienia stare id na nowe w dowolnej strukturze JSON — w wartościach i w kluczach obiektów
// (komórki są kluczowane id kolumny, config widoku bywa mapą { [columnId]: szerokość }).
// Id to UUID-y, więc dokładne dopasowanie napisu nie trafi przypadkiem w zwykły tekst.
export function remapIds(value, idMap) {
  if (typeof value === 'string') return idMap.has(value) ? idMap.get(value) : value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, idMap));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[idMap.has(k) ? idMap.get(k) : k] = remapIds(v, idMap);
    return out;
  }
  return value;
}

const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0);

// Poziomy elementów: najpierw elementy, potem ich podelementy (rodzic musi istnieć przed dzieckiem).
// Podelement, którego rodzica nie ma w kopii, staje się zwykłym elementem.
function itemLevels(items) {
  const ids = new Set(items.map((it) => String(it.id)));
  const parentOf = new Map(items.map((it) => [String(it.id), it.parent_item_id != null && ids.has(String(it.parent_item_id)) ? String(it.parent_item_id) : null]));
  const depthOf = new Map();
  const depth = (id, seen = new Set()) => {
    if (depthOf.has(id)) return depthOf.get(id);
    const p = parentOf.get(id);
    // Pętla w danych (a → b → a) — przerwij, element trafia na najwyższy poziom.
    const d = !p || seen.has(p) ? 0 : depth(p, new Set([...seen, id])) + 1;
    depthOf.set(id, d);
    return d;
  };
  const levels = [];
  for (const it of [...items].sort(byOrder)) {
    const d = depth(String(it.id));
    (levels[d] = levels[d] || []).push({ item: it, parent: d === 0 ? null : parentOf.get(String(it.id)) });
  }
  return levels.filter(Boolean);
}

// src: { columns, groups, items, views, formSettings? }; opts: { boardId, userEmail, withItems, makeId }
// → { columns, groups, itemLevels: [[...elementy], [...podelementy], …], views, formSettings, idMap }
export function planBoardCopy(src, { boardId, userEmail = null, withItems = true, makeId = newId } = {}) {
  const columns = [...(src.columns || [])].sort(byOrder);
  const groups = [...(src.groups || [])].sort(byOrder);
  const views = [...(src.views || [])].sort(byOrder);
  const items = withItems ? (src.items || []) : [];

  const idMap = new Map();
  for (const x of [...columns, ...groups, ...views, ...items]) idMap.set(String(x.id), makeId());
  const mapped = (id) => (id == null ? null : idMap.get(String(id)) ?? null);

  return {
    idMap,
    columns: columns.map((c, i) => ({
      id: mapped(c.id), board_id: boardId, name: c.name, type: c.type,
      settings: remapIds(c.settings || {}, idMap), display_order: c.display_order ?? i, width: c.width ?? 160,
    })),
    groups: groups.map((g, i) => ({
      id: mapped(g.id), board_id: boardId, name: g.name, color: g.color ?? null, display_order: g.display_order ?? i,
    })),
    itemLevels: itemLevels(items).map((level) => level.map(({ item: it, parent }) => ({
      id: mapped(it.id), board_id: boardId,
      group_id: mapped(it.group_id),
      parent_item_id: parent ? mapped(parent) : null,
      name: it.name || '',
      ...(it.description != null ? { description: it.description } : {}),
      cells: remapIds(it.cells || {}, idMap),
      display_order: it.display_order ?? 0,
      created_by: userEmail,
    }))),
    views: views.map((v, i) => ({
      id: mapped(v.id), board_id: boardId, name: v.name, type: v.type,
      config: remapIds(v.config || {}, idMap), is_default: !!v.is_default, display_order: v.display_order ?? i,
    })),
    formSettings: src.formSettings ? remapIds(src.formSettings, idMap) : null,
  };
}

// Paczki do wstawek (limit analizy jednego zapisu po stronie serwera to 200 wierszy).
export function chunk(rows, size = 200) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

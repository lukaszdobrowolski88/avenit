// Ustawienia formularza tablicy (boards.form_settings) — czysta logika, testy obok.
// fields: lista id kolumn pokazywanych w formularzu. Brak/pusta lista = wszystkie pola (także
// kolumny dodane później) — tak czyta ją serwer (fn board-form-get). Odznaczenie wszystkich
// zapisujemy jako [NO_FIELDS]: niepusta lista, która nie pasuje do żadnej kolumny.

// Typy pól publicznego formularza (= ALLOWED_TYPES w packages/api/src/fn/board-form-get.js).
export const PUBLIC_FORM_TYPES = new Set([
  'text', 'long_text', 'number', 'date', 'timeline', 'dropdown',
  'status', 'priority', 'checkbox', 'rating', 'link', 'progress',
]);
export const NO_FIELDS = '__none__';

const byOrder = (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0);

// Kolumny, które w ogóle mogą być polem formularza (w kolejności tablicy).
export const formColumns = (columns) => (columns || []).filter((c) => PUBLIC_FORM_TYPES.has(c.type)).sort(byOrder);

export function selectedFieldIds(columns, settings) {
  const all = formColumns(columns).map((c) => String(c.id));
  const f = settings?.fields;
  if (!Array.isArray(f) || !f.length) return all;
  const set = new Set(f.map(String));
  return all.filter((id) => set.has(id));
}

// Kolumny pokazywane w formularzu (podgląd w widoku Formularz = to, co zobaczy osoba z linku).
export function visibleFormColumns(columns, settings) {
  const ids = new Set(selectedFieldIds(columns, settings));
  return formColumns(columns).filter((c) => ids.has(String(c.id)));
}

// Nowa wartość form_settings.fields po przełączeniu jednego pola.
export function toggleFormField(columns, settings, id) {
  const all = formColumns(columns).map((c) => String(c.id));
  const cur = new Set(selectedFieldIds(columns, settings));
  const key = String(id);
  if (cur.has(key)) cur.delete(key); else cur.add(key);
  const next = all.filter((x) => cur.has(x));
  if (next.length === all.length) return [];
  if (next.length === 0) return [NO_FIELDS];
  return next;
}

// Słowniki Finansów: obszary budżetu (służby + własne), kategorie, tagi, projekty.
// Transakcje trzymają NAZWY (category / cost_category / type / tags), więc zmiana nazwy
// w słowniku musi przepisać też istniejące wiersze — inaczej historia „odpina się”.

// Wartość specjalna na liście wyboru: „+ Dodaj nowy…” (otwiera okno z nazwą).
export const NEW_OPTION = '__new__';

// Lista „Służba / obszar”: służby (moduły) + własne obszary + bieżąca wartość, gdy jej
// już nie ma na liście (np. wyłączony obszar w starej pozycji) — żeby pole jej nie gubiło.
export function buildAreaOptions(serviceOptions, areas, current, tr = (s) => s) {
  const seen = new Set();
  const out = [];
  const push = (value, label) => {
    const k = String(value || '').trim().toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ value, label });
  };
  (serviceOptions || []).forEach((o) => push(o.value, o.label));
  (areas || []).filter((a) => a.is_active !== false).forEach((a) => push(a.name, a.name));
  if (current) push(current, current);
  return out;
}

// Opcje projektów do selecta (zamknięte projekty tylko, gdy już są wybrane).
export function projectOptions(projects, current, tr = (s) => s) {
  return [
    { value: '', label: tr('— bez projektu —') },
    ...(projects || [])
      .filter((p) => p.status !== 'closed' || String(p.id) === String(current || ''))
      .map((p) => ({ value: p.id, label: p.status === 'closed' ? `${p.name} (${tr('zamknięty')})` : p.name })),
  ];
}

export const projectById = (projects, id) => (id ? (projects || []).find((p) => String(p.id) === String(id)) || null : null);

const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const nameTaken = (list, name, exceptId) =>
  (list || []).some((x) => sameName(x.name, name) && String(x.id) !== String(exceptId ?? ''));

// Tagi z nazwą `from` → `to` (bez duplikatów, zachowana kolejność).
export function renameInTags(tags, from, to) {
  const out = [];
  (Array.isArray(tags) ? tags : []).forEach((t) => {
    const v = t === from ? to : t;
    if (v && !out.includes(v)) out.push(v);
  });
  return out;
}
export const removeFromTags = (tags, name) => (Array.isArray(tags) ? tags : []).filter((t) => t !== name);

// ── Przepisywanie nazw w istniejących wierszach ─────────────────────────────
// Każdy krok best-effort: błąd jednej tabeli nie przerywa reszty, ale zwracamy listę porażek.

async function step(failures, label, fn) {
  try {
    const { error } = await fn();
    if (error) failures.push(label);
  } catch { failures.push(label); }
}

/** Zmiana nazwy obszaru (służby własnej) w budżecie, wydatkach, planach cyklicznych i propozycjach. */
export async function renameAreaEverywhere(supabase, from, to) {
  const failures = [];
  await step(failures, 'budget_items', () => supabase.from('budget_items')
    .update({ category: to, team_type: to }).eq('category', from).or('kind.is.null,kind.eq.expense'));
  await step(failures, 'expense_transactions', () => supabase.from('expense_transactions')
    .update({ category: to, team_type: to }).eq('category', from));
  await step(failures, 'finance_recurring', () => supabase.from('finance_recurring')
    .update({ category: to, team_type: to }).eq('category', from).eq('kind', 'expense'));
  await step(failures, 'budget_proposals', () => supabase.from('budget_proposals')
    .update({ category: to, team_type: to }).eq('team_type', from));
  return failures;
}

/** Zmiana nazwy kategorii (wydatków albo wpływów). */
export async function renameCategoryEverywhere(supabase, kind, from, to) {
  const failures = [];
  if (kind === 'income') {
    await step(failures, 'income_transactions', () => supabase.from('income_transactions').update({ type: to }).eq('type', from));
    await step(failures, 'budget_items', () => supabase.from('budget_items').update({ category: to, team_type: to }).eq('category', from).eq('kind', 'income'));
    await step(failures, 'finance_recurring', () => supabase.from('finance_recurring').update({ category: to }).eq('category', from).eq('kind', 'income'));
  } else {
    await step(failures, 'expense_transactions', () => supabase.from('expense_transactions').update({ cost_category: to }).eq('cost_category', from));
    await step(failures, 'budget_items', () => supabase.from('budget_items').update({ cost_category: to }).eq('cost_category', from));
    await step(failures, 'finance_recurring', () => supabase.from('finance_recurring').update({ cost_category: to }).eq('cost_category', from));
  }
  return failures;
}

const TAGGED_TABLES = ['income_transactions', 'expense_transactions', 'budget_items', 'finance_recurring'];

/** Zmiana nazwy (to) albo usunięcie (to = null) tagu we wszystkich wierszach, które go mają. */
export async function retagEverywhere(supabase, from, to) {
  const failures = [];
  for (const table of TAGGED_TABLES) {
    try {
      const { data, error } = await supabase.from(table).select('id, tags').contains('tags', [from]);
      if (error) { failures.push(table); continue; }
      for (const row of data || []) {
        const tags = to ? renameInTags(row.tags, from, to) : removeFromTags(row.tags, from);
        await step(failures, table, () => supabase.from(table).update({ tags }).eq('id', row.id));
      }
    } catch { failures.push(table); }
  }
  return [...new Set(failures)];
}

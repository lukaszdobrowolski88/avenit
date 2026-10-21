// Finanse „w zakresie służby” + ślad zmian budżetu (audyt uprawnień 2026-10-11).
//
// Pełne Finanse (module:finance) mają rada/skarbnik/admin. Lider służby — osoba z zakładką
// Finanse swojej służby (tab:<moduł>:finances: przynależność do służby jako leader albo
// nadpisanie konta) — widzi TYLKO budżet i wydatki swojej służby i zgłasza wydatki (wnioski)
// dla niej. Serwer zawęża wiersze po team_type; UI tego nie zastępuje.
import { ApiError } from './querybuilder.js';
import { MODULES } from '@avenit/shared/src/permissions/catalog.js';

// team_type, pod którym zakładka Finanse zespołu zapisuje i czyta dane — stałe etykiety,
// często inne niż nazwa w menu. Moduły własne (FinanceWidget) zapisują klucz albo nazwę modułu.
export const FINANCE_TEAM_TYPES = {
  worship: 'Grupa Uwielbienia',
  media: 'MediaTeam',
  atmosfera: 'AtmosferaTeam',
  kids: 'małe Avenit',
  homegroups: 'Grupy domowe',
  mlodziezowka: 'Mlodziezowka',
  tlumaczenia: 'Tłumaczenia',
};
const BUILTIN_MODULE_KEYS = new Set(MODULES.map((m) => m.key));

// Operacje dostępne w zakresie służby (tyle robią zakładki Finanse zespołów: web i mobilka).
export const TEAM_FINANCE_OPS = {
  budget_items: new Set(['select']),
  expense_transactions: new Set(['select', 'insert']),
};

/**
 * team_type służb, których finanse osoba widzi bez pełnego modułu Finanse:
 * wbudowane — tab:<klucz>:finances; własne (bez component_name, spoza katalogu) —
 * module:<klucz> + tab:<klucz>:finances (klucz i nazwa, bo FinanceWidget zapisuje którekolwiek).
 */
export async function financeTeamTypes(db, resolver) {
  const out = new Set();
  if (!resolver) return [];
  for (const [key, label] of Object.entries(FINANCE_TEAM_TYPES)) {
    if (resolver.can(`tab:${key}:finances`)) out.add(label);
  }
  try {
    const { rows } = await db.query('SELECT key, label, component_name FROM app_modules');
    for (const m of rows) {
      if (!m.key || m.component_name || BUILTIN_MODULE_KEYS.has(m.key)) continue;
      if (!resolver.can(`module:${m.key}`) || !resolver.can(`tab:${m.key}:finances`)) continue;
      out.add(m.key);
      if (m.label) out.add(m.label);
    }
  } catch { /* brak tabeli — tylko zespoły wbudowane */ }
  return [...out];
}

const rowsOf = (q) => (Array.isArray(q.values) ? q.values : [q.values]).filter(Boolean);

/**
 * Zawęża zapytanie do finansów służb `teamTypes` (osoba bez module:finance).
 * Odczyt: team_type = ANY; zapis: tylko wniosek o wydatek dla własnej służby.
 * Rzuca 403, gdy operacja wykracza poza zakres. Mutuje q.
 */
export function applyTeamFinanceScope(q, teamTypes) {
  const ops = TEAM_FINANCE_OPS[q.table];
  if (!ops || !ops.has(q.op) || !teamTypes.length) {
    throw new ApiError(403, 'Brak dostępu do finansów');
  }
  const teams = teamTypes.map(String);
  const clause = (alias, push) => `${alias}."team_type" = ANY($${push(teams)}::text[])`;
  q.__ownerScope = { select: clause, update: clause, delete: clause, upsertGuard: clause };
  if (q.op === 'insert') {
    for (const r of rowsOf(q)) {
      if (!teams.includes(String(r.team_type ?? ''))) {
        throw new ApiError(403, 'Wydatek można zgłosić tylko dla swojej służby');
      }
      // Służba wydatku = służba zgłaszającego (kategorii innej służby nie da się podać).
      if (r.category == null || !teams.includes(String(r.category))) r.category = r.team_type;
      // Pola decyzji/powiązań z pełnymi Finansami nie są dla wnioskującego.
      delete r.project_id;
      delete r.approved_by;
      delete r.approved_at;
      delete r.paid_date;
    }
  }
  return q;
}

// ── Ślad zmian budżetu (budget_audit) — pisany przez serwer, nie przez przeglądarkę ──────

const BUDGET_WRITE_OPS = new Set(['insert', 'update', 'upsert', 'delete']);
export const isBudgetWrite = (q) => q.table === 'budget_items' && BUDGET_WRITE_OPS.has(q.op);

/** Wiersze przed zmianą (update/delete/upsert) — do pola `before` w audycie. */
export async function budgetRowsBefore(db, q, buildQuery) {
  if (!isBudgetWrite(q) || q.op === 'insert') return [];
  try {
    if (q.op === 'upsert') {
      const ids = rowsOf(q).map((r) => r.id).filter(Boolean).map(String);
      if (!ids.length) return [];
      const { rows } = await db.query('SELECT * FROM budget_items WHERE id::text = ANY($1::text[])', [ids]);
      return rows;
    }
    const built = buildQuery({ ...q, op: 'select', select: '*', values: undefined, returning: undefined, single: undefined, head: false, count: undefined });
    const { rows } = await db.query(built.sql, built.params);
    return rows.map((r) => (r && typeof r === 'object' && '__row' in r ? r.__row : r));
  } catch {
    return [];
  }
}

const AUDIT_FIELDS = ['id', 'year', 'kind', 'category', 'team_type', 'description', 'planned_amount', 'period_type', 'cost_category', 'project_id', 'tags', 'campus_id'];
const pick = (r) => (r ? Object.fromEntries(AUDIT_FIELDS.filter((k) => k in r).map((k) => [k, r[k]])) : null);

/** Zapisuje audyt po udanym zapisie budget_items. Nie rzuca (audyt nie może wywrócić zapisu). */
export async function writeBudgetAudit(db, q, before, after, actor) {
  if (!isBudgetWrite(q)) return;
  const byId = new Map((before || []).map((r) => [String(r.id), r]));
  const entries = [];
  if (q.op === 'delete') {
    for (const b of before || []) entries.push({ action: 'deleted', before: b, after: null, row: b });
  } else {
    for (const a of after || []) {
      if (!a) continue;
      const b = byId.get(String(a.id)) || null;
      entries.push({ action: b ? 'updated' : 'created', before: b, after: a, row: a });
    }
  }
  for (const e of entries) {
    try {
      await db.query(
        `INSERT INTO budget_audit (year, item_id, action, category, description, before, after, actor)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
        [e.row.year ?? null, e.row.id ?? null, e.action, e.row.category ?? null, e.row.description ?? null,
          e.before ? JSON.stringify(pick(e.before)) : null, e.after ? JSON.stringify(pick(e.after)) : null, actor || null],
      );
    } catch { /* brak tabeli audytu — pomiń */ }
  }
}

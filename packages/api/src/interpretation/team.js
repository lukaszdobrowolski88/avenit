// Tłumaczenie na żywo ↔ moduł służby „Tłumaczenia” (migracja 117) — jedno źródło prawdy dla
// karty wydarzenia (web + mobilka), walidacji zapisu (service.js replaceChannels) i konsoli.
//
//  • Języki kanałów = AKTYWNE Służby modułu (team_roles team_type 'tlumaczenia', is_active,
//    kolejność display_order — jak kolumny Grafiku), kod języka z klucza pola (I.langForRole).
//    Personel widzi nazwę Służby („Tłumacz EN”), słuchacz — nazwę języka w tym języku
//    (I.channelLabel: „English”, „Українська”).
//  • Tłumacz (ręcznie w karcie) = AKTYWNY członek składu (custom_tlumaczenia_members, status ≠
//    „Nieaktywny”) z aktywnym kontem w aplikacji. Ta sama reguła co wybór osoby w Grafiku
//    (ScheduleTab getMembersForRole): jeśli ktokolwiek w zespole ma Służbę tego języka
//    (team_member_roles), to tylko osoby z tą Służbą; jeśli nikt jej nie ma — cały aktywny zespół.
//  • Konto osoby ze składu: user_id (026/117) → ten sam e-mail → kartoteka → jedyne konto o tym
//    imieniu (lib/assigneeIdentity — jak tłumacze z grafiku).
//  • Nieobecności w dniu wydarzenia: zgłoszone (volunteer_blockouts, fn team-availability) i
//    wpisane w kolumnie „Nieobecni” grafiku (events.assignments.tlumaczenia.absencja).
// Brak tabel modułu (tenant przed 117) → available: false (karta: pusty stan z linkiem do modułu).
import { accountEmailsForAssignee } from '../lib/assigneeIdentity.js';
import { activeAccounts } from '../meetings/service.js';
import { teamBlockouts } from '../fn/team-availability.js';
import * as I from './logic.js';

export const TEAM_TYPE = 'tlumaczenia';
export const MEMBER_TABLE = 'custom_tlumaczenia_members';
export const MODULE_PATH = '/tlumaczenia';
const lower = (v) => String(v ?? '').trim().toLowerCase();
const missing = (err) => err?.code === '42P01' || err?.code === '42703';
export const isInactiveStatus = (m) => m?.status === 'Nieaktywny' || m?.is_active === false;

// ── Języki modułu ───────────────────────────────────────────────────────────
// → { available, languages: [{ role_id, role_name, lang_code, label }], unmapped: [nazwa Służby] }
export async function moduleLanguages(db) {
  let rows;
  try {
    ({ rows } = await db.query(
      `SELECT id, name, field_key, display_order FROM team_roles
        WHERE team_type = $1 AND COALESCE(is_active, true) = true
        ORDER BY display_order NULLS LAST, name`, [TEAM_TYPE]));
  } catch (err) {
    if (missing(err)) return { available: false, languages: [], unmapped: [] };
    throw err;
  }
  return languagesFromRoles(rows);
}

// Czyste: wiersze team_roles → języki (pierwsza Służba danego kodu wygrywa) + Służby bez kodu.
export function languagesFromRoles(rows) {
  const languages = [];
  const unmapped = [];
  for (const r of rows || []) {
    const code = I.langForRole(r.field_key, r.name);
    if (!code) { unmapped.push(String(r.name || r.field_key || '')); continue; }
    if (languages.some((l) => l.lang_code === code)) continue;
    languages.push({ role_id: String(r.id), role_name: String(r.name || '').trim() || `Tłumacz ${code.toUpperCase()}`, lang_code: code, label: I.channelLabel(code, r.name) });
  }
  return { available: true, languages, unmapped };
}

// ── Skład zespołu ───────────────────────────────────────────────────────────
// → { available, members: [{ id, name, email: e-mail konta | null, roster_email, active, langs: [kod] }],
//     holders: Map(kod → liczba osób ze Służbą tego języka, także nieaktywnych — jak Grafik) }
export async function teamRoster(db, languages = []) {
  let rows;
  try {
    ({ rows } = await db.query(`SELECT id, full_name, email, status, user_id FROM ${MEMBER_TABLE} ORDER BY full_name`));
  } catch (err) {
    if (err?.code === '42703') {
      try { ({ rows } = await db.query(`SELECT id, full_name, email, status FROM ${MEMBER_TABLE} ORDER BY full_name`)); } catch (e2) {
        if (missing(e2)) return { available: false, members: [], holders: new Map() };
        throw e2;
      }
    } else if (missing(err)) return { available: false, members: [], holders: new Map() };
    else throw err;
  }
  // Służby osób (team_member_roles: member_id tekstem, role_id = team_roles.id).
  const roleLang = new Map(languages.map((l) => [String(l.role_id), l.lang_code]));
  const langsOf = new Map();
  try {
    const { rows: mr } = await db.query(`SELECT member_id, role_id FROM team_member_roles WHERE member_table = $1`, [MEMBER_TABLE]);
    for (const r of mr) {
      const code = roleLang.get(String(r.role_id));
      if (!code) continue;
      const k = String(r.member_id);
      if (!langsOf.has(k)) langsOf.set(k, new Set());
      langsOf.get(k).add(code);
    }
  } catch (err) {
    if (!missing(err)) throw err;
  }
  // Konta: najpierw user_id (jednym zapytaniem), potem reguły tożsamości z grafiku.
  const byUserId = new Map();
  const ids = rows.map((r) => r.user_id).filter((v) => v !== null && v !== undefined).map(String);
  if (ids.length) {
    const { rows: us } = await db.query(
      `SELECT id::text AS id, lower(email) AS e FROM app_users
        WHERE id::text = ANY($1::text[]) AND COALESCE(is_active, true) = true AND email IS NOT NULL AND email <> ''`, [ids]);
    for (const u of us) byUserId.set(u.id, u.e);
  }
  const members = [];
  for (const r of rows) {
    let email = r.user_id != null ? byUserId.get(String(r.user_id)) || null : null;
    if (!email) {
      const candidates = await accountEmailsForAssignee(db, { email: r.email, name: r.full_name, teamType: TEAM_TYPE });
      const active = await activeAccounts(db, candidates);
      email = candidates.map(lower).find((e) => active.has(e)) || null;
    }
    members.push({
      id: String(r.id),
      name: String(r.full_name || '').trim(),
      email,
      roster_email: lower(r.email) || null,
      user_id: r.user_id != null ? String(r.user_id) : null,
      active: !isInactiveStatus(r),
      langs: [...(langsOf.get(String(r.id)) || [])],
    });
  }
  const holders = new Map();
  for (const m of members) for (const code of m.langs) holders.set(code, (holders.get(code) || 0) + 1);
  return { available: true, members, holders };
}

// ── Konta osób ze składu (Tłumaczenia → Członkowie) ─────────────────────────
// Ta sama reguła tożsamości co wybór tłumacza (teamRoster): 'active' — jest aktywne konto
// (może tłumaczyć), 'inactive' — konto jest, ale wyłączone (is_active = false: zablokowane,
// czeka na zatwierdzenie), 'none' — brak konta w aplikacji.
export const accountState = ({ activeEmail, anyAccount }) => (activeEmail ? 'active' : anyAccount ? 'inactive' : 'none');

// → { available, members: [{ id, account }] } (bez e-maili kont — lista tylko oznacza osoby).
export async function rosterAccounts(db) {
  const team = await teamRoster(db, []);
  if (!team.available) return { available: false, members: [] };
  const members = [];
  for (const m of team.members) {
    let anyAccount = false;
    if (!m.email) {
      const candidates = (await accountEmailsForAssignee(db, { email: m.roster_email, name: m.name, teamType: TEAM_TYPE })).map(lower).filter(Boolean);
      if (candidates.length || m.user_id) {
        const { rows } = await db.query(
          `SELECT 1 FROM app_users WHERE (lower(email) = ANY($1::text[]) OR ($2::text IS NOT NULL AND id::text = $2::text)) LIMIT 1`,
          [candidates, m.user_id]);
        anyAccount = rows.length > 0;
      }
    }
    members.push({ id: m.id, account: accountState({ activeEmail: m.email, anyAccount }) });
  }
  return { available: true, members };
}

// ── Reguły (czyste, testowane) ──────────────────────────────────────────────
// Osoby, z których wybieramy tłumacza języka `code` — jak Grafik: ze Służbą, a gdy nikt jej nie
// ma — cały aktywny zespół. Bez konta też (karta pokazuje je wyszarzone), nieaktywni — nie.
export function candidatesFor(team, code) {
  const active = (team?.members || []).filter((m) => m.active);
  if (!(team?.holders?.get(code) > 0)) return active;
  return active.filter((m) => m.langs.includes(code));
}

// Czy konto (e-mail) może zostać NOWYM tłumaczem kanału `code`. → null (tak) albo { code, message }.
export function eligibilityError(team, email, code, roleName = '') {
  const e = lower(email);
  const mine = (team?.members || []).filter((m) => m.email === e);
  if (!mine.length) {
    return { code: 'NOT_IN_TEAM', message: `Tłumaczem może być tylko członek zespołu Tłumaczeń z kontem w aplikacji (Tłumaczenia → Członkowie): ${e}` };
  }
  if (!mine.some((m) => m.active)) {
    return { code: 'INACTIVE_MEMBER', message: `Ta osoba ma status „Nieaktywny” w zespole Tłumaczeń: ${e}` };
  }
  if (!candidatesFor(team, code).some((m) => m.email === e)) {
    return { code: 'NO_LANGUAGE_ROLE', message: `Ta osoba nie ma Służby „${roleName || code.toUpperCase()}” w module Tłumaczenia (Tłumaczenia → Członkowie albo Służby): ${e}` };
  }
  return null;
}

// Ostrzeżenie przy przypisanym tłumaczu (stan zespołu zmienił się po przypisaniu albo przypisanie
// sprzed modułu): 'not_in_team' | 'inactive' | 'no_role' | null. Tłumacz z ostrzeżeniem ZOSTAJE
// (nie zdejmujemy po cichu nikogo, kto może właśnie tłumaczyć) — zarządzający może go usunąć.
export function interpreterWarning(team, email, code) {
  if (!team?.available) return null;
  const e = lower(email);
  const mine = (team.members || []).filter((m) => m.email === e);
  if (!mine.length) return 'not_in_team';
  if (!mine.some((m) => m.active)) return 'inactive';
  if (!candidatesFor(team, code).some((m) => m.email === e)) return 'no_role';
  return null;
}

// ── Nieobecności w dniu wydarzenia ──────────────────────────────────────────
const csvNames = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
// → Map(imię z listy zespołu, małymi → { from, to } (zgłoszona) | { manual: true } (kolumna Grafiku))
export async function absencesOn(db, ev) {
  const out = new Map();
  const day = String(ev?.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return out;
  let assignments = ev?.assignments;
  if (assignments === undefined && ev?.id != null) {
    try {
      assignments = (await db.query(`SELECT assignments FROM events WHERE id::text = $1`, [String(ev.id)])).rows[0]?.assignments ?? null;
    } catch { assignments = null; } // tenant bez events.assignments
  }
  if (typeof assignments === 'string') { try { assignments = JSON.parse(assignments); } catch { assignments = null; } }
  for (const n of csvNames(assignments?.[TEAM_TYPE]?.absencja)) out.set(n.toLowerCase(), { manual: true });
  try {
    for (const b of await teamBlockouts(db, MEMBER_TABLE, day, day)) {
      const k = String(b.name || '').trim().toLowerCase();
      if (k && !out.has(k)) out.set(k, { from: b.start_date, to: b.end_date });
    }
  } catch { /* brak volunteer_blockouts / kolumn — bez zgłoszonych nieobecności */ }
  return out;
}

// Wszystko naraz (karta i zapis). ev — wiersz wydarzenia (do nieobecności; null = bez nich).
export async function loadModule(db, ev = null) {
  const langs = await moduleLanguages(db);
  const team = await teamRoster(db, langs.languages);
  const absences = ev ? await absencesOn(db, ev) : new Map();
  return { ...langs, team, absences };
}

// Komunikator+ (K8): kanały służb i grup domowych z AUTOMATYCZNYM składem (zamiast synchronizacji
// z przeglądarki, która działała tylko u osób z otwartym Komunikatorem i nigdy nikogo nie usuwała).
//
// Worker co 10 min (runForTenant) + POST /api/fn/chat-channels-sync (tylko admin aplikacji).
// Dla każdej służby (zespoły wbudowane jak dotąd + moduły z kreatora: custom_<key>_members)
// i KAŻDEJ grupy domowej zapewnia rozmowę type='ministry':
//   • ministry_key = klucz kanału służby (wbudowane — dotychczasowe klucze, żeby kanały zachowały
//     historię) / klucz modułu własnego / 'home_group:<id>' / 'home_groups' (liderzy grup),
//   • nazwa = etykieta modułu z app_modules / nazwa grupy (bez nazw na sztywno),
//   • skład = osoby z kontem (dopasowanie lower(email) do aktywnych app_users); lider zespołu/grupy
//     = rola 'admin', pozostali 'member'. Nowi są dopisywani, nieobecni w składzie — usuwani.
// Usunięty moduł/grupa → kanał archiwalny (posting_policy='admins'), historia zostaje.
// Moduł wyłączony (is_enabled=false) — kanał bez zmian. Błąd odczytu źródła = kanał pominięty
// (nigdy nie czyścimy składu na podstawie nieudanego zapytania).
import { isAppAdmin } from '../dataapi/komunikatorPlus.js';

export const name = 'chat-channels-sync';
export const rateLimit = { max: 6, timeWindow: '1 minute' };

const lower = (v) => String(v ?? '').trim().toLowerCase();
const TABLE_RE = /^[a-z][a-z0-9_]*$/;

// Zespoły wbudowane — klucze kanałów jak w dotychczasowych kanałach (conversations.ministry_key).
export const BUILTIN_TEAMS = [
  { channelKey: 'worship_team', moduleKey: 'worship', table: 'worship_team' },
  { channelKey: 'media_team', moduleKey: 'media', table: 'media_team' },
  { channelKey: 'atmosfera_team', moduleKey: 'atmosfera', table: 'atmosfera_members' },
  { channelKey: 'kids_ministry', moduleKey: 'kids', table: 'kids_teachers' },
];
export const HG_LEADERS_KEY = 'home_groups'; // kanał liderów grup domowych (moduł homegroups)
export const HG_PREFIX = 'home_group:';
const RESERVED_CUSTOM = new Set([...BUILTIN_TEAMS.flatMap((t) => [t.channelKey, t.moduleKey]), HG_LEADERS_KEY, 'homegroups']);

// ── Czysta logika (testowana) ───────────────────────────────────────────────
const LEADER_RE = /(^|[\s_-])(lider|leader|koordynator|coordinator)/i;
export const isLeaderRow = (r) => r?.is_leader === true || LEADER_RE.test(String(r?.role ?? ''));
export const isInactiveRow = (r) => r?.is_active === false
  || /^(inactive|nieaktywn|archived|zarchiwizowan|left|removed|usuni)/i.test(String(r?.status ?? '').trim());

// entries: [{ email, leader }] → Map(lowerEmail → { email, role, name }) tylko dla osób z kontem.
// Lider wygrywa przy powtórzeniach. accounts: Map(lowerEmail → { email, name }).
export function buildRoster(entries, accounts) {
  const out = new Map();
  for (const e of entries || []) {
    const key = lower(e?.email);
    if (!key) continue;
    const acc = accounts.get(key);
    if (!acc) continue;
    const role = e.leader ? 'admin' : 'member';
    const prev = out.get(key);
    if (!prev || (role === 'admin' && prev.role !== 'admin')) out.set(key, { email: acc.email, role, name: acc.name || null });
  }
  return out;
}

// Różnica składu: kogo dopisać, kogo usunąć, komu zmienić rolę. current: [{ user_email, role }].
export function diffRoster(current, desired) {
  const cur = new Map();
  for (const p of current || []) {
    const key = lower(p?.user_email);
    if (key && !cur.has(key)) cur.set(key, { role: p.role || 'member' });
  }
  const add = [];
  const setRole = [];
  for (const [key, d] of desired) {
    const c = cur.get(key);
    if (!c) add.push({ email: d.email, role: d.role, name: d.name ?? null });
    else if (c.role !== d.role) setRole.push({ email: key, role: d.role });
  }
  const remove = [...cur.keys()].filter((k) => !desired.has(k));
  return { add, remove, setRole };
}

// Wpisy kanału grupy domowej (members/leaders z kilku źródeł). ids porównywane jako tekst.
export function homeGroupEntries(group, { hgm = [], hgl = [], members = [] }) {
  const gid = String(group.id);
  const out = [];
  for (const r of hgm) if (String(r.group_id) === gid) out.push({ email: r.email, leader: r.is_leader === true || ['leader', 'coordinator'].includes(r.role) });
  for (const r of members) if (String(r.home_group_id) === gid) out.push({ email: r.email, leader: false });
  for (const r of hgl) {
    const own = String(r.group_id ?? '') === gid || (group.leader_id != null && String(r.id) === String(group.leader_id));
    if (!own) continue;
    if (r.email) out.push({ email: r.email, leader: true });
    if (r.user_email && lower(r.user_email) !== lower(r.email)) out.push({ email: r.user_email, leader: true });
  }
  return out;
}

// Kanał liderów grup: katalog liderów + liderzy z ról w grupach; koordynatorzy = administratorzy.
export function hgLeaderEntries({ hgm = [], hgl = [] }) {
  const out = [];
  for (const r of hgl) {
    const coord = r.role === 'coordinator';
    if (r.email) out.push({ email: r.email, leader: coord });
    if (r.user_email && lower(r.user_email) !== lower(r.email)) out.push({ email: r.user_email, leader: coord });
  }
  for (const r of hgm) {
    if (r.is_leader === true || r.role === 'leader') out.push({ email: r.email, leader: false });
    else if (r.role === 'coordinator') out.push({ email: r.email, leader: true });
  }
  return out;
}

// Klucz modułu z nazwy tabeli custom_<key>_members.
export function customKeyFromTable(table) {
  const m = String(table || '').match(/^custom_([a-z0-9_]+)_members$/);
  return m && !RESERVED_CUSTOM.has(m[1]) ? m[1] : null;
}

// ── Odczyt źródeł ───────────────────────────────────────────────────────────
async function safeRows(db, sql, params = []) {
  try { return (await db.query(sql, params)).rows; } catch { return null; }
}

async function loadAccounts(db) {
  let rows = await safeRows(db,
    `SELECT id, email, full_name, name FROM app_users
      WHERE email IS NOT NULL AND is_active IS NOT FALSE AND COALESCE(status, 'active') = 'active'`);
  if (!rows) rows = await safeRows(db, `SELECT id, email, full_name, name FROM app_users WHERE email IS NOT NULL AND is_active IS NOT FALSE`);
  if (!rows) throw new Error('Nie udało się odczytać kont użytkowników');
  const accounts = new Map();
  const byId = new Map();
  for (const r of rows) {
    const key = lower(r.email);
    if (!key) continue;
    const name = String(r.full_name || r.name || '').trim() || key.split('@')[0];
    accounts.set(key, { email: r.email, name });
    byId.set(String(r.id), r.email);
  }
  return { accounts, userIdToEmail: byId };
}

async function tableColumns(db, table) {
  const rows = await safeRows(db,
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table]);
  return new Set((rows || []).map((r) => r.column_name));
}

// Wpisy z tabeli zespołu (email / user_id / member_id + lider/aktywność, jeśli kolumny są).
async function loadTeamEntries(db, table, maps) {
  if (!TABLE_RE.test(table)) return null;
  const cols = await tableColumns(db, table);
  const pick = ['email', 'user_id', 'member_id', 'is_leader', 'role', 'is_active', 'status'].filter((c) => cols.has(c));
  if (!pick.some((c) => ['email', 'user_id', 'member_id'].includes(c))) return null;
  const rows = await safeRows(db, `SELECT ${pick.map((c) => `"${c}"`).join(', ')} FROM "${table}"`);
  if (!rows) return null;
  return rows.filter((r) => !isInactiveRow(r)).map((r) => ({
    email: r.email || maps.userIdToEmail.get(String(r.user_id)) || maps.memberIdToEmail.get(String(r.member_id)) || null,
    leader: isLeaderRow(r),
  })).filter((e) => e.email);
}

const membershipEntries = (memberships, moduleKey, maps) => (memberships || [])
  .filter((m) => m.ministry_key === moduleKey)
  .map((m) => ({ email: maps.userIdToEmail.get(String(m.user_id)) || null, leader: m.role === 'leader' }))
  .filter((e) => e.email);

// ── Zapis ───────────────────────────────────────────────────────────────────
async function addParticipants(db, convId, list) {
  if (!list.length) return;
  const emails = list.map((a) => a.email);
  const names = list.map((a) => a.name || null);
  const roles = list.map((a) => a.role);
  try {
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_email, user_name, role, joined_at)
       SELECT $1, t.e, t.n, t.r, now() FROM unnest($2::text[], $3::text[], $4::text[]) AS t(e, n, r)
       ON CONFLICT (conversation_id, user_email) DO NOTHING`, [convId, emails, names, roles]);
  } catch {
    await db.query(
      `INSERT INTO conversation_participants (conversation_id, user_email, role)
       SELECT $1, t.e, t.r FROM unnest($2::text[], $3::text[]) AS t(e, r)
       ON CONFLICT (conversation_id, user_email) DO NOTHING`, [convId, emails, roles]);
  }
}

async function applyDiff(db, convId, diff) {
  await addParticipants(db, convId, diff.add);
  if (diff.remove.length) {
    await db.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND lower(user_email) = ANY($2::text[])`, [convId, diff.remove]);
  }
  for (const role of ['admin', 'member']) {
    const emails = diff.setRole.filter((s) => s.role === role).map((s) => s.email);
    if (emails.length) {
      await db.query(`UPDATE conversation_participants SET role = $3 WHERE conversation_id = $1 AND lower(user_email) = ANY($2::text[])`, [convId, emails, role]);
    }
  }
}

// ── Synchronizacja ──────────────────────────────────────────────────────────
export async function syncChannels(db) {
  const summary = { channels: 0, created: 0, renamed: 0, added: 0, removed: 0, roles: 0, archived: 0, skipped: [] };
  const { accounts, userIdToEmail } = await loadAccounts(db);
  const memberIdToEmail = new Map();
  for (const r of (await safeRows(db, `SELECT id, email FROM members WHERE email IS NOT NULL`)) || []) memberIdToEmail.set(String(r.id), r.email);
  const maps = { userIdToEmail, memberIdToEmail };

  const modules = await safeRows(db, `SELECT key, label, is_enabled FROM app_modules`);
  const moduleByKey = new Map((modules || []).map((m) => [m.key, m]));
  const memberships = (await safeRows(db, `SELECT ministry_key, role, user_id FROM ministry_memberships`)) || [];

  const chans = await safeRows(db,
    `SELECT id, ministry_key, name, posting_policy FROM conversations
      WHERE type = 'ministry' AND ministry_key IS NOT NULL ORDER BY created_at ASC NULLS LAST`);
  if (!chans) throw new Error('Nie udało się odczytać kanałów');
  const byKey = new Map();
  for (const c of chans) if (!byKey.has(c.ministry_key)) byKey.set(c.ministry_key, c);

  const sources = []; // { key, name, entries|null }
  const known = new Set(); // klucze istniejących źródeł (także wyłączonych) — nie archiwizować
  const label = (mod, key) => String(mod?.label || '').trim() || byKey.get(key)?.name || key;

  // Wspólne dane grup domowych.
  const hgm = (await safeRows(db, `SELECT group_id, email, role, is_leader FROM home_group_members WHERE email IS NOT NULL`))
    ?? (await safeRows(db, `SELECT group_id, email, is_leader FROM home_group_members WHERE email IS NOT NULL`));
  const hgl = (await safeRows(db, `SELECT id, group_id, email, user_email, role FROM home_group_leaders`))
    ?? (await safeRows(db, `SELECT id, group_id, email FROM home_group_leaders`)) ?? [];
  const hgMembers = (await safeRows(db, `SELECT home_group_id, email FROM members WHERE home_group_id IS NOT NULL AND email IS NOT NULL`)) || [];

  if (modules) {
    for (const t of BUILTIN_TEAMS) {
      const mod = moduleByKey.get(t.moduleKey);
      if (!mod) continue; // moduł usunięty → kanał zarchiwizowany niżej
      known.add(t.channelKey);
      if (mod.is_enabled === false) continue;
      const entries = await loadTeamEntries(db, t.table, maps);
      sources.push({ key: t.channelKey, name: label(mod, t.channelKey), entries: entries && [...entries, ...membershipEntries(memberships, t.moduleKey, maps)] });
    }
    const hgMod = moduleByKey.get('homegroups');
    if (hgMod) {
      known.add(HG_LEADERS_KEY);
      if (hgMod.is_enabled !== false) {
        const name = byKey.get(HG_LEADERS_KEY)?.name || `${String(hgMod.label || '').trim() || 'Grupy domowe'} — liderzy`;
        sources.push({ key: HG_LEADERS_KEY, name, entries: hgm ? hgLeaderEntries({ hgm, hgl }) : null });
      }
    }
    const custom = (await safeRows(db,
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'custom\\_%\\_members'`)) || [];
    for (const { table_name: table } of custom) {
      const key = customKeyFromTable(table);
      const mod = key ? moduleByKey.get(key) : null;
      if (!mod) continue;
      known.add(key);
      if (mod.is_enabled === false) continue;
      const entries = await loadTeamEntries(db, table, maps);
      sources.push({ key, name: label(mod, key), entries: entries && [...entries, ...membershipEntries(memberships, key, maps)] });
    }
  }

  const groups = await safeRows(db, `SELECT id, name, leader_id FROM home_groups`)
    ?? (await safeRows(db, `SELECT id, name FROM home_groups`));
  if (groups) {
    for (const g of groups) {
      const key = `${HG_PREFIX}${g.id}`;
      known.add(key);
      const name = String(g.name || '').trim() || byKey.get(key)?.name || 'Grupa domowa';
      sources.push({ key, name, entries: hgm ? homeGroupEntries(g, { hgm, hgl, members: hgMembers }) : null });
    }
  }

  for (const s of sources) {
    if (!s.entries) { summary.skipped.push(s.key); continue; }
    const desired = buildRoster(s.entries, accounts);
    let ch = byKey.get(s.key);
    if (!ch) {
      // Pusty zespół/grupa bez kanału — nie zakładamy pustej rozmowy.
      if (!desired.size) continue;
      const { rows } = await db.query(
        `INSERT INTO conversations (type, name, ministry_key, posting_policy, created_by)
         VALUES ('ministry', $1, $2, 'everyone', 'system') RETURNING id, ministry_key, name, posting_policy`,
        [s.name, s.key]);
      ch = rows[0];
      byKey.set(s.key, ch);
      summary.created++;
    } else if (s.name && ch.name !== s.name) {
      await db.query(`UPDATE conversations SET name = $2, updated_at = now() WHERE id = $1`, [ch.id, s.name]);
      summary.renamed++;
    }
    summary.channels++;
    const current = (await db.query(`SELECT user_email, role FROM conversation_participants WHERE conversation_id = $1`, [ch.id])).rows;
    const diff = diffRoster(current, desired);
    await applyDiff(db, ch.id, diff);
    summary.added += diff.add.length;
    summary.removed += diff.remove.length;
    summary.roles += diff.setRole.length;
  }

  // Źródło zniknęło (usunięty moduł / grupa) → kanał tylko do odczytu, historia zostaje.
  for (const [key, ch] of byKey) {
    if (known.has(key)) continue;
    const decidable = key.startsWith(HG_PREFIX) ? !!groups : !!modules;
    if (!decidable || ch.posting_policy === 'admins') continue;
    await db.query(`UPDATE conversations SET posting_policy = 'admins', updated_at = now() WHERE id = $1`, [ch.id]);
    summary.archived++;
  }
  return summary;
}

const LOCK_SQL = `hashtext('avenit:chat-channels-sync')`;

// Worker (co 10 min) i ręczne uruchomienie — jedna synchronizacja naraz (blokada doradcza).
export async function runForTenant(pool, ctx = {}) {
  const log = typeof ctx.log === 'function' ? ctx.log : () => {};
  const client = typeof pool.connect === 'function' ? await pool.connect() : null;
  const db = client || pool;
  let locked = !client;
  try {
    if (client) {
      const { rows } = await client.query(`SELECT pg_try_advisory_lock(${LOCK_SQL}) AS ok`);
      locked = rows[0]?.ok === true;
      if (!locked) return { skipped: true, reason: 'running' };
    }
    const summary = await syncChannels(db);
    if (summary.created || summary.added || summary.removed || summary.roles || summary.archived || summary.renamed) {
      log(`chat-channels-sync: kanały ${summary.channels}, nowe ${summary.created}, dopisani ${summary.added}, usunięci ${summary.removed}, role ${summary.roles}, zarchiwizowane ${summary.archived}`);
    }
    return summary;
  } finally {
    if (client) {
      if (locked) await client.query(`SELECT pg_advisory_unlock(${LOCK_SQL})`).catch(() => undefined);
      client.release();
    }
  }
}

export default async function handler(req, reply) {
  if (!(await isAppAdmin(req.db, req.user?.email))) {
    return reply.code(403).send({ error: 'Synchronizację kanałów uruchamia administrator', code: 'FORBIDDEN' });
  }
  try {
    const summary = await runForTenant(req.db, { log: (msg) => req.log.info(msg) });
    return reply.send(summary);
  } catch (err) {
    req.log.error({ err }, 'chat-channels-sync error');
    return reply.code(500).send({ error: 'Nie udało się zsynchronizować kanałów. Spróbuj ponownie za chwilę.' });
  }
}

import { supabase } from '../../../lib/supabase';

// „Moja służba” na Pulpicie — z grafiku na WYDARZENIACH (od migracji 055):
//   • events.assignments[team][field_key] = CSV imion (tu szukamy mojego imienia),
//   • schedule_assignments (event_id, assigned_email = ja) — status zaproszenia i imię,
//     pod którym lider mnie wpisał (gdy różni się od profilu).
// Stare programy (programs.zespol/produkcja/…) zostają tylko jako historia sprzed zmiany.

const csv = (v) => String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const parse = (v) => {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return null; }
};
const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Kategorie jak w widżecie (ikona + kolor) dla wbudowanych służb.
const TEAM_CATEGORY = { worship: 'Zespół', media: 'Produkcja', atmosfera: 'Atmosfera', kids: 'Szkółka' };

let metaCache = null;
async function loadMeta() {
  if (metaCache && Date.now() - metaCache.at < 5 * 60_000) return metaCache;
  const [roles, modules] = await Promise.all([
    supabase.from('team_roles').select('team_type, field_key, name'),
    supabase.from('app_modules').select('key, label'),
  ]);
  const roleLabel = new Map((roles.data || []).map((r) => [`${r.team_type}|${r.field_key}`, r.name]));
  const teamLabel = new Map((modules.data || []).map((m) => [m.key, m.label]));
  metaCache = { at: Date.now(), roleLabel, teamLabel };
  return metaCache;
}

export async function fetchMyEventService({ email, range, withCampusFilter, limit }) {
  if (!email) return [];
  const today = todayYmd();
  const lower = email.toLowerCase();

  let evQuery = withCampusFilter(
    supabase.from('events').select('id, title, date, time, module_key, assignments')
  );
  evQuery = range === 'upcoming'
    ? evQuery.gte('date', today).order('date', { ascending: true }).limit(80)
    : evQuery.lt('date', today).order('date', { ascending: false }).limit(60);

  const [profileRes, evRes, saRes, meta] = await Promise.all([
    supabase.from('app_users').select('full_name').eq('email', email).maybeSingle(),
    evQuery,
    supabase
      .from('schedule_assignments')
      .select('id, event_id, team_type, role_key, role_label, assigned_name, status')
      .eq('assigned_email', email)
      .not('event_id', 'is', null),
    loadMeta(),
  ]);

  const myNames = new Set();
  if (profileRes.data?.full_name) myNames.add(profileRes.data.full_name.trim().toLowerCase());
  const saByEvent = new Map();
  for (const a of saRes.data || []) {
    if (a.assigned_name) myNames.add(String(a.assigned_name).trim().toLowerCase());
    const k = String(a.event_id);
    saByEvent.set(k, [...(saByEvent.get(k) || []), a]);
  }
  if (!myNames.size) myNames.add(lower);

  const items = [];
  for (const ev of evRes.data || []) {
    const asg = parse(ev.assignments) || {};
    const sa = saByEvent.get(String(ev.id)) || [];
    const roles = new Map(); // team|role -> { category, role, status }
    for (const [team, fields] of Object.entries(asg)) {
      if (!fields || typeof fields !== 'object') continue;
      for (const [roleKey, value] of Object.entries(fields)) {
        if (roleKey === 'notatki' || roleKey === 'absencja') continue;
        if (!csv(value).some((n) => myNames.has(n.toLowerCase()))) continue;
        const status = sa.find((a) => a.team_type === team && a.role_key === roleKey)?.status ?? null;
        roles.set(`${team}|${roleKey}`, {
          category: TEAM_CATEGORY[team] || meta.teamLabel.get(team) || team,
          role: meta.roleLabel.get(`${team}|${roleKey}`) || sa.find((a) => a.role_key === roleKey)?.role_label || roleKey,
          status,
        });
      }
    }
    // Zaproszenia z grafiku, których imię już nie pasuje (np. lider wpisał inaczej) — też moje.
    for (const a of sa) {
      const k = `${a.team_type}|${a.role_key}`;
      if (roles.has(k)) continue;
      roles.set(k, {
        category: TEAM_CATEGORY[a.team_type] || meta.teamLabel.get(a.team_type) || a.team_type,
        role: a.role_label || meta.roleLabel.get(k) || a.role_key,
        status: a.status,
      });
    }
    if (!roles.size) continue;
    const notes = Object.entries(asg)
      .filter(([team]) => [...roles.keys()].some((k) => k.startsWith(`${team}|`)))
      .map(([, f]) => f?.notatki)
      .filter(Boolean)
      .join(' · ');
    items.push({
      id: ev.id,
      kind: 'event',
      date: String(ev.date).slice(0, 10),
      time: ev.time ? String(ev.time).slice(0, 5) : null,
      title: ev.title || 'Wydarzenie',
      roles: [...roles.values()],
      notes,
    });
  }
  return limit ? items.slice(0, limit) : items;
}

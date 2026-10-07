// Grafik nauczania nad WYDARZENIAMI (jak grafiki Uwielbienia/Mediów) — ta sama niedziela we
// wszystkich grafikach. Dane kazania żyją w events.assignments.teaching = { speaker_id, series_id,
// title, scripture, main_point, notes } i są zapisywane atomowo przez fn event-assignments-patch
// (patchEventAssignments), więc nie nadpisują przypisań innych służb.
// Stare dane z programów (programs.teaching) są czytane jako zapas: dla wydarzenia z podpiętym
// programem (events.program_id) i jako historia w seriach — przy pierwszej edycji przenosimy je
// na wydarzenie.

export const TEACHING_KEY = 'teaching';
export const TEACHING_FIELDS = ['speaker_id', 'series_id', 'title', 'scripture', 'main_point', 'notes'];

const csv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const filled = (v) => v != null && String(v).trim() !== '';
const ymd = (d) => String(d || '').slice(0, 10);
export const normName = (s) => String(s || '').trim().toLowerCase();

const asObject = (v) => {
  if (!v) return null;
  if (typeof v === 'string') {
    try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; }
  }
  return typeof v === 'object' && !Array.isArray(v) ? v : null;
};

// Samo dane kazania (bez pustych pól).
export function pickTeaching(obj) {
  const src = asObject(obj) || {};
  const out = {};
  TEACHING_FIELDS.forEach((k) => { if (filled(src[k])) out[k] = src[k]; });
  return out;
}

const SERVICE_TYPE_RE = /nabo[zż]e/i;            // typ: „nabożeństwo”, „nabozesnstwo” (stara literówka)…
const SERVICE_TITLE_RE = /^\W*naboże[nń]stw|^\W*nabozenstw/i; // tytuł zaczyna się od „Nabożeństwo…”

// Czy wydarzenie to nabożeństwo, na którym jest kazanie (wiersz grafiku nauczania).
// Kolejność: ma już dane kazania → jawnie przypisana służba „teaching” (events.team_types albo
// reguła typu event_type_teams) → moduł Nauczanie → podpięty program (plan nabożeństwa) →
// typ/tytuł „Nabożeństwo…”.
export function isTeachingEvent(ev, rules = []) {
  if (!ev) return false;
  const asg = asObject(ev.assignments) || {};
  if (Object.keys(pickTeaching(asg[TEACHING_KEY])).length) return true;
  if (ev.team_types != null && csv(ev.team_types).includes(TEACHING_KEY)) return true;
  const rule = (rules || []).find((r) => (r?.module_key || '') === (ev.module_key || '') && r?.event_type === ev.event_type);
  if (rule && Array.isArray(rule.teams) && rule.teams.includes(TEACHING_KEY)) return true;
  if (ev.module_key === TEACHING_KEY) return true;
  if (ev.program_id != null) return true;
  return SERVICE_TYPE_RE.test(String(ev.event_type || '')) || SERVICE_TITLE_RE.test(String(ev.title || ''));
}

// Wiersze grafiku: wydarzenia-nabożeństwa z danymi kazania (z wydarzenia, a w braku — z podpiętego programu).
export function buildTeachingRows(events = [], rules = [], programs = []) {
  const progById = new Map((programs || []).map((p) => [String(p.id), p]));
  return (events || [])
    .filter((ev) => ev?.date && isTeachingEvent(ev, rules))
    .map((ev) => {
      const own = pickTeaching((asObject(ev.assignments) || {})[TEACHING_KEY]);
      const prog = ev.program_id != null ? progById.get(String(ev.program_id)) : null;
      const legacy = prog ? pickTeaching(prog.teaching) : {};
      const useLegacy = !Object.keys(own).length && Object.keys(legacy).length > 0;
      return {
        id: ev.id,
        date: ymd(ev.date),
        time: ev.time ? String(ev.time).slice(0, 5) : '',
        title: ev.title || '',
        campus_id: ev.campus_id ?? null,
        program_id: ev.program_id ?? null,
        teaching: useLegacy ? legacy : own,
        legacyFromProgram: useLegacy,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

// Operacje zapisu jednego pola. Gdy wiersz pokazuje jeszcze dane ze starego programu, przy
// pierwszej edycji przenosimy na wydarzenie WSZYSTKIE jego pola (inaczej reszta by „zniknęła”).
export function teachingOps(row, field, value) {
  const clean = filled(value) ? value : null;
  const ops = [];
  if (row?.legacyFromProgram) {
    Object.entries(row.teaching || {}).forEach(([k, v]) => { if (k !== field) ops.push({ team: TEACHING_KEY, key: k, value: v }); });
  }
  ops.push({ team: TEACHING_KEY, key: field, value: clean });
  return ops;
}

// Wszystkie kazania serii z trzech miejsc: grafik (wydarzenia), stare programy bez wydarzenia
// i biblioteka „Kazania” (sermons.series = nazwa serii). Ten sam dzień = to samo kazanie.
export function seriesSermons(series, { rows = [], programs = [], sermons = [], speakers = [] } = {}) {
  if (!series) return [];
  const sid = String(series.id);
  const sname = normName(series.name);
  const speakerName = (id) => (speakers || []).find((s) => String(s.id) === String(id))?.name || '';
  const byDate = new Map();
  const add = (date, item) => {
    const key = date || `nodate_${byDate.size}`;
    const prev = byDate.get(key);
    if (!prev) { byDate.set(key, item); return; }
    // Scal: brakujące pola uzupełnij, a nagranie z biblioteki zachowaj.
    const merged = { ...prev };
    Object.entries(item).forEach(([k, v]) => { if (!filled(merged[k]) && filled(v)) merged[k] = v; });
    merged.sources = [...new Set([...(prev.sources || []), ...(item.sources || [])])];
    byDate.set(key, merged);
  };

  const linkedPrograms = new Set((rows || []).map((r) => r.program_id).filter((v) => v != null).map(String));
  (rows || []).forEach((r) => {
    if (String(r.teaching?.series_id || '') !== sid) return;
    add(r.date, {
      key: `ev_${r.id}`, date: r.date, title: r.teaching.title || '', speaker: speakerName(r.teaching.speaker_id),
      scripture: r.teaching.scripture || '', main_point: r.teaching.main_point || '', notes: r.teaching.notes || '',
      eventId: r.id, sources: ['schedule'],
    });
  });
  (programs || []).forEach((p) => {
    if (linkedPrograms.has(String(p.id))) return; // już policzony przez wydarzenie
    const t = pickTeaching(p.teaching);
    if (String(t.series_id || '') !== sid) return;
    add(ymd(p.date), {
      key: `prog_${p.id}`, date: ymd(p.date), title: t.title || '', speaker: speakerName(t.speaker_id),
      scripture: t.scripture || '', main_point: t.main_point || '', notes: t.notes || '', sources: ['program'],
    });
  });
  (sermons || []).forEach((s) => {
    if (!sname || normName(s.series) !== sname) return;
    add(ymd(s.sermon_date), {
      key: `s_${s.id}`, date: ymd(s.sermon_date), title: s.title || '', speaker: s.speaker || '',
      scripture: s.scripture_ref || '', sermonId: s.id, isPublished: !!s.is_published, sources: ['library'],
    });
  });

  return [...byDate.values()].sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999')));
}

// Polska odmiana liczebnika: 1 kazanie, 2–4 kazania (poza 12–14), 0 i 5+ kazań.
export const plural = (n, one, few, many) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

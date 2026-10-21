// Tłumaczenie na żywo — czysta logika weba (testowana w interpretationLogic.test.js):
// kody błędów API → stany stron, ponawianie połączeń, wybór języka, metadane pokoju kanału,
// edycja listy kanałów (karta wydarzenia) i ścieżki stron.
import { tr } from '../../i18n';

export const INFO_POLL_MS = 10_000; // strona słuchacza, zanim kanał zacznie nadawać
export const INFO_POLL_LISTENING_MS = 30_000; // w trakcie słuchania — tylko stan („przerwa”, „koniec”)
export const STATS_POLL_MS = 10_000; // licznik słuchaczy (konsola, karta wydarzenia)

export const listenerPath = (token) => `/tlumaczenie/${token}`;
export const memberListenPath = (eventId) => `/tlumaczenie/sluchaj/${encodeURIComponent(eventId)}`;
export const consolePath = (eventId) => `/tlumaczenie/konsola/${encodeURIComponent(eventId)}`;
export const originalPath = (eventId) => `/tlumaczenie/oryginal/${encodeURIComponent(eventId)}`;

// Publiczna strona słuchacza: /tlumaczenie/<token> (jeden segment po prefiksie). Konsola,
// nadawanie i słuchanie z aplikacji mają dłuższe ścieżki i działają po zalogowaniu.
export function isPublicListenerPath(pathname) {
  const m = /^\/tlumaczenie\/([A-Za-z0-9_-]{32,64})\/?$/.exec(String(pathname || ''));
  return !!m;
}

// Ponowienie połączenia: 1,5 s, 3 s, 6 s, 12 s, potem co 15 s.
export function retryDelay(attempt) {
  const n = Math.max(0, Number(attempt) || 0);
  return Math.min(15_000, 1500 * 2 ** n);
}

// Kod błędu API → stan strony słuchacza / konsoli.
export function interpErrorState(err) {
  const code = err?.code || err?.context?.code || '';
  if (code === 'CHANNEL_NOT_LIVE') return 'not_live';
  if (code === 'INTERP_ENDED') return 'ended';
  if (code === 'INTERP_NOT_FOUND' || code === 'CHANNEL_NOT_FOUND' || code === 'NOT_FOUND') return 'not_found';
  if (code === 'INTERP_UNAVAILABLE') return 'unavailable';
  if (code === 'calls_disabled') return 'disabled';
  if (code === 'NOT_INTERPRETER' || code === 'INTERP_FORBIDDEN' || err?.status === 403) return 'forbidden';
  if (code === 'ORIGINAL_DISABLED') return 'original_off';
  if (err?.status === 404) return 'not_found';
  if (err?.status === 410) return 'ended';
  if (err?.status === 429) return 'busy';
  return 'error';
}

export function listenerMessage(state) {
  switch (state) {
    case 'not_found': return { title: tr('Nie znaleziono tłumaczenia'), body: tr('Ten link nie działa. Zeskanuj kod QR jeszcze raz albo zapytaj obsługę.') };
    case 'ended': return { title: tr('Tłumaczenie zakończone'), body: tr('Dziękujemy za wspólny czas. Możesz zamknąć tę stronę.') };
    case 'unavailable': return { title: tr('Tłumaczenie niedostępne'), body: tr('Tłumaczenie nie jest teraz dostępne. Zapytaj obsługę na sali.') };
    case 'disabled': return { title: tr('Tłumaczenie niedostępne'), body: tr('Słuchanie przez internet nie jest włączone na tym serwerze.') };
    case 'busy': return { title: tr('Spróbuj za chwilę'), body: tr('Wiele osób łączy się naraz. Odczekaj chwilę i spróbuj ponownie.') };
    default: return { title: tr('Coś poszło nie tak'), body: tr('Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.') };
  }
}

// Język interfejsu strony słuchacza z przeglądarki (PL/EN/UK; inne → angielski).
export function browserUiLang(languages) {
  const list = (Array.isArray(languages) ? languages : [languages]).filter(Boolean).map((l) => String(l).toLowerCase());
  for (const l of list) {
    if (l.startsWith('pl')) return 'pl';
    if (l.startsWith('uk')) return 'uk';
    if (l.startsWith('en')) return 'en';
  }
  return list.length ? 'en' : 'pl';
}

// Domyślny kanał: zapamiętany, a jeśli go nie ma — pierwszy w języku przeglądarki; jeden kanał — ten.
export function defaultChannel(channels, { remembered = null, languages = [] } = {}) {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;
  if (remembered && list.some((c) => c.id === remembered)) return remembered;
  const prefs = (Array.isArray(languages) ? languages : [languages]).filter(Boolean).map((l) => String(l).toLowerCase());
  for (const p of prefs) {
    const hit = list.find((c) => p === c.lang_code || p.split('-')[0] === String(c.lang_code).split('-')[0]);
    if (hit) return hit.id;
  }
  return list.length === 1 ? list[0].id : null;
}

// Metadane pokoju kanału (serwer: {"active": e-mail | null}).
export function parseRoomMeta(raw) {
  try {
    const v = typeof raw === 'string' && raw ? JSON.parse(raw) : (raw && typeof raw === 'object' ? raw : {});
    return { active: v?.active ? String(v.active).toLowerCase() : null };
  } catch {
    return { active: null };
  }
}

// Stan konsoli: 'on_air' (ja nadaję), 'muted' (ja aktywny, chwilowo wyciszony), 'locked' (nadaje
// ktoś inny), 'free' (nikt nie nadaje).
export function consoleState({ me, active, micMuted = false }) {
  const a = active ? String(active).toLowerCase() : null;
  if (!a) return 'free';
  if (a === String(me || '').toLowerCase()) return micMuted ? 'muted' : 'on_air';
  return 'locked';
}

// ── Karta wydarzenia: edycja kanałów ────────────────────────────────────────
// Kanały z serwera → ładunek interp-session-upsert (pełna lista; kolejność = kolejność na liście).
export function channelsPayload(channels) {
  return (channels || []).map((c) => ({
    ...(c.id ? { id: c.id } : {}),
    lang_code: c.lang_code,
    label: c.label,
    // Tłumacze z grafiku (source 'schedule') należą do synchronizacji grafiku — nie wysyłamy ich.
    interpreters: (c.interpreters || []).filter((i) => typeof i === 'string' || i?.source !== 'schedule')
      .map((i) => (typeof i === 'string' ? i : i.email)).filter(Boolean),
  }));
}

export function addChannel(channels, { lang_code, label }) {
  const code = String(lang_code || '').trim().toLowerCase().replace(/_/g, '-');
  if (!code || (channels || []).some((c) => c.lang_code === code)) return channels || [];
  return [...(channels || []), { lang_code: code, label: String(label || '').trim() || code.toUpperCase(), interpreters: [] }];
}

export const removeChannel = (channels, id) => (channels || []).filter((c) => c.id !== id);

export function updateChannel(channels, id, patch) {
  return (channels || []).map((c) => (c.id === id ? { ...c, ...patch } : c));
}

export function addInterpreter(channels, id, person) {
  return (channels || []).map((c) => {
    if (c.id !== id) return c;
    const list = c.interpreters || [];
    if (list.some((i) => i.email === person.email)) return c;
    return { ...c, interpreters: [...list, { email: person.email, name: person.name || person.email }] };
  });
}

export function removeInterpreter(channels, id, email) {
  return (channels || []).map((c) => (c.id === id ? { ...c, interpreters: (c.interpreters || []).filter((i) => i.email !== email) } : c));
}

// Języki z podpowiedzi, których jeszcze nie ma na liście.
export function remainingPresets(presets, channels) {
  const have = new Set((channels || []).map((c) => c.lang_code));
  return (presets || []).filter((p) => !have.has(p.lang_code));
}

export const LANG_CODE_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
export const isLangCode = (v) => LANG_CODE_RE.test(String(v || '').trim().toLowerCase().replace(/_/g, '-'));

// Słuchacze: „1 słuchacz” itp. robi trPlural w komponencie; tu tylko suma bez nulli.
export const totalListeners = (stats) => (stats?.channels || []).reduce((n, c) => n + (Number(c.listeners) || 0), 0);

// Grafik służby Tłumaczeń (interp-session-get → schedule): osoby czekające na potwierdzenie i bez
// konta, przypięte do kanałów po kodzie języka; osoby z językiem bez kanału — osobno (`orphans`).
export function scheduleByChannel(schedule, channels) {
  const codes = new Set((channels || []).map((c) => c.lang_code));
  const byLang = new Map();
  const orphans = [];
  const push = (list, kind) => {
    for (const p of list || []) {
      const entry = { name: p?.name || '', label: p?.label || p?.lang_code || '', lang_code: p?.lang_code || null, kind };
      if (entry.lang_code && codes.has(entry.lang_code)) {
        if (!byLang.has(entry.lang_code)) byLang.set(entry.lang_code, []);
        byLang.get(entry.lang_code).push(entry);
      } else orphans.push(entry);
    }
  };
  push(schedule?.pending, 'pending');
  push(schedule?.no_account, 'no_account');
  return { byLang, orphans };
}

export const hasScheduleInterpreters = (c) => (c?.interpreters || []).some((i) => i?.source === 'schedule');

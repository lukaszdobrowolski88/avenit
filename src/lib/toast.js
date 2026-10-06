// Globalna warstwa feedbacku (błąd/sukces/info) — wołalna z DOWOLNEGO miejsca, także
// spoza drzewa Reacta (hooki, funkcje pomocnicze), tak jak globalne tr().
// Zastępuje ciche `console.error`/`setError` i część `alert()`.
//   import { toast } from '../lib/toast';
//   toast.error('Nie udało się zapisać');  toast.success('Zapisano');
//   toast.error(error)  // obiekt błędu z API / Error → ludzki komunikat (friendlyError)
import { tr, appLocale } from '../i18n';

let _id = 0;
const listeners = new Set();
let _queue = []; // bufor toastów zanim <Toaster/> się zasubskrybuje
let _lastErrorAt = 0; // kiedy ostatnio pokazano toast błędu (globalny nasłuch nie dubluje)

function emit(t) {
  const toastObj = { id: ++_id, ...t };
  if (listeners.size === 0) { _queue.push(toastObj); }
  else listeners.forEach((l) => l(toastObj));
  return toastObj.id;
}

// ── Ludzkie komunikaty błędów ──────────────────────────────────────────────
// Surowe błędy z API/Postgresa/przeglądarki („duplicate key value…”, „HTTP 413”,
// „Failed to fetch”, „Brak uprawnienia finance:edit”) → zrozumiały tekst z radą, co dalej.
// Szczegóły techniczne zostają w konsoli.
const MSG = {
  network: () => tr('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'),
  timeout: () => tr('Serwer nie odpowiedział na czas. Spróbuj ponownie za chwilę.'),
  tooLarge: () => tr('Plik lub dane są za duże, aby je wysłać. Wybierz mniejszy plik.'),
  session: () => tr('Twoja sesja wygasła. Zaloguj się ponownie.'),
  forbidden: () => tr('Nie masz uprawnień do tej operacji. Poproś administratora o dostęp.'),
  duplicate: () => tr('Taki wpis już istnieje.'),
  linked: () => tr('Ten wpis jest powiązany z innymi danymi, więc nie można wykonać tej operacji.'),
  required: () => tr('Uzupełnij wymagane pola i spróbuj ponownie.'),
  invalid: () => tr('Niektóre wartości mają nieprawidłowy format. Sprawdź formularz i spróbuj ponownie.'),
  config: () => tr('Ta funkcja nie jest poprawnie skonfigurowana. Zgłoś to administratorowi.'),
  notFound: () => tr('Nie znaleziono tego wpisu. Mógł zostać usunięty — odśwież stronę.'),
  tooMany: () => tr('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'),
  server: () => tr('Wystąpił błąd serwera. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.'),
  generic: () => tr('Coś poszło nie tak. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.'),
};

// Wzorce jednoznacznie techniczne — bezpieczne także dla tekstów podanych jako string
// (nie trafią w zwykłe, przetłumaczone komunikaty aplikacji).
const STRICT = [
  ['network', /failed to fetch|networkerror|network request failed|^load failed$|err_network|econnrefused|econnreset|fetch failed/i],
  ['timeout', /statement timeout|etimedout|timed out|aborterror|the operation was aborted/i],
  ['tooLarge', /\bHTTP 413\b|payload too large|request entity too large|entity too large/i],
  ['session', /\bHTTP 401\b|jwt (expired|malformed)|invalid (jwt|token)|token expired/i],
  ['forbidden', /\bHTTP 403\b|permission denied for|insufficient.privilege|row-level security|brak uprawnienia\s+[\w-]+:[\w:-]+/i],
  ['duplicate', /duplicate key value|violates unique constraint/i],
  ['linked', /violates foreign key constraint|foreign key violation/i],
  ['required', /violates not-null constraint|null value in column/i],
  ['invalid', /violates check constraint|invalid input (syntax|value)|date\/time field value out of range|value too long for type|out of range for type/i],
  ['config', /column "?[\w.]+"? (of relation "?\w+"? )?does not exist|relation "?[\w.]+"? does not exist|could not find the '?\w+'? column|kolumna '[^']+' jest niedostępna|tabela '[^']+' nie jest dostępna|\bPGRST\d{3}\b/i],
  ['tooMany', /\bHTTP 429\b|too many requests/i],
  ['server', /\bHTTP 5\d\d\b|internal server error|bad gateway|service unavailable|gateway timeout/i],
];

const PG_CODES = {
  '23505': 'duplicate', '23503': 'linked', '23502': 'required', '23514': 'invalid',
  '22P02': 'invalid', '22007': 'invalid', '22008': 'invalid', '22001': 'invalid', '22003': 'invalid',
  '42501': 'forbidden', '42703': 'config', '42P01': 'config', PGRST204: 'config', PGRST205: 'config',
  '57014': 'timeout', network: 'network',
};

function kindFromStatus(status) {
  if (status === 0) return 'network';
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 409) return 'duplicate';
  if (status === 413) return 'tooLarge';
  if (status === 429) return 'tooMany';
  if (status >= 500 && status < 600) return 'server';
  return null;
}

function kindFromText(text) {
  if (!text) return null;
  for (const [kind, re] of STRICT) if (re.test(text)) return kind;
  return null;
}

// Komunikat z API, który NIE jest dla człowieka (np. angielski w polskim interfejsie, sam kod).
const EN_WORDS = /\b(the|not|is|are|was|failed|error|invalid|cannot|could|must|required|missing|unable|denied|found|exists|configured|unknown|unexpected)\b/i;
function looksTechnical(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^(HTTP )?\d{3}$/.test(s) || /^[A-Z0-9_]+$/.test(s)) return true;
  if (/\b[a-z]+_[a-z_]+\b/.test(s) && /[:=]/.test(s)) return true; // identyfikatory/kolumny
  const en = /^en/.test(appLocale());
  if (!en && /^[\x20-\x7E\n]+$/.test(s) && EN_WORDS.test(s)) return true;
  return false;
}

// Wyciąga z dowolnego „błędu” { message, status, code }.
function parts(err) {
  if (err == null) return { message: '', status: null, code: null };
  if (typeof err === 'string') return { message: err, status: null, code: null };
  // Odpowiedź API { data, error } → sam błąd.
  if (typeof err === 'object' && 'error' in err && err.error && typeof err.error === 'object' && !(err instanceof Error)) return parts(err.error);
  const message = String(err.message || err.error_description || (typeof err.error === 'string' ? err.error : '') || '');
  let status = Number.isFinite(err.status) ? err.status : null;
  const code = err.code != null ? String(err.code) : null;
  if (status == null && code && /^\d{3}$/.test(code)) status = Number(code);
  if (status == null && err.name === 'TypeError' && /fetch|network|load failed/i.test(message)) status = 0;
  return { message, status, code };
}

// Główna funkcja: błąd (string / Error / { message, code, status } / { data, error }) → tekst dla człowieka.
// fallback — co powiedzieć, gdy błąd jest nieznany/techniczny (np. tr('Nie udało się zapisać osoby')).
export function friendlyError(err, fallback) {
  const { message, status, code } = parts(err);
  const kind = (code && PG_CODES[code]) || kindFromText(message) || kindFromStatus(status);
  if (kind) {
    // 403 z czytelnym, polskim uzasadnieniem z serwera (np. „Tylko administrator…”) zostaje.
    if (kind === 'forbidden' && message && !looksTechnical(message) && !kindFromText(message)) return tr(message);
    if (kind === 'notFound' && message && !looksTechnical(message)) return tr(message);
    return MSG[kind]();
  }
  if (message && !looksTechnical(message)) return tr(message);
  if (fallback) return fallback;
  return MSG.generic();
}

// Tekst podany wprost do toast.error: podmień tylko jednoznacznie techniczny fragment,
// np. „Błąd zapisu: duplicate key value violates…” → „Błąd zapisu: Taki wpis już istnieje.”
export function sanitizeErrorText(text) {
  if (typeof text !== 'string' || !text) return text;
  const kind = kindFromText(text);
  if (!kind) return text;
  const friendly = MSG[kind]();
  const sep = text.indexOf(': ');
  if (sep > 0 && sep < 80) {
    const prefix = text.slice(0, sep).trim();
    if (!kindFromText(prefix) && !/^(błąd|error|помилка)$/i.test(prefix)) return `${prefix}: ${friendly}`;
  }
  return friendly;
}

const isErrorLike = (msg) => msg instanceof Error || (msg && typeof msg === 'object' && !('title' in msg) && !('action' in msg)
  && ('code' in msg || 'status' in msg || 'details' in msg || 'hint' in msg || 'context' in msg || ('error' in msg && 'data' in msg)));

// message może być stringiem lub obiektem {title, message, action:{label,onClick}, duration}
const norm = (msg, opts) => (typeof msg === 'string' ? { message: msg, ...opts } : { ...msg, ...opts });

function errorToast(msg, opts) {
  let t;
  if (isErrorLike(msg)) {
    try { console.error('[toast.error]', msg); } catch { /* ignore */ }
    t = { message: friendlyError(msg, opts?.fallback), ...opts };
  } else {
    t = norm(msg, opts);
    if (typeof t.message === 'string') t.message = sanitizeErrorText(t.message);
    else if (t.message && typeof t.message === 'object' && !t.message.$$typeof) t.message = friendlyError(t.message);
  }
  delete t.fallback;
  _lastErrorAt = Date.now();
  return emit({ type: 'error', ...t });
}

export const toast = {
  error: errorToast,
  success: (msg, opts) => emit({ type: 'success', ...norm(msg, opts) }),
  info: (msg, opts) => emit({ type: 'info', ...norm(msg, opts) }),
};

// Kiedy ostatnio pokazano toast błędu (ms od epoki) — 0, gdy jeszcze nigdy.
export function lastErrorToastAt() { return _lastErrorAt; }

export function subscribeToasts(fn) {
  listeners.add(fn);
  if (_queue.length) { const q = _queue; _queue = []; q.forEach(fn); }
  return () => listeners.delete(fn);
}

// ── Globalny nasłuch nieudanych zapisów (apiClient → `avenit:write-error`) ──────────
// Po `delay` ms pokazuje ludzki komunikat, ALE tylko gdy wywołujący sam nie pokazał
// toast.error w tym czasie (bez dublowania) i gdy błąd nie został „naprawiony” ponowieniem
// (udany zapis do tej samej tabeli/funkcji w tym oknie — np. zapis bez opcjonalnej kolumny).
// Zapisy w tle (obecność online, odczyt powiadomień, stan samouczka) są pomijane.
const BACKGROUND_TABLES = new Set(['user_presence', 'notifications', 'page_views', 'analytics_events']);
const BACKGROUND_COLUMNS = new Set(['onboarding', 'last_seen', 'last_seen_at', 'last_active', 'last_active_at', 'lat', 'lng', 'updated_at']);

function isBackground(d) {
  if (d.silent) return true;
  if (d.table && BACKGROUND_TABLES.has(d.table)) return true;
  const cols = Array.isArray(d.columns) ? d.columns : [];
  return d.kind === 'db' && d.op !== 'delete' && cols.length > 0 && cols.every((c) => BACKGROUND_COLUMNS.has(c));
}

function fallbackFor(d) {
  if (d.kind === 'fn') return tr('Nie udało się wykonać operacji. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.');
  if (d.op === 'delete') return tr('Nie udało się usunąć. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.');
  return tr('Nie udało się zapisać zmian. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.');
}

export function listenWriteErrors({ delay = 400, target = typeof window !== 'undefined' ? window : null } = {}) {
  if (!target || typeof target.addEventListener !== 'function') return () => {};
  let pending = [];
  let timer = null;
  const okAt = new Map(); // tabela/funkcja → czas ostatniego udanego zapisu
  const keyOf = (d) => (d.kind === 'fn' ? `fn:${d.fn}` : `db:${d.table}`);

  const flush = () => {
    timer = null;
    const list = pending;
    pending = [];
    if (!list.length) return;
    const firstAt = Math.min(...list.map((d) => d.at));
    if (_lastErrorAt >= firstAt) return; // wywołujący sam pokazał błąd
    const open = list.filter((d) => !((okAt.get(keyOf(d)) || 0) >= d.at));
    if (!open.length) return;
    const d = open[0];
    toast.error(friendlyError({ message: d.message, status: d.status, code: d.code }, fallbackFor(d)));
  };

  const onError = (e) => {
    const d = { ...(e?.detail || {}) };
    if (!d.at) d.at = Date.now();
    if (isBackground(d)) return;
    pending.push(d);
    if (!timer) timer = setTimeout(flush, delay);
  };
  const onOk = (e) => {
    const d = e?.detail || {};
    okAt.set(keyOf({ kind: d.kind || 'db', ...d }), d.at || Date.now());
  };

  target.addEventListener('avenit:write-error', onError);
  target.addEventListener('avenit:write-ok', onOk);
  return () => {
    target.removeEventListener('avenit:write-error', onError);
    target.removeEventListener('avenit:write-ok', onOk);
    if (timer) clearTimeout(timer);
    timer = null;
    pending = [];
  };
}

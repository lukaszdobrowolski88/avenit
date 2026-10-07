import { Alert } from 'react-native';
import { appLang, tr } from '../i18n';

// Ludzkie komunikaty błędów — port `friendlyError` z weba (src/lib/toast.js), ta sama logika.
// Surowe błędy z API/Postgresa/sieci („duplicate key value…”, „HTTP 403”, „Network request
// failed”, „Brak uprawnienia finance:edit”) → zrozumiały tekst po polsku z radą, co dalej.
// Szczegóły techniczne zostają w konsoli.
//
//   import { friendlyError, showError } from '../lib/errors';
//   Alert.alert('Nie udało się zapisać', friendlyError(e));
//   showError('Nie udało się zapisać', e);                       // to samo, krócej
//   showError('Nie udało się usunąć', e, 'Spróbuj ponownie.');   // własny tekst, gdy błąd nieznany
//
// Przyjmuje: Error, string, `{ message, code, status }` (błąd z `.from()` / `functions.invoke`),
// albo całą odpowiedź `{ data, error }`.

export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'tooLarge'
  | 'session'
  | 'forbidden'
  | 'duplicate'
  | 'linked'
  | 'required'
  | 'invalid'
  | 'config'
  | 'notFound'
  | 'tooMany'
  | 'server'
  | 'generic';

const MSG: Record<ErrorKind, () => string> = {
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
  notFound: () => tr('Nie znaleziono tego wpisu. Mógł zostać usunięty — odśwież widok.'),
  tooMany: () => tr('Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'),
  server: () =>
    tr('Wystąpił błąd serwera. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.'),
  generic: () =>
    tr('Coś poszło nie tak. Spróbuj ponownie, a jeśli błąd się powtórzy, zgłoś go administratorowi.'),
};

// Wzorce jednoznacznie techniczne — bezpieczne także dla tekstów podanych jako string
// (nie trafią w zwykłe, polskie komunikaty aplikacji).
const STRICT: [ErrorKind, RegExp][] = [
  ['network', /failed to fetch|networkerror|network request failed|network error|^load failed$|err_network|econnrefused|econnreset|fetch failed/i],
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

const PG_CODES: Record<string, ErrorKind> = {
  '23505': 'duplicate',
  '23503': 'linked',
  '23502': 'required',
  '23514': 'invalid',
  '22P02': 'invalid',
  '22007': 'invalid',
  '22008': 'invalid',
  '22001': 'invalid',
  '22003': 'invalid',
  '42501': 'forbidden',
  '42703': 'config',
  '42P01': 'config',
  PGRST204: 'config',
  PGRST205: 'config',
  '57014': 'timeout',
  network: 'network',
};

// Awarie, przy których komunikat serwera (np. „Błąd serwera”) nie pomaga — zawsze nasz tekst.
const SYSTEM_KINDS = new Set<ErrorKind>(['network', 'timeout', 'server', 'config', 'tooLarge']);

const kindFromStatus = (status: number | null): ErrorKind | null => {
  if (status == null) return null;
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
};

const kindFromText = (text: string): ErrorKind | null => {
  if (!text) return null;
  for (const [kind, re] of STRICT) if (re.test(text)) return kind;
  return null;
};

// Komunikat, który NIE jest dla człowieka (angielski w polskim interfejsie, sam kod, identyfikatory).
const EN_WORDS = /\b(the|not|is|are|was|failed|error|invalid|cannot|could|must|required|missing|unable|denied|found|exists|configured|unknown|unexpected|undefined|null)\b/i;
const looksTechnical = (text: string): boolean => {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/^(HTTP )?\d{3}$/.test(s) || /^[A-Z0-9_]+$/.test(s)) return true;
  if (/\b[a-z]+_[a-z_]+\b/.test(s) && /[:=]/.test(s)) return true;
  if (appLang() !== 'en' && /^[\x20-\x7E\n]+$/.test(s) && EN_WORDS.test(s)) return true;
  return false;
};

interface Parts {
  message: string;
  status: number | null;
  code: string | null;
}

const parts = (err: unknown): Parts => {
  if (err == null) return { message: '', status: null, code: null };
  if (typeof err === 'string') return { message: err, status: null, code: null };
  if (typeof err !== 'object') return { message: String(err), status: null, code: null };
  const e = err as Record<string, unknown>;
  // Odpowiedź API { data, error } → sam błąd.
  if (!(err instanceof Error) && 'error' in e && e.error && typeof e.error === 'object') return parts(e.error);
  const message = String(
    e.message || e.error_description || (typeof e.error === 'string' ? e.error : '') || '',
  );
  let status = typeof e.status === 'number' && Number.isFinite(e.status) ? e.status : null;
  const code = e.code != null ? String(e.code) : null;
  if (status == null && code && /^\d{3}$/.test(code)) status = Number(code);
  if (status == null && e.name === 'TypeError' && /fetch|network|load failed/i.test(message)) status = 0;
  return { message, status, code };
};

// Rodzaj błędu (np. żeby inaczej zareagować na brak uprawnień) albo null, gdy nieznany.
export const errorKind = (err: unknown): ErrorKind | null => {
  const { message, status, code } = parts(err);
  return (code && PG_CODES[code]) || kindFromText(message) || kindFromStatus(status);
};

// Główna funkcja: błąd → tekst dla człowieka. `fallback` — co powiedzieć, gdy błąd jest
// nieznany/techniczny (np. 'Nie udało się zapisać profilu.').
export const friendlyError = (err: unknown, fallback?: string): string => {
  const { message, status, code } = parts(err);
  const byText = kindFromText(message);
  const kind = (code && PG_CODES[code]) || byText || kindFromStatus(status);
  if (kind) {
    // Błąd „po stronie użytkownika” (401/403/404/409/429…) z czytelnym, polskim uzasadnieniem
    // z serwera (np. „Błędny e-mail lub hasło”, „Tylko administrator…”) zostaje — jest
    // konkretniejszy niż ogólny tekst. Awarie (sieć, serwer, konfiguracja) — zawsze nasz tekst.
    if (!byText && message && !looksTechnical(message) && !SYSTEM_KINDS.has(kind)) return tr(message);
    return MSG[kind]();
  }
  if (message && !looksTechnical(message)) return tr(message);
  return fallback ?? MSG.generic();
};

// Tekst podany wprost: podmień tylko jednoznacznie techniczny fragment,
// np. „Błąd zapisu: duplicate key value…” → „Błąd zapisu: Taki wpis już istnieje.”
export const sanitizeErrorText = (text: string): string => {
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
};

// Okno z błędem (Alert jest zawsze na wierzchu — także nad otwartym arkuszem/modalem).
//   showError('Nie udało się zapisać', e)
export const showError = (title: string, err: unknown, fallback?: string): void => {
  if (__DEV__ && err != null && typeof err === 'object') console.warn('[showError]', err);
  Alert.alert(tr(title), friendlyError(err, fallback));
};

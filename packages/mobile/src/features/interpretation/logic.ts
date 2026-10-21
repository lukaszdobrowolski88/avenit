// Tłumaczenie na żywo w aplikacji — czysta logika (bez React Native), testowana w
// src/lib/mobileInterpretation.test.js (vitest weba). Odpowiednik webowego
// src/modules/Interpretation/interpretationLogic.js: kody błędów API → stany ekranu, ponawianie,
// wybór języka, rozpoznawanie linków /tlumaczenie/… i opis stanu słuchania.

export const INFO_POLL_MS = 10_000; // zanim kanał zacznie nadawać — czekamy na tłumacza
export const INFO_POLL_LISTENING_MS = 30_000; // w trakcie słuchania — tylko stan („przerwa”, „koniec”)
export const CARD_POLL_MS = 30_000; // karta na ekranie wydarzenia

export type Phase = 'idle' | 'waiting' | 'connecting' | 'listening' | 'reconnecting';
export type FatalState = 'not_found' | 'ended' | 'unavailable' | 'disabled';
export type ErrorState = FatalState | 'not_live' | 'forbidden' | 'busy' | 'error';

export interface ListenerChannel {
  id: string;
  lang_code: string;
  label: string;
  live: boolean;
}
export interface ListenerInfo {
  church_name: string;
  event: { title?: string | null; date?: string | null; time?: string | null; starts_at?: string | null } | null;
  status: 'idle' | 'live' | 'ended';
  channels: ListenerChannel[];
}
export interface ListenResponse {
  url: string;
  token: string;
  channel: { id: string; lang_code: string; label: string; live: boolean };
}

// Kształt odpowiedzi interp-session-get (to, czego potrzebuje słuchacz).
export interface SessionGetResponse {
  event?: { id?: string | number; title?: string | null; date?: string | null; time?: string | null } | null;
  session?: {
    status: 'idle' | 'live' | 'ended';
    channels?: { id: string; lang_code: string; label: string; status: 'idle' | 'live' }[];
  } | null;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
export const isPublicToken = (t: unknown) => TOKEN_RE.test(String(t ?? ''));

// Ponowienie połączenia: 1,5 s, 3 s, 6 s, 12 s, potem co 15 s.
export function retryDelay(attempt: number): number {
  const n = Math.max(0, Number(attempt) || 0);
  return Math.min(15_000, 1500 * 2 ** n);
}

// Błąd z supabase.functions.invoke (shim): { message, status, context: { error, code } }.
export function interpErrorState(err: unknown): ErrorState {
  const e = (err ?? {}) as { code?: string; status?: number; context?: { code?: string } | null };
  const code = e.code || e.context?.code || '';
  if (code === 'CHANNEL_NOT_LIVE') return 'not_live';
  if (code === 'INTERP_ENDED') return 'ended';
  if (code === 'INTERP_NOT_FOUND' || code === 'CHANNEL_NOT_FOUND' || code === 'NOT_FOUND') return 'not_found';
  if (code === 'INTERP_UNAVAILABLE') return 'unavailable';
  if (code === 'calls_disabled') return 'disabled';
  if (code === 'INTERP_FORBIDDEN' || e.status === 403) return 'forbidden';
  if (e.status === 404) return 'not_found';
  if (e.status === 410) return 'ended';
  if (e.status === 429) return 'busy';
  return 'error';
}

// Stan błędu, który kończy słuchanie (nie ponawiamy). 403 = nie widzę wydarzenia → jak „nie ma”.
export function fatalFromError(state: ErrorState): FatalState | null {
  if (state === 'forbidden') return 'not_found';
  if (state === 'not_found' || state === 'ended' || state === 'unavailable' || state === 'disabled') return state;
  return null;
}

export function fatalMessage(state: FatalState): { title: string; body: string } {
  switch (state) {
    case 'not_found':
      return { title: 'Nie znaleziono tłumaczenia', body: 'To wydarzenie nie ma tłumaczenia na żywo albo link przestał działać.' };
    case 'ended':
      return { title: 'Tłumaczenie zakończone', body: 'Dziękujemy za wspólny czas.' };
    case 'unavailable':
      return { title: 'Tłumaczenie niedostępne', body: 'Tłumaczenie nie jest teraz dostępne. Zapytaj obsługę na sali.' };
    case 'disabled':
      return { title: 'Tłumaczenie niedostępne', body: 'Słuchanie przez internet nie jest włączone na tym serwerze.' };
    default:
      return { title: 'Coś poszło nie tak', body: 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.' };
  }
}

// interp-session-get → dane słuchacza (jak publiczne interp-public-info). Brak sesji = null.
export function infoFromSession(r: SessionGetResponse | null | undefined): ListenerInfo | null {
  const s = r?.session;
  if (!s) return null;
  return {
    church_name: '',
    event: r?.event ? { title: r.event.title ?? null, date: r.event.date ?? null, time: r.event.time ?? null } : null,
    status: s.status,
    channels: s.status === 'ended' ? [] : (s.channels ?? []).map((c) => ({ id: c.id, lang_code: c.lang_code, label: c.label, live: c.status === 'live' })),
  };
}

// Domyślny kanał: zapamiętany, a jeśli go nie ma — pierwszy w języku telefonu/aplikacji; jeden kanał — ten.
export function defaultChannel(
  channels: { id: string; lang_code: string }[] | null | undefined,
  { remembered = null, languages = [] }: { remembered?: string | null; languages?: (string | null | undefined)[] } = {},
): string | null {
  const list = Array.isArray(channels) ? channels : [];
  if (!list.length) return null;
  if (remembered && list.some((c) => c.id === remembered)) return remembered;
  const prefs = languages.filter(Boolean).map((l) => String(l).toLowerCase().replace(/_/g, '-'));
  for (const p of prefs) {
    const hit = list.find((c) => p === c.lang_code || p.split('-')[0] === String(c.lang_code).split('-')[0]);
    if (hit) return hit.id;
  }
  return list.length === 1 ? list[0].id : null;
}

// Co zrobić po odświeżeniu stanu: czekamy na tłumacza, a wybrany kanał właśnie ruszył → łączymy.
export function pollDecision(phase: Phase, info: ListenerInfo | null, selected: string | null): 'connect' | 'ended' | 'none' {
  if (!info) return 'none';
  if (info.status === 'ended') return 'ended';
  if (phase !== 'waiting' || !selected) return 'none';
  return info.channels.find((c) => c.id === selected)?.live ? 'connect' : 'none';
}

// Odstęp odpytywania stanu (null = nie odpytujemy).
export function pollInterval(phase: Phase, fatal: FatalState | null): number | null {
  if (fatal) return null;
  return phase === 'listening' ? INFO_POLL_LISTENING_MS : INFO_POLL_MS;
}

// Ekran nie gaśnie: Android — przez całe słuchanie (bez usługi pierwszoplanowej system usypia
// apkę przy wygaszonym ekranie); iOS — tylko zanim popłynie dźwięk (czekanie / łączenie), bo
// uśpiona apka nie połączy się sama; w trakcie słuchania dźwięk gra też przy zablokowanym ekranie.
export function shouldKeepAwake(os: string, phase: Phase): boolean {
  if (phase === 'idle') return false;
  if (os === 'android') return true;
  return phase !== 'listening';
}

// Opis stanu słuchania (pasek stanu na ekranie).
export function phaseView(
  phase: Phase,
  { channel, online = true }: { channel?: ListenerChannel | null; online?: boolean } = {},
): { title: string; body: string; tone: 'live' | 'wait' | 'warn' } | null {
  switch (phase) {
    case 'listening':
      if (channel && channel.live === false) {
        return { title: 'Tłumacz ma przerwę', body: 'Dźwięk wróci sam, gdy tłumacz znów zacznie mówić.', tone: 'wait' };
      }
      return {
        title: channel?.label ? `Słuchasz: ${channel.label}` : 'Słuchasz tłumaczenia',
        body: 'Głos tłumacza słychać z kilkusekundowym zapasem — to normalne.',
        tone: 'live',
      };
    case 'waiting':
      return { title: 'Czekamy na tłumacza…', body: 'Tłumaczenie jeszcze się nie zaczęło. Połączymy Cię automatycznie.', tone: 'wait' };
    case 'connecting':
      return { title: 'Łączenie…', body: 'Za chwilę usłyszysz tłumacza.', tone: 'wait' };
    case 'reconnecting':
      return online
        ? { title: 'Łączenie ponownie…', body: 'Połączenie zostało przerwane — próbujemy dalej.', tone: 'warn' }
        : { title: 'Brak internetu', body: 'Połączymy ponownie, gdy internet wróci.', tone: 'warn' };
    default:
      return null;
  }
}

// Karta na ekranie wydarzenia: pokazujemy, gdy wydarzenie ma (niezakończone) tłumaczenie.
export function cardSummary(r: SessionGetResponse | null | undefined): { show: false } | { show: true; live: string[]; languages: string[] } {
  const s = r?.session;
  if (!s || s.status === 'ended') return { show: false };
  const channels = s.channels ?? [];
  if (!channels.length) return { show: false };
  return {
    show: true,
    languages: channels.map((c) => c.label),
    live: channels.filter((c) => c.status === 'live').map((c) => c.label),
  };
}

// ── Linki /tlumaczenie/… ────────────────────────────────────────────────────
// Web: /tlumaczenie/<token> (publiczny link/QR), /tlumaczenie/sluchaj/<id wydarzenia> (zalogowany),
// /tlumaczenie/konsola/<id> i /tlumaczenie/oryginal/<id> (konsola tłumacza, stół akustyka — web).
export type InterpretationTarget =
  | { kind: 'event'; eventId: string }
  | { kind: 'token'; token: string }
  | { kind: 'web'; path: string };

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function interpretationTargetFromPath(path: string | null | undefined): InterpretationTarget | null {
  const bare = `/${String(path ?? '').replace(/^\/+/, '')}`.split(/[?#]/)[0].replace(/\/+$/, '');
  const m = /^\/tlumaczenie\/(.+)$/.exec(bare);
  if (!m) return null;
  const parts = m[1].split('/');
  if (parts.length === 1 && isPublicToken(parts[0])) return { kind: 'token', token: parts[0] };
  if (parts.length === 2 && parts[0] === 'sluchaj' && parts[1]) return { kind: 'event', eventId: decode(parts[1]) };
  if (parts.length === 2 && (parts[0] === 'konsola' || parts[0] === 'oryginal') && parts[1]) return { kind: 'web', path: bare };
  return null;
}

const hostOf = (url: string): string | null => {
  const m = /^https?:\/\/([^/?#:]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
};

// Pełny adres weba (np. link z czatu) → cel w aplikacji, ale tylko na webie TEGO kościoła
// (publiczny token obcego kościoła i tak by się u nas nie znalazł). Ścieżka bez hosta też.
export function interpretationTargetFromUrl(url: string | null | undefined, ownWebBase: string | null | undefined): InterpretationTarget | null {
  const s = String(url ?? '').trim();
  if (!s) return null;
  const host = hostOf(s);
  if (host) {
    const own = hostOf(String(ownWebBase ?? ''));
    if (!own || host !== own) return null;
    return interpretationTargetFromPath(s.replace(/^https?:\/\/[^/?#]+/i, '') || '/');
  }
  if (!s.startsWith('/')) return null;
  return interpretationTargetFromPath(s);
}

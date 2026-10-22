// Konsola tłumacza w aplikacji — czysta logika (bez React Native), testowana w
// src/lib/mobileInterpretationConsole.test.js (vitest weba). Odpowiednik webowego
// src/modules/Interpretation/interpretationLogic.js (consoleState, parseRoomMeta) + to, czego
// potrzebuje telefon: fazy połączenia, przycisk główny, błędy, poziom mikrofonu, słuchawki,
// powiadomienie usługi w tle (Android) i podpowiedzi o ekranie.

import { interpErrorState, retryDelay } from './logic';

export { retryDelay };

export const STATS_POLL_MS = 10_000; // licznik słuchaczy (jak web)
export const OUTPUT_POLL_MS = 5_000; // Android: czy podłączono słuchawki

// setup — przed dołączeniem; joining — łączymy; on — na kanale; reconnecting — zerwane, ponawiamy.
export type ConsolePhase = 'setup' | 'joining' | 'on' | 'reconnecting';
// on_air — ja nadaję; muted — ja aktywny, chwilowo wyciszony; locked — nadaje ktoś inny; free — nikt.
export type MicState = 'on_air' | 'muted' | 'locked' | 'free';

export interface ConsoleChannel {
  id: string;
  lang_code: string;
  label: string;
  role_name?: string | null;
  status: 'idle' | 'live';
  mine?: boolean;
  active_interpreter_email?: string | null;
  active_interpreter_name?: string | null;
  interpreters?: { email?: string | null; name?: string | null }[];
}

export interface ConsoleSessionView {
  event?: { id?: string | number; title?: string | null } | null;
  can_manage?: boolean;
  my_channels?: string[];
  session?: {
    status: 'idle' | 'live' | 'ended';
    original_enabled?: boolean;
    original_status?: 'idle' | 'live';
    channels?: ConsoleChannel[];
  } | null;
}

export interface JoinResponse {
  url: string;
  token: string;
  identity: string;
  channel?: Partial<ConsoleChannel> | null;
  partners?: { email: string; name?: string | null }[];
  original?: { token: string } | null;
  session_status?: 'idle' | 'live' | 'ended';
}

export interface ConsoleStats {
  status?: 'idle' | 'live' | 'ended';
  original?: { enabled?: boolean; status?: string; publishing?: boolean } | null;
  channels?: { id: string; status?: string; active_interpreter_email?: string | null; active_interpreter_name?: string | null; listeners?: number | null; publishing?: boolean }[];
}

const lower = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Nazwa kanału dla personelu: Służba modułu („Tłumacz EN”), zapas — etykieta słuchacza / kod.
export const staffLabel = (c: Partial<ConsoleChannel> | null | undefined) =>
  String(c?.role_name || c?.label || String(c?.lang_code || '').toUpperCase());

// Kanały, do których mogę wejść: moje (przypisany tłumacz), a zarządzający — wszystkie.
export function consoleChannels(view: ConsoleSessionView | null | undefined): ConsoleChannel[] {
  const s = view?.session;
  if (!s || s.status === 'ended') return [];
  const mine = new Set((view?.my_channels ?? []).map(String));
  return (s.channels ?? []).filter((c) => c.mine || mine.has(String(c.id)) || !!view?.can_manage);
}

// Domyślny kanał: zapamiętany (jeśli nadal dostępny), potem mój, potem pierwszy.
export function defaultConsoleChannel(
  channels: ConsoleChannel[],
  { remembered = null, myChannels = [] }: { remembered?: string | null; myChannels?: string[] } = {},
): string | null {
  if (!channels.length) return null;
  if (remembered && channels.some((c) => c.id === remembered)) return remembered;
  const mine = new Set(myChannels.map(String));
  return (channels.find((c) => c.mine || mine.has(String(c.id))) ?? channels[0]).id;
}

// Metadane pokoju kanału (serwer: {"active": e-mail | null}).
export function parseRoomMeta(raw: unknown): { active: string | null } {
  try {
    const v = typeof raw === 'string' && raw ? JSON.parse(raw) : raw && typeof raw === 'object' ? raw : {};
    const a = (v as { active?: unknown })?.active;
    return { active: a ? lower(a) : null };
  } catch {
    return { active: null };
  }
}

export function micState({ me, active, selfMuted = false }: { me: string | null | undefined; active: string | null | undefined; selfMuted?: boolean }): MicState {
  const a = active ? lower(active) : null;
  if (!a) return 'free';
  if (me && a === lower(me)) return selfMuted ? 'muted' : 'on_air';
  return 'locked';
}

// Mikrofon otwarty tylko u aktywnego tłumacza, na kanale i bez chwilowego wyciszenia.
export function micShouldBeOpen({ phase, me, active, selfMuted }: { phase: ConsolePhase; me: string | null; active: string | null; selfMuted: boolean }): boolean {
  return phase === 'on' && micState({ me, active, selfMuted }) === 'on_air';
}

export const isConnected = (phase: ConsolePhase) => phase === 'on' || phase === 'reconnecting';

// Przycisk główny (duży) i drugorzędne akcje.
export type PrimaryKind = 'join' | 'take_over' | 'give_back';
export interface PrimaryAction {
  kind: PrimaryKind;
  label: string;
  disabled: boolean;
  loading: boolean;
}
export function primaryAction({
  phase,
  state,
  ended,
  busy,
  hasChannel = true,
}: {
  phase: ConsolePhase;
  state: MicState;
  ended: boolean;
  busy: boolean;
  hasChannel?: boolean;
}): PrimaryAction {
  if (!isConnected(phase)) {
    return { kind: 'join', label: 'Dołącz do kanału', disabled: ended || !hasChannel || phase === 'joining', loading: phase === 'joining' || busy };
  }
  if (state === 'on_air' || state === 'muted') {
    return { kind: 'give_back', label: 'Oddaj mikrofon', disabled: busy, loading: busy };
  }
  return { kind: 'take_over', label: 'Przejmij mikrofon', disabled: !canTakeOver({ phase, state, ended }) || busy, loading: busy };
}

// Przejąć można na kanale (nie w trakcie ponownego łączenia), gdy jeszcze nie nadaję i tłumaczenie trwa.
export function canTakeOver({ phase, state, ended }: { phase: ConsolePhase; state: MicState; ended: boolean }): boolean {
  return phase === 'on' && !ended && (state === 'free' || state === 'locked');
}

// Plakietka stanu.
export function airBadge(phase: ConsolePhase, state: MicState): { label: string; tone: 'live' | 'muted' | 'off' | 'wait' } | null {
  if (phase === 'reconnecting') return { label: 'Łączenie…', tone: 'wait' };
  if (phase !== 'on') return null;
  if (state === 'on_air') return { label: 'NA ŻYWO', tone: 'live' };
  if (state === 'muted') return { label: 'Wyciszony', tone: 'muted' };
  return { label: 'Mikrofon wyłączony', tone: 'off' };
}

// Zdanie pod nagłówkiem kanału.
export function stateMessage(state: MicState, holder: string | null): string {
  switch (state) {
    case 'on_air':
      return 'Słuchacze słyszą Cię teraz.';
    case 'muted':
      return 'Masz mikrofon, ale jest chwilowo wyciszony — słuchacze nic nie słyszą.';
    case 'locked':
      return `Mikrofon zablokowany — teraz tłumaczy ${holder || 'inny tłumacz'}. Naciśnij „Przejmij mikrofon”, gdy będziesz gotowy(a).`;
    default:
      return 'Nikt teraz nie tłumaczy. Słuchacze usłyszą Cię po naciśnięciu „Przejmij mikrofon”.';
  }
}

// Kto teraz nadaje (imię) — z obecnych w pokoju, z listy tłumaczy kanału, ze statystyk, albo e-mail.
export function holderName({
  active,
  me,
  present = [],
  channel = null,
  statsName = null,
}: {
  active: string | null;
  me: string | null;
  present?: { id: string; name?: string | null }[];
  channel?: Partial<ConsoleChannel> | null;
  statsName?: string | null;
}): string | null {
  const a = active ? lower(active) : null;
  if (!a || (me && a === lower(me))) return null;
  return (
    present.find((p) => lower(p.id) === a)?.name ||
    channel?.interpreters?.find((i) => lower(i.email) === a)?.name ||
    (lower(channel?.active_interpreter_email) === a ? channel?.active_interpreter_name : null) ||
    statsName ||
    a
  );
}

// Licznik słuchaczy: „1 słuchacz”, „5 słuchaczy” (jak web), brak danych — „—”.
export function listenersText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Math.max(0, Math.floor(Number(n)));
  return v === 1 ? '1 słuchacz' : `${v} słuchaczy`;
}

export const sessionStatusLabel = (s: 'idle' | 'live' | 'ended' | null | undefined): string =>
  s === 'live' ? 'Tłumaczenie trwa' : s === 'ended' ? 'Tłumaczenie zakończone' : 'Tłumaczenie jeszcze się nie zaczęło';

// ── Błędy ──────────────────────────────────────────────────────────────────
export type ConsoleError = 'ended' | 'forbidden' | 'not_found' | 'disabled' | 'unavailable' | 'mic_denied' | 'call_active' | 'audio' | 'network';

// Błąd API / połączenia → rodzaj błędu konsoli.
export function consoleErrorFrom(err: unknown): ConsoleError {
  const s = interpErrorState(err);
  const code = String((err as { code?: string; context?: { code?: string } | null })?.code || (err as { context?: { code?: string } | null })?.context?.code || '');
  if (code === 'NOT_INTERPRETER') return 'forbidden';
  if (code === 'LIVEKIT_UNAVAILABLE') return 'network';
  if (s === 'ended') return 'ended';
  if (s === 'forbidden') return 'forbidden';
  if (s === 'not_found') return 'not_found';
  if (s === 'disabled') return 'disabled';
  if (s === 'unavailable') return 'unavailable';
  return 'network';
}

export function consoleErrorMessage(e: ConsoleError): string {
  switch (e) {
    case 'ended':
      return 'Tłumaczenie zostało zakończone. Organizator może je wznowić na stronie wydarzenia.';
    case 'forbidden':
      return 'Do konsoli tego kanału wchodzi przypisany tłumacz.';
    case 'not_found':
      return 'Nie znaleziono tego kanału tłumaczenia — mógł zostać usunięty.';
    case 'disabled':
      return 'Połączenia audio nie są włączone na tym serwerze.';
    case 'unavailable':
      return 'Tłumaczenie nie jest teraz dostępne.';
    case 'mic_denied':
      return 'Aplikacja nie ma dostępu do mikrofonu. Zezwól na mikrofon w Ustawieniach i spróbuj ponownie.';
    case 'call_active':
      return 'Trwa rozmowa. Zakończ ją, żeby wejść do konsoli tłumacza.';
    case 'audio':
      return 'Nie udało się włączyć dźwięku. Spróbuj ponownie.';
    default:
      return 'Nie udało się połączyć. Sprawdź internet i spróbuj ponownie.';
  }
}

// Zerwane połączenie: koniec / brak dostępu — kończymy zmianę; reszta — ponawiamy.
export function rejoinDecision(e: ConsoleError): 'stop' | 'retry' {
  return e === 'ended' || e === 'forbidden' || e === 'not_found' || e === 'disabled' || e === 'unavailable' ? 'stop' : 'retry';
}

// ── Mikrofon i odsłuch ─────────────────────────────────────────────────────
// RMS z procesora głośności LiveKit (0–1) → pasek: skala dBFS od −60 dB (cisza) do 0 dB.
export function levelFromRms(rms: number | null | undefined): number {
  const v = Number(rms);
  if (!Number.isFinite(v) || v <= 0) return 0;
  const db = 20 * Math.log10(Math.min(1, v));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function meterTone(level: number): 'ok' | 'high' | 'clip' {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  return pct >= 97 ? 'clip' : pct >= 85 ? 'high' : 'ok';
}

// Głośność odsłuchu: kroki 0–100% (dotyk segmentu).
export const VOLUME_STEPS = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
export function nearestVolumeStep(v: number): number {
  const x = Math.max(0, Math.min(1, Number(v) || 0));
  return VOLUME_STEPS.reduce((best, s) => (Math.abs(s - x) < Math.abs(best - x) ? s : best), VOLUME_STEPS[0] as number);
}

// Oryginał: null — wyłączony / bez połączenia, false — cisza, true — nadaje.
export function originalStatusText({ enabled, connected, on, muted }: { enabled: boolean; connected: boolean; on: boolean | null; muted: boolean }): string {
  if (!enabled) return 'Kanał „Oryginał” jest wyłączony.';
  if (!connected) return 'Usłyszysz go po dołączeniu.';
  if (on == null) return 'Oryginał niedostępny — kanał działa dalej.';
  if (!on) return 'Oryginał jeszcze nie nadaje.';
  return muted ? 'Oryginał nadaje — masz go wyciszonego.' : 'Oryginał nadaje.';
}

// Słuchawki: Android zwraca dostępne wyjścia (AudioSession.getAudioOutputs) — 'headset' /
// 'bluetooth' = słuchawki. iOS zwraca stałą listę → nie wiemy (null) i ostrzegamy zawsze.
export function headphonesConnected(os: string, outputs: string[] | null | undefined): boolean | null {
  if (os !== 'android' || !Array.isArray(outputs)) return null;
  return outputs.some((o) => /headset|bluetooth|usb|wired/i.test(String(o)));
}
export const showHeadphonesBanner = (connected: boolean | null) => connected !== true;

// ── Ekran, tło i powiadomienie (Android) ───────────────────────────────────
// Usługa w tle konsoli (Android): moduł AvenitInterpretationPlayback z trybem „console”
// (typ usługi microphone|mediaPlayback). Starszy moduł (tylko słuchanie) albo brak modułu → nie.
export function consoleServiceSupported(mod: { apiVersion?: unknown; modes?: unknown } | null | undefined): boolean {
  if (!mod) return false;
  const modes = (mod as { modes?: unknown }).modes;
  if (Array.isArray(modes)) return modes.includes('console');
  const v = Number((mod as { apiVersion?: unknown }).apiVersion);
  return Number.isFinite(v) && v >= 2;
}

export function shouldRunConsoleService(os: string, phase: ConsolePhase, available: boolean): boolean {
  return os === 'android' && available && phase !== 'setup';
}

// Ekran nie gaśnie przez całą zmianę — chyba że Android trzyma usługę z mikrofonem w tle.
export function consoleKeepAwake(os: string, phase: ConsolePhase, service = false): boolean {
  if (phase === 'setup') return false;
  return !(os === 'android' && service);
}

export function consoleNotification(
  phase: ConsolePhase,
  state: MicState,
  { channelLabel, eventTitle, holder }: { channelLabel?: string | null; eventTitle?: string | null; holder?: string | null } = {},
): { title: string; text: string } {
  const ch = String(channelLabel ?? '').trim();
  const withCh = (base: string) => (ch ? `${base} — ${ch}` : base);
  const text = String(eventTitle ?? '').trim();
  if (phase === 'joining') return { title: withCh('Konsola tłumacza'), text: 'Łączenie…' };
  if (phase === 'reconnecting') return { title: withCh('Konsola tłumacza'), text: 'Łączenie ponownie…' };
  if (state === 'on_air') return { title: withCh('Tłumaczysz na żywo'), text };
  if (state === 'muted') return { title: withCh('Mikrofon wyciszony'), text };
  if (state === 'locked') return { title: withCh('Konsola tłumacza'), text: holder ? `Teraz tłumaczy ${holder}` : 'Tłumaczy inna osoba' };
  return { title: withCh('Konsola tłumacza'), text: 'Oczekiwanie — nikt nie tłumaczy' };
}

export function consoleScreenHint(os: string, service: boolean): string {
  if (os === 'android' && service) {
    return 'Możesz wyłączyć ekran — mikrofon i odsłuch działają dalej. Zmianę zakończysz też z powiadomienia.';
  }
  if (os === 'android') {
    return 'Nie wyłączaj ekranu i nie przechodź do innej aplikacji — w tle Android wyłącza mikrofon. Ekran nie zgaśnie sam.';
  }
  return 'Zostaw aplikację otwartą — ekran nie zgaśnie sam. Po zablokowaniu telefonu dźwięk zwykle działa dalej, ale nie polegaj na tym w trakcie tłumaczenia.';
}

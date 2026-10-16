// Rozmowy audio/wideo w mobilce — czysta logika (bez React Native i sieci): widok wiadomości
// „połączenie” w wątku. Lustrzana kopia webowego src/modules/Komunikator/calls/callLogic.js
// (callMessageView, formatCallDuration) — test parytetu: src/modules/Komunikator/calls/callLogic.test.js.
// Rozmowy są natywne (LiveKit + CallKit/Core-Telecom, features/calls/native); przeglądarka
// (webCallPath) zostaje tylko jako zapas, gdy w buildzie brakuje modułów natywnych.

export const LIVE_STATUSES = new Set(["ringing", "active"]);
export const ENDED_STATUSES = new Set(["ended", "missed", "declined", "cancelled"]);
const STALE_LIVE_MS = 12 * 3600 * 1000;

type Vars = Record<string, string | number>;
export type Translate = (s: string, v?: Vars) => string;
const fill: Translate = (s, v = {}) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();

export const ts = (v: unknown) => {
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
};

export function parseMetadata(meta: unknown): Record<string, any> {
  if (!meta) return {};
  if (typeof meta === "object") return meta as Record<string, any>;
  try {
    const v = JSON.parse(String(meta));
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export interface CallRowLike { status?: string | null; started_at?: string | null }
export const isLiveCall = (call: CallRowLike | null | undefined, now = Date.now()) =>
  !!call && LIVE_STATUSES.has(String(call.status)) && (!call.started_at || now - ts(call.started_at) < STALE_LIVE_MS);

export function formatCallDuration(sec: unknown, t: Translate = fill) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  if (s < 60) return t("{n} s", { n: s });
  const min = Math.round(s / 60);
  if (min < 60) return t("{n} min", { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t("{h} godz. {m} min", { h, m }) : t("{h} godz.", { h });
}

export interface CallMessageView {
  callId: string | null;
  kind: "audio" | "video";
  status: string;
  mine: boolean;
  live: boolean;
  isGroup: boolean;
  tone: "normal" | "missed" | "live";
  title: string;
  durationText: string | null;
  canCallBack: boolean;
  callBackLabel: string;
}

// Wiadomość „połączenie”: tytuł, ton (nieodebrane na czerwono), czas trwania, „Oddzwoń”/„Dołącz”.
// live — gdy wiadomo lepiej (lista trwających połączeń), nadpisuje status z metadanych.
export function callMessageView(
  message: { metadata?: unknown; sender_email?: string | null } | null | undefined,
  myEmail: string | null | undefined,
  t: Translate = fill,
  { live: liveOverride = null }: { live?: boolean | null } = {},
): CallMessageView {
  const meta = parseMetadata(message?.metadata);
  const kind = meta.kind === "video" ? "video" : "audio";
  const video = kind === "video";
  const status = String(meta.status || "ended");
  const caller = meta.started_by_email || meta.started_by || message?.sender_email || null;
  const mine = !!caller && !!myEmail && norm(caller) === norm(myEmail);
  // Ostateczny status (nieodebrane, zakończone…) wygrywa z nieaktualnym „trwa”.
  const final = !!meta.status && ENDED_STATUSES.has(status);
  const live = final ? false : liveOverride != null ? !!liveOverride : LIVE_STATUSES.has(status);
  const isGroup = !!(meta.is_group ?? meta.group);
  const duration = Number(meta.duration_sec) || 0;
  let title: string;
  let tone: CallMessageView["tone"] = "normal";
  if (live) {
    tone = "live";
    if (isGroup) title = video ? t("Rozmowa grupowa wideo trwa") : t("Rozmowa grupowa trwa");
    else title = video ? t("Trwa połączenie wideo") : t("Trwa połączenie głosowe");
  } else if (isGroup) {
    if (status === "ended" || LIVE_STATUSES.has(status)) {
      title = video ? t("Rozmowa grupowa wideo") : t("Rozmowa grupowa");
    } else {
      tone = "missed";
      title = mine ? t("Nikt nie dołączył do rozmowy") : video ? t("Nieodebrana rozmowa grupowa wideo") : t("Nieodebrana rozmowa grupowa");
    }
  } else if (status === "missed" || (status === "cancelled" && !mine)) {
    tone = "missed";
    if (mine) title = t("Połączenie bez odpowiedzi");
    else title = video ? t("Nieodebrane połączenie wideo") : t("Nieodebrane połączenie");
  } else if (status === "declined") {
    tone = "missed";
    title = mine ? t("Połączenie odrzucone") : t("Odrzucono połączenie");
  } else if (status === "cancelled") {
    title = t("Połączenie anulowane");
  } else {
    title = video ? t("Połączenie wideo") : t("Połączenie głosowe");
  }
  const ended = !live && (status === "ended" || LIVE_STATUSES.has(status));
  return {
    callId: meta.call_id || null,
    kind,
    status,
    mine,
    live,
    isGroup,
    tone,
    title,
    durationText: ended && duration > 0 ? formatCallDuration(duration, t) : null,
    canCallBack: !live && (status === "missed" || status === "declined" || status === "cancelled"),
    callBackLabel: mine ? t("Zadzwoń ponownie") : t("Oddzwoń"),
  };
}

// Ścieżka webu: rozmowa + automatyczne dołączenie / rozpoczęcie (web: KomunikatorModule, ?join=).
export const webCallPath = (conversationId: string, kind: "audio" | "video") =>
  `/komunikator?conversation=${encodeURIComponent(conversationId)}&join=${kind}`;

// Nieodebrane, odrzucone… — stan końcowy wiersza calls.
export const isEndedStatus = (status: unknown) => ENDED_STATUSES.has(String(status));

// Zegar rozmowy „mm:ss” / „h:mm:ss” (web callLogic.formatClock).
export function formatClock(ms: unknown) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Goście z linku — poczekalnia (lustro webowego guestLogic.js: lobbyQueue, applyGuestRequest) ──
export interface GuestRequestRow {
  id: string;
  conversation_id: string;
  guest_name?: string | null;
  status: string;
  created_at?: string | null;
}

// Prośby gości do pokazania (oczekujące w tej rozmowie, najstarsze pierwsze).
export function lobbyQueue(requests: Record<string, GuestRequestRow> | null | undefined, conversationId: string | null | undefined) {
  if (!conversationId) return [] as GuestRequestRow[];
  return Object.values(requests || {})
    .filter((r) => r && r.status === "pending" && String(r.conversation_id) === String(conversationId))
    .sort((a, b) => (Date.parse(a.created_at || "") || 0) - (Date.parse(b.created_at || "") || 0));
}

// Zmiana wiersza poczekalni (realtime / odczyt) → nowa mapa id → wiersz (tylko oczekujące).
export function applyGuestRequest(map: Record<string, GuestRequestRow> | null | undefined, row: GuestRequestRow | null | undefined) {
  if (!row?.id) return map || {};
  const next = { ...(map || {}) };
  if (row.status === "pending") next[row.id] = row;
  else delete next[row.id];
  return next;
}

// ── Błędy API połączeń (web callLogic: isCallsDisabledError / isCallGoneError) ──
export interface CallApiError { status?: number; code?: string | null; message?: string }
export const isCallsDisabledError = (err: CallApiError | null | undefined) =>
  !!err && err.status === 503 && (err.code === "calls_disabled" || /calls_disabled/i.test(String(err.message || "")));
export const isCallGoneError = (err: CallApiError | null | undefined) =>
  !!err && (err.status === 410 || err.code === "CALL_ENDED");

// Inicjały do kafelka bez obrazu („Anna Nowak” → „AN”).
export function initials(name: string | null | undefined) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}

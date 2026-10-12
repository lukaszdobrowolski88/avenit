// Silnik rozmów natywnych (bez Reacta): CallKit (iOS) / Core-Telecom (Android) przez
// expo-callkit-telecom + media przez LiveKit. Odpowiednik webowego CallProvider — ta sama kolejność
// funkcji serwera (call-start / call-join / call-decline / call-cancel / call-leave) i te same
// zasady kończenia (web callLogic.js), ale dzwonek i ekran przychodzącego połączenia są systemowe.
//
//  • Wychodzące: startOutgoingCall (systemowe połączenie, sygnał oczekiwania) → call-start /
//    call-join → pokój LiveKit → reportOutgoingCallConnected, gdy druga strona dołączy (albo od razu
//    przy dołączaniu do trwającej rozmowy / spotkania).
//  • Przychodzące: push VoIP zgłasza połączenie natywnie (także przy zamkniętej apce); tu tylko
//    pilnujemy, czy nadal dzwoni (anulowane / nieodebrane / odebrane na innym urządzeniu → koniec),
//    a po odebraniu: call-join → pokój → fulfillIncomingCallConnected.
//  • Zakończenie z systemowego UI: przed odebraniem call-decline, potem call-leave; dzwoniący przed
//    odebraniem — call-cancel.
//
// Jedna rozmowa naraz (CallKit w expo-callkit-telecom i tak ma jedną sesję). Stan dla UI —
// subscribe/getCallState (useSyncExternalStore w hooks.ts).
import { Alert, AppState, Linking, Platform } from "react-native";
import type { LocalVideoTrack, Room } from "livekit-client";
import type { CallEndedReason, CallIntentReceivedEvent, CallSession, AudioRouteChangedEvent } from "expo-callkit-telecom";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../lib/toast";
import { queryClient } from "../../../lib/query-client";
import { openOnWeb } from "../../modules/useModules";
import { emailPattern, normEmail, sameEmail } from "../../messenger/logic";
import { findExistingDirect } from "../../messenger/start";
import {
  applyGuestRequest,
  isCallGoneError,
  isCallsDisabledError,
  isEndedStatus,
  lobbyQueue,
  webCallPath,
  type CallApiError,
  type GuestRequestRow,
} from "../logic";
import { callkit, loadLiveKit, nativeCallsAvailable } from "./modules";

export type CallKind = "audio" | "video";
// starting — rejestracja u systemu i serwera; ringing — dzwonię, czekam na odbiór;
// connecting — odebrane, łączę media; active — rozmowa trwa.
export type CallPhase = "starting" | "ringing" | "connecting" | "active";

export interface CurrentCall {
  key: number;
  nativeId: string | null;
  callId: string | null;
  conversationId: string;
  kind: CallKind;
  direction: "outgoing" | "incoming";
  isGroup: boolean;
  title: string;
  phase: CallPhase;
  connectedAt: number | null;
  roomReady: boolean;
  reconnecting: boolean;
  canPublish: boolean;
  micOn: boolean;
  camOn: boolean;
  frontCamera: boolean;
  speaker: boolean;
  held: boolean;
  guests: GuestRequestRow[];
  // Licznik próśb o pokazanie ekranu rozmowy (host nawigacji reaguje na zmianę).
  screenRequest: number;
}

interface CallRow {
  id: string;
  conversation_id?: string;
  status: string;
  is_group?: boolean;
  kind?: CallKind;
  answered_at?: string | null;
}

interface StartResponse {
  call: CallRow;
  token: string;
  url: string;
  room?: string;
  can_publish?: boolean;
  joined_existing?: boolean;
}

// Połączenie przychodzące zgłoszone systemowi (jeszcze nieodebrane albo właśnie odbierane).
interface Ringing {
  nativeId: string;
  callId: string;
  conversationId: string;
  kind: CallKind;
  isGroup: boolean;
  title: string;
  answered: boolean;
}

// ── Stan ────────────────────────────────────────────────────────────────────
let current: CurrentCall | null = null;
let room: Room | null = null;
let op = 0;
const ringing = new Map<string, Ringing>();
const sessions = new Map<string, CallSession>();
const listeners = new Set<() => void>();
let guestMap: Record<string, GuestRequestRow> = {};
let cameraPending = false; // wideo odebrane przy zablokowanym ekranie — kamera po powrocie do apki
let micBeforeHold: boolean | null = null;
let myEmail: string | null = null;

const emit = () => {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* słuchacz UI — nie przerywa silnika */
    }
  }
};

export function subscribeCall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const getCallState = () => current;
export const getRoom = () => room;

function patch(key: number, changes: Partial<CurrentCall>) {
  if (!current || current.key !== key) return;
  current = { ...current, ...changes };
  emit();
}

// Czy to połączenie obsługuje już system (push VoIP / bieżąca rozmowa) — zwykłe powiadomienie
// „dzwoni” z tym samym call_id nie musi wtedy wyskakiwać banerem.
export function isCallHandledNatively(callId: string | null | undefined) {
  if (!callId) return false;
  if (current?.callId === callId) return true;
  for (const r of ringing.values()) if (r.callId === callId) return true;
  return false;
}

// ── Serwer ──────────────────────────────────────────────────────────────────
async function fn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body, silent: true } as never);
  if (error) {
    const e = error as { message?: string; status?: number; context?: { error?: string; code?: string } };
    const err = new Error(e.context?.error || e.message || "Nie udało się połączyć.") as Error & CallApiError;
    err.status = e.status;
    err.code = e.context?.code ?? null;
    throw err;
  }
  return (data ?? {}) as T;
}

async function me(): Promise<string | null> {
  if (myEmail) return myEmail;
  try {
    const { data } = await supabase.auth.getSession();
    myEmail = data.session?.user?.email ?? null;
  } catch {
    /* brak sesji */
  }
  return myEmail;
}

interface ConversationInfo {
  id: string;
  type: string | null;
  name: string;
}

// Nazwa rozmowy do ekranu i systemowego UI (1:1 — imię drugiej osoby), jak web conversationInfo.
async function conversationInfo(id: string): Promise<ConversationInfo | null> {
  const { data: conv } = await supabase.from("conversations").select("id, name, type").eq("id", id).maybeSingle();
  if (!conv) return null;
  const c = conv as { id: string; name?: string | null; type?: string | null };
  let name = String(c.name || "").trim();
  if (c.type === "direct") {
    const mine = await me();
    const { data: parts } = await supabase.from("conversation_participants").select("user_email").eq("conversation_id", id);
    const other = ((parts ?? []) as { user_email: string }[]).find((p) => !sameEmail(p.user_email, mine))?.user_email;
    if (other) {
      const { data: u } = await supabase
        .from("app_users")
        .select("email, full_name")
        .ilike("email", emailPattern(other))
        .limit(1)
        .maybeSingle();
      name = String((u as { full_name?: string } | null)?.full_name || other);
    }
  }
  return { id: String(c.id), type: c.type ?? null, name: name || "Rozmowa" };
}

const refreshLiveCall = (conversationId: string | null | undefined) => {
  if (conversationId) queryClient.invalidateQueries({ queryKey: ["live-call", conversationId] });
};

// ── Realtime + zapasowe odpytywanie ─────────────────────────────────────────
// Kanał tylko wtedy, gdy coś dzwoni albo trwa. Shim realtime ignoruje filtry — odsiewamy tutaj.
const CHANNEL = "calls-native";
let channel: ReturnType<typeof supabase.channel> | null = null;
let poll: ReturnType<typeof setInterval> | null = null;

function ensureWatch() {
  if (!channel) {
    for (const c of supabase.getChannels()) if (c.topic === `realtime:${CHANNEL}`) supabase.removeChannel(c);
    channel = supabase
      .channel(CHANNEL)
      .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (payload) => {
        const row = payload.new as CallRow | null;
        if (row?.id) onCallRow(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "call_participants" }, (payload) => {
        const row = payload.new as { call_id?: string; user_email?: string; response?: string | null; joined_at?: string | null } | null;
        if (row?.call_id) onParticipantRow(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "call_guest_requests" }, (payload) => {
        const row = payload.new as GuestRequestRow | null;
        if (row?.id) onGuestRow(row);
      })
      .subscribe();
  }
  // Realtime w tle bywa zerwane (telefon zablokowany) — stan połączenia sprawdzamy też co kilka sekund.
  if (!poll) poll = setInterval(() => void pollCalls(), 4000);
}

function releaseWatchIfIdle() {
  if (current || ringing.size) return;
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  if (poll) {
    clearInterval(poll);
    poll = null;
  }
}

// undefined — nie udało się sprawdzić (sieć); null — nie ma takiego połączenia (albo brak dostępu).
async function fetchCall(callId: string): Promise<CallRow | null | undefined> {
  try {
    const { data, error } = await supabase
      .from("calls")
      .select("id, conversation_id, status, is_group, kind, answered_at, ended_at")
      .eq("id", callId)
      .maybeSingle();
    if (error) return undefined;
    return (data as CallRow | null) ?? null;
  } catch {
    return undefined;
  }
}

async function pollCalls() {
  const ids = new Set<string>();
  for (const r of ringing.values()) if (!r.answered) ids.add(r.callId);
  if (current?.callId) ids.add(current.callId);
  for (const id of ids) {
    const row = await fetchCall(id);
    if (row) onCallRow(row);
  }
  for (const r of ringing.values()) if (!r.answered) void checkMyResponse(r);
}

// Odebrałem/odrzuciłem na innym urządzeniu (mój wiersz call_participants).
async function checkMyResponse(r: Ringing) {
  const mine = await me();
  if (!mine) return;
  try {
    const { data } = await supabase
      .from("call_participants")
      .select("call_id, user_email, response, joined_at")
      .eq("call_id", r.callId)
      .ilike("user_email", emailPattern(mine))
      .limit(1)
      .maybeSingle();
    if (data) onParticipantRow(data as { call_id: string; user_email: string; response?: string | null; joined_at?: string | null });
  } catch {
    /* sieć — następna próba */
  }
}

function ringingByCall(callId: string) {
  for (const r of ringing.values()) if (r.callId === callId) return r;
  return null;
}

function onCallRow(row: CallRow) {
  // Dzwoni u mnie: koniec, gdy rozmowa się skończyła albo (1:1) odebrano ją gdzie indziej.
  // Grupa: status zostaje 'ringing', gdy inni odbierają, i przechodzi w 'active' dopiero po 45 s —
  // tam „odebrane gdzie indziej” rozpoznajemy tylko po MOIM wierszu call_participants.
  const r = ringingByCall(row.id);
  if (r && !r.answered) {
    const group = row.is_group ?? r.isGroup;
    if (isEndedStatus(row.status)) void endRinging(r, row.status === "missed" ? "unanswered" : "remoteEnded");
    else if (!group && row.status === "active") void endRinging(r, "answeredElsewhere");
  }
  // Moja bieżąca rozmowa.
  if (current && current.callId === row.id) {
    if (isEndedStatus(row.status)) {
      const waiting = current.direction === "outgoing" && current.phase !== "active";
      const notify = waiting
        ? row.status === "declined"
          ? "Połączenie odrzucone"
          : row.status === "missed"
            ? "Nikt nie odebrał"
            : "Rozmowa zakończona"
        : "Rozmowa zakończona";
      void finishCurrent({ server: "none", reason: row.status === "missed" ? "unanswered" : "remoteEnded", notify });
    } else if (row.status === "active" && current.phase === "ringing") {
      markConnected(current.key);
    }
  }
}

function onParticipantRow(row: { call_id?: string; user_email?: string; response?: string | null; joined_at?: string | null }) {
  if (!row.call_id || !myEmail || !sameEmail(row.user_email, myEmail)) return;
  const r = ringingByCall(row.call_id);
  if (!r || r.answered) return;
  if (row.response === "declined") void endRinging(r, "declinedElsewhere");
  else if (row.response === "accepted" || row.joined_at) void endRinging(r, "answeredElsewhere");
}

async function endRinging(r: Ringing, reason: CallEndedReason) {
  if (!ringing.has(r.nativeId) || r.answered) return;
  ringing.delete(r.nativeId);
  try {
    await callkit()?.reportCallEnded(r.nativeId, reason);
  } catch {
    /* sesja już zamknięta */
  }
  releaseWatchIfIdle();
}

// ── Goście (poczekalnia) ────────────────────────────────────────────────────
function syncGuests() {
  if (!current) return;
  const guests = lobbyQueue(guestMap, current.conversationId);
  patch(current.key, { guests });
}

function onGuestRow(row: GuestRequestRow) {
  guestMap = applyGuestRequest(guestMap, row);
  syncGuests();
}

async function loadGuests(conversationId: string) {
  try {
    const { data, error } = await supabase
      .from("call_guest_requests")
      .select("id, conversation_id, guest_name, status, created_at")
      .eq("conversation_id", conversationId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error || !Array.isArray(data)) return;
    const next: Record<string, GuestRequestRow> = {};
    for (const [id, r] of Object.entries(guestMap)) if (String(r.conversation_id) !== String(conversationId)) next[id] = r;
    for (const r of data as GuestRequestRow[]) next[r.id] = r;
    guestMap = next;
    syncGuests();
  } catch {
    /* tenant bez poczekalni gości */
  }
}

// Wpuść / Odrzuć gościa (jak web decideGuest): optymistycznie znika z kolejki, błąd przywraca.
export async function decideGuest(requestId: string, admit: boolean) {
  const row = guestMap[requestId] ?? null;
  const next = { ...guestMap };
  delete next[requestId];
  guestMap = next;
  syncGuests();
  try {
    await fn(admit ? "call-guest-admit" : "call-guest-deny", { request_id: requestId });
    if (admit && row?.guest_name) toast.info(`Wpuszczono: ${row.guest_name}`);
  } catch (e) {
    const err = e as CallApiError;
    const closed = err.code === "REQUEST_CLOSED" || err.status === 404;
    if (closed) toast.info("Ta osoba już nie czeka na wejście.");
    else {
      if (row) {
        guestMap = applyGuestRequest(guestMap, row);
        syncGuests();
      }
      toast.error(e, admit ? "Nie udało się wpuścić gościa." : "Nie udało się odrzucić prośby.");
    }
  }
}

// ── Pokój LiveKit ───────────────────────────────────────────────────────────
function syncLocal(key: number) {
  const r = room;
  if (!r || !current || current.key !== key) return;
  const lp = r.localParticipant;
  patch(key, { micOn: !!lp.isMicrophoneEnabled, camOn: !!lp.isCameraEnabled });
}

async function connectRoom(key: number, data: StartResponse, kind: CallKind) {
  const { client } = loadLiveKit();
  const { Room: LkRoom, RoomEvent, VideoPresets } = client;
  const r = new LkRoom({
    // Jakość obrazu wg rozmiaru kafelka i gęstości ekranu; niewidoczne kafelki nie pobierają obrazu.
    adaptiveStream: { pixelDensity: "screen" },
    dynacast: true,
    videoCaptureDefaults: { resolution: VideoPresets.h540.resolution, facingMode: "user" },
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    publishDefaults: { simulcast: true, videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360], dtx: true, red: true },
  });
  room = r;
  const canPublish = data.can_publish !== false;

  r.on(RoomEvent.ParticipantConnected, () => {
    if (current?.key === key && current.phase === "ringing") markConnected(key);
    emit();
  });
  r.on(RoomEvent.ParticipantDisconnected, () => emit());
  r.on(RoomEvent.Reconnecting, () => patch(key, { reconnecting: true }));
  r.on(RoomEvent.Reconnected, () => patch(key, { reconnecting: false }));
  for (const ev of [RoomEvent.LocalTrackPublished, RoomEvent.LocalTrackUnpublished, RoomEvent.TrackMuted, RoomEvent.TrackUnmuted]) {
    r.on(ev, () => syncLocal(key));
  }
  r.on(RoomEvent.Disconnected, () => {
    // Rozłączone nie przez nas (pokój zamknięty, utrata sieci na dłużej) — koniec rozmowy.
    if (room !== r) return;
    if (current?.key === key) void finishCurrent({ server: "leave", reason: "remoteEnded", notify: "Rozmowa zakończona" });
  });

  // Tylko przyspieszenie (DNS/TLS) — błąd bez znaczenia.
  Promise.resolve()
    .then(() => r.prepareConnection(data.url, data.token))
    .catch(() => undefined);
  await r.connect(data.url, data.token, { autoSubscribe: true });
  if (room !== r || current?.key !== key) {
    await r.disconnect();
    throw new Error("aborted");
  }
  patch(key, { roomReady: true, canPublish });

  if (canPublish) {
    if (await ensureMediaAccess("microphone")) {
      try {
        await r.localParticipant.setMicrophoneEnabled(true);
      } catch {
        toast.info("Nie udało się włączyć mikrofonu", "Sprawdź dostęp do mikrofonu w Ustawieniach.");
      }
    }
    if (kind === "video") {
      // Przy zablokowanym ekranie / apce w tle system nie da kamery — włączymy ją po powrocie.
      if (AppState.currentState === "active") await enableCamera(key, true);
      else cameraPending = true;
    }
  }
  syncLocal(key);
}

// Dostęp do aparatu / mikrofonu przed włączeniem: brak decyzji → systemowe pytanie; wcześniejsza
// odmowa (iOS nie zapyta drugi raz, np. po odmowie przy zdjęciu w czacie) → okno z przejściem do
// Ustawień zamiast znikającego komunikatu.
const MEDIA_TEXT = {
  camera: { title: "Brak dostępu do aparatu", body: "Aby pokazać obraz z kamery, zezwól Avenit na dostęp do aparatu w Ustawieniach." },
  microphone: { title: "Brak dostępu do mikrofonu", body: "Aby rozmówcy Cię słyszeli, zezwól Avenit na dostęp do mikrofonu w Ustawieniach." },
} as const;
async function ensureMediaAccess(kind: "camera" | "microphone"): Promise<boolean> {
  let granted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { permissions } = require("@livekit/react-native-webrtc") as {
      permissions: { query(d: { name: string }): Promise<string>; request(d: { name: string }): Promise<unknown> };
    };
    const state = await permissions.query({ name: kind });
    if (state === "granted") return true;
    if (state === "prompt") {
      const res = await permissions.request({ name: kind });
      granted = res === true || res === "granted";
    } else {
      granted = false;
    }
  } catch {
    return true; // nie umiemy sprawdzić — niech spróbuje sam getUserMedia
  }
  if (!granted) {
    const t = MEDIA_TEXT[kind];
    Alert.alert(t.title, t.body, [
      { text: "Nie teraz", style: "cancel" },
      { text: "Otwórz ustawienia", onPress: () => void Linking.openSettings().catch(() => undefined) },
    ]);
  }
  return granted;
}

async function enableCamera(key: number, on: boolean) {
  const r = room;
  if (!r || !current || current.key !== key) return;
  if (on && !(await ensureMediaAccess("camera"))) {
    syncLocal(key);
    return;
  }
  try {
    await r.localParticipant.setCameraEnabled(on);
    if (current.nativeId) callkit()?.reportVideo(current.nativeId, on).catch(() => undefined);
  } catch {
    if (on) toast.info("Nie udało się włączyć kamery", "Spróbuj ponownie albo sprawdź dostęp do aparatu w Ustawieniach.");
  }
  syncLocal(key);
}

function markConnected(key: number) {
  if (!current || current.key !== key || current.phase === "active") return;
  const outgoing = current.direction === "outgoing";
  const nativeId = current.nativeId;
  patch(key, { phase: "active", connectedAt: Date.now() });
  if (outgoing && nativeId) callkit()?.reportOutgoingCallConnected(nativeId).catch(() => undefined);
  refreshLiveCall(current?.conversationId);
}

// ── Kończenie ───────────────────────────────────────────────────────────────
// server: 'auto' — dzwoniący przed odebraniem → call-cancel, inaczej call-leave; 'none' — serwer
// już wie (rozmowa zakończona po jego stronie). reason — zgłoś systemowi koniec (gdy nie zakończył
// go sam użytkownik w systemowym UI).
async function finishCurrent({
  server,
  reason = null,
  notify = null,
}: {
  server: "auto" | "leave" | "cancel" | "none";
  reason?: CallEndedReason | null;
  notify?: string | null;
}) {
  const cur = current;
  if (!cur) return;
  op += 1;
  const r = room;
  const remoteCount = r?.remoteParticipants?.size ?? 0;
  current = null;
  room = null;
  cameraPending = false;
  micBeforeHold = null;
  guestMap = {};
  emit();
  if (r) {
    try {
      await r.disconnect();
    } catch {
      /* już rozłączony */
    }
  }
  if (cur.callId && server !== "none") {
    const name =
      server === "cancel" || (server === "auto" && cur.direction === "outgoing" && cur.phase !== "active" && remoteCount === 0)
        ? "call-cancel"
        : "call-leave";
    fn(name, { call_id: cur.callId }).catch(() => undefined);
  }
  if (reason && cur.nativeId) callkit()?.reportCallEnded(cur.nativeId, reason).catch(() => undefined);
  if (notify) toast.info(notify);
  refreshLiveCall(cur.conversationId);
  releaseWatchIfIdle();
}

function apiErrorToast(err: unknown, fallback: string) {
  const e = err as CallApiError;
  if (isCallsDisabledError(e)) {
    queryClient.setQueryData(["call-config"], { enabled: false });
    toast.info("Połączenia audio i wideo nie są jeszcze włączone.", "Zapytaj administratora.");
  } else if (isCallGoneError(e)) {
    toast.info("To połączenie już się zakończyło");
  } else {
    toast.error(err, fallback);
  }
}

// ── Akcje (UI) ──────────────────────────────────────────────────────────────
export interface StartOptions {
  conversationId: string;
  kind: CallKind;
  // Trwająca rozmowa, do której dołączam (baner, „Dołącz”) — bez niej call-start (serwer i tak
  // dołącza do trwającej, jeśli jest).
  callId?: string | null;
  title?: string | null;
  isGroup?: boolean;
}

function newCall(o: Partial<CurrentCall> & Pick<CurrentCall, "conversationId" | "kind" | "direction" | "title">): CurrentCall {
  op += 1;
  return {
    key: op,
    nativeId: null,
    callId: null,
    isGroup: false,
    phase: "starting",
    connectedAt: null,
    roomReady: false,
    reconnecting: false,
    canPublish: true,
    micOn: true,
    camOn: o.kind === "video",
    frontCamera: true,
    // Wideo — głośnik, głos — słuchawka (jak domyślna konfiguracja sesji audio CallKit).
    speaker: o.kind === "video",
    held: false,
    guests: [],
    screenRequest: 1,
    ...o,
  };
}

// Zadzwoń / dołącz. Jako połączenie systemowe (CallKit / Telecom), żeby sesja audio, ekran blokady
// i przerwania (połączenie GSM) działały jak w telefonie. Bez modułów natywnych — przeglądarka.
export async function startOrJoinCall(opts: StartOptions) {
  const { conversationId, kind } = opts;
  if (!conversationId) return;
  const CK = callkit();
  if (!CK || !nativeCallsAvailable()) {
    await openOnWeb(webCallPath(conversationId, kind));
    return;
  }
  if (current) {
    if (current.conversationId === conversationId) showCallScreen();
    else toast.info("Najpierw zakończ bieżącą rozmowę.");
    return;
  }
  if (ringing.size) {
    // „Dołącz” w apce przy połączeniu, które właśnie u mnie dzwoni — odbierz je systemowo.
    const same = Array.from(ringing.values()).find(
      (r) => !r.answered && ((opts.callId && r.callId === opts.callId) || r.conversationId === conversationId),
    );
    if (same) {
      CK.answerCall(same.nativeId).catch((e) => toast.error(e, "Nie udało się odebrać połączenia"));
      return;
    }
    toast.info("Najpierw odbierz albo odrzuć połączenie przychodzące.");
    return;
  }
  const call = newCall({
    conversationId,
    kind,
    direction: "outgoing",
    title: opts.title || "Rozmowa",
    callId: opts.callId ?? null,
    isGroup: !!opts.isGroup,
  });
  const key = call.key;
  current = call;
  ensureWatch();
  emit();
  void me();
  if (!opts.title) {
    const info = await conversationInfo(conversationId).catch(() => null);
    if (info) patch(key, { title: info.name, isGroup: info.type !== "direct" });
  }

  let nativeId: string;
  try {
    nativeId = await CK.startOutgoingCall(
      // Bez e-maila/telefonu: uchwyt „generic” — system pokazuje nazwę (displayName), a ponowne
      // wybranie z Ostatnich przychodzi jako id rozmowy.
      { id: conversationId, displayName: current?.title || opts.title || "Rozmowa" },
      { hasVideo: kind === "video" },
    );
  } catch (e) {
    if (current?.key === key) {
      current = null;
      emit();
      releaseWatchIfIdle();
    }
    toast.error(e, "Nie udało się rozpocząć połączenia");
    return;
  }
  if (current?.key !== key) {
    CK.endCall(nativeId).catch(() => undefined);
    return;
  }
  patch(key, { nativeId });

  let data: StartResponse;
  try {
    data = opts.callId
      ? await fn<StartResponse>("call-join", { call_id: opts.callId })
      : await fn<StartResponse>("call-start", { conversation_id: conversationId, kind });
  } catch (err) {
    if (current?.key === key) await finishCurrent({ server: "none", reason: "failed" });
    if (isCallGoneError(err as CallApiError)) refreshLiveCall(conversationId);
    apiErrorToast(err, "Nie udało się rozpocząć połączenia. Spróbuj ponownie.");
    return;
  }
  const joinedExisting = !!opts.callId || !!data.joined_existing;
  if (current?.key !== key) {
    // Rozłączono w trakcie — nie zostawiaj dzwoniącego połączenia.
    if (data.call?.id) fn(joinedExisting ? "call-leave" : "call-cancel", { call_id: data.call.id }).catch(() => undefined);
    return;
  }
  patch(key, { callId: data.call.id, isGroup: !!data.call.is_group, canPublish: data.can_publish !== false });
  refreshLiveCall(conversationId);
  void loadGuests(conversationId);

  try {
    await connectRoom(key, data, kind);
  } catch (err) {
    if ((err as Error)?.message === "aborted") return;
    if (current?.key === key) await finishCurrent({ server: "auto", reason: "failed" });
    toast.error(err, "Nie udało się połączyć z rozmową. Sprawdź internet i spróbuj ponownie.");
    return;
  }
  if (current?.key !== key) return;
  const remotePresent = (room?.remoteParticipants?.size ?? 0) > 0;
  if (joinedExisting || remotePresent || data.call.status === "active") markConnected(key);
  else patch(key, { phase: "ringing" });
}

// Rozłącz (przycisk w apce). Systemowe zakończenie wywoła onCallEnded → finishCurrent.
export async function hangUp() {
  const cur = current;
  if (!cur) return;
  const CK = callkit();
  if (CK && cur.nativeId) {
    try {
      await CK.endCall(cur.nativeId);
      // Zapas: gdyby zdarzenie końca nie wróciło (np. sesja już zniknęła u systemu).
      setTimeout(() => {
        if (current?.key === cur.key) void finishCurrent({ server: "auto" });
      }, 1500);
      return;
    } catch {
      /* sesja nieznana systemowi — kończymy sami */
    }
  }
  await finishCurrent({ server: "auto" });
}

async function applyMic(on: boolean) {
  const cur = current;
  const r = room;
  if (!cur || !r || !cur.canPublish) return;
  if (on && !(await ensureMediaAccess("microphone"))) {
    syncLocal(cur.key);
    return;
  }
  try {
    await r.localParticipant.setMicrophoneEnabled(on);
  } catch {
    if (on) toast.info("Nie udało się włączyć mikrofonu", "Sprawdź dostęp do mikrofonu w Ustawieniach.");
  }
  syncLocal(cur.key);
}

export async function toggleMic() {
  const cur = current;
  if (!cur) return;
  const next = !cur.micOn;
  await applyMic(next);
  // Systemowe UI (CallKit) pokazuje ten sam stan wyciszenia.
  if (cur.nativeId) callkit()?.setMuted(cur.nativeId, !next).catch(() => undefined);
}

export async function toggleCamera() {
  const cur = current;
  if (!cur || !cur.canPublish) return;
  cameraPending = false;
  await enableCamera(cur.key, !cur.camOn);
}

export async function flipCamera() {
  const cur = current;
  const r = room;
  if (!cur || !r || !cur.camOn) return;
  try {
    const { client } = loadLiveKit();
    const pub = r.localParticipant.getTrackPublication(client.Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const front = !cur.frontCamera;
    await track.restartTrack({ facingMode: front ? "user" : "environment" });
    patch(cur.key, { frontCamera: front });
  } catch (e) {
    toast.error(e, "Nie udało się przełączyć aparatu");
  }
}

export function toggleSpeaker() {
  const cur = current;
  if (!cur) return;
  const next = !cur.speaker;
  try {
    callkit()?.setAudioSessionPortOverride(next);
  } catch {
    /* brak sesji audio */
  }
  patch(cur.key, { speaker: next });
}

export function showCallScreen() {
  if (!current) return;
  patch(current.key, { screenRequest: current.screenRequest + 1 });
}

// ── Zdarzenia systemu (CallKit / Telecom) ───────────────────────────────────
async function findSession(nativeId: string): Promise<CallSession | null> {
  const known = sessions.get(nativeId);
  if (known) return known;
  try {
    const s = await callkit()?.getActiveCallSession();
    if (s && s.id === nativeId) return s;
  } catch {
    /* brak sesji */
  }
  return null;
}

async function onIncomingReported(nativeId: string, given?: CallSession | null) {
  const CK = callkit();
  if (!CK) return null;
  const existing = ringing.get(nativeId);
  if (existing) return existing;
  const session = given ?? (await findSession(nativeId));
  const ev = session?.incomingCallEvent;
  if (!ev?.serverCallId) return null;
  if (ringing.has(nativeId)) return ringing.get(nativeId) ?? null;
  const meta = (ev.metadata ?? {}) as Record<string, unknown>;
  const r: Ringing = {
    nativeId,
    callId: String(ev.serverCallId),
    conversationId: String(meta.conversationId ?? ""),
    kind: ev.hasVideo || meta.kind === "video" ? "video" : "audio",
    isGroup: String(meta.isGroup) === "true",
    title: String(ev.caller?.displayName || meta.callerName || "Połączenie"),
    answered: false,
  };
  ringing.set(nativeId, r);
  // Zajęty inną rozmową — nie przerywamy jej (dzwoniący zobaczy „nieodebrane” po czasie).
  if (current && current.nativeId !== nativeId) {
    void endRinging(r, "failed");
    return null;
  }
  ensureWatch();
  await me();
  const row = await fetchCall(r.callId);
  // Push z innego kościoła niż zalogowany (zmiana konta na tym telefonie) — nie obsłużymy.
  const tenant = String(meta.tenant ?? "");
  const mine = supabase.getTenant();
  if (tenant && mine && tenant !== mine) {
    void endRinging(r, "failed");
    return null;
  }
  if (row) onCallRow(row);
  else if (row === null && !r.answered) {
    // Nie ma takiego połączenia / brak dostępu (np. stary push) — kończymy dzwonienie. Bez sesji
    // (wylogowany na tym telefonie) też: nie da się odebrać.
    void endRinging(r, "failed");
  }
  if (ringing.has(nativeId)) void checkMyResponse(r);
  return ringing.get(nativeId) ?? null;
}

async function onAnswered(nativeId: string, requestId: string) {
  const CK = callkit();
  if (!CK) return;
  const r = ringing.get(nativeId) ?? (await onIncomingReported(nativeId));
  if (!r || (current && current.nativeId !== nativeId)) {
    CK.failIncomingCallConnected(nativeId, requestId).catch(() => undefined);
    if (r) ringing.delete(nativeId);
    return;
  }
  r.answered = true;
  const call = newCall({
    nativeId,
    callId: r.callId,
    conversationId: r.conversationId,
    kind: r.kind,
    direction: "incoming",
    isGroup: r.isGroup,
    title: r.title,
    phase: "connecting",
  });
  const key = call.key;
  current = call;
  ensureWatch();
  emit();
  // Rozmowa grupowa — nazwa grupy zamiast osoby dzwoniącej.
  if (r.conversationId) {
    conversationInfo(r.conversationId)
      .then((info) => {
        if (info && info.type !== "direct") patch(key, { title: info.name });
      })
      .catch(() => undefined);
  }

  const fail = (err: unknown) => {
    ringing.delete(nativeId);
    if (current?.key === key) {
      op += 1;
      const rr = room;
      current = null;
      room = null;
      emit();
      rr?.disconnect().catch(() => undefined);
    }
    CK.failIncomingCallConnected(nativeId, requestId).catch(() => undefined);
    releaseWatchIfIdle();
    if ((err as Error)?.message !== "aborted") apiErrorToast(err, "Nie udało się połączyć z rozmową. Sprawdź internet i spróbuj ponownie.");
  };

  let data: StartResponse;
  try {
    data = await fn<StartResponse>("call-join", { call_id: r.callId });
  } catch (err) {
    fail(err);
    return;
  }
  if (current?.key !== key) {
    fn("call-leave", { call_id: r.callId }).catch(() => undefined);
    return;
  }
  patch(key, { isGroup: !!data.call?.is_group, canPublish: data.can_publish !== false });
  void loadGuests(r.conversationId);
  try {
    await connectRoom(key, data, r.kind);
  } catch (err) {
    fn("call-leave", { call_id: r.callId }).catch(() => undefined);
    fail(err);
    return;
  }
  ringing.delete(nativeId);
  try {
    await CK.fulfillIncomingCallConnected(requestId);
  } catch {
    /* przekroczony czas — system i tak pokaże rozmowę jako trwającą albo zakończoną */
  }
  markConnected(key);
}

// Koniec zgłoszony przez system: użytkownik rozłączył/odrzucił w systemowym UI (reason 'user'),
// minął czas dzwonienia ('unanswered') albo to nasze własne reportCallEnded (wtedy już posprzątane).
async function onSystemEnded(nativeId: string, reason: CallEndedReason | "user") {
  sessions.delete(nativeId);
  const r = ringing.get(nativeId);
  if (r) {
    ringing.delete(nativeId);
    if (!r.answered && reason === "user") fn("call-decline", { call_id: r.callId }).catch(() => undefined);
  }
  if (current && current.nativeId === nativeId) {
    if (reason === "user") await finishCurrent({ server: "auto" });
    else if (reason === "unanswered" && current.direction === "outgoing") {
      await finishCurrent({ server: "cancel", notify: "Nikt nie odebrał" });
    } else await finishCurrent({ server: "auto" });
  }
  releaseWatchIfIdle();
}

function onMutedAction(nativeId: string, muted: boolean) {
  if (!current || current.nativeId !== nativeId) return;
  if (current.micOn === !muted) return;
  void applyMic(!muted);
}

function onHeldAction(nativeId: string, held: boolean) {
  const cur = current;
  if (!cur || cur.nativeId !== nativeId) return;
  if (held) {
    micBeforeHold = cur.micOn;
    void applyMic(false);
  } else {
    if (micBeforeHold) void applyMic(true);
    micBeforeHold = null;
  }
  patch(cur.key, { held });
}

function onRouteChanged(e: AudioRouteChangedEvent) {
  const cur = current;
  if (!cur) return;
  const out = e.currentRoute?.outputs?.[0]?.portType;
  if (!out) return;
  const speaker = out === "builtInSpeaker";
  if (speaker !== cur.speaker) patch(cur.key, { speaker });
}

// Ponowne wybranie z Ostatnich / Siri: uchwyt to id rozmowy (nasze wychodzące) albo e-mail osoby.
async function onIntent(e: CallIntentReceivedEvent) {
  const handle = String(e.handle || "").trim();
  const kind: CallKind = e.hasVideo ? "video" : "audio";
  if (!handle) return;
  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(handle)) {
      await startOrJoinCall({ conversationId: handle, kind });
      return;
    }
    if (handle.includes("@")) {
      const mine = await me();
      const conv = mine ? await findExistingDirect(mine, normEmail(handle)) : null;
      if (conv) {
        await startOrJoinCall({ conversationId: conv, kind });
        return;
      }
    }
    toast.info("Nie znaleziono rozmowy", "Zadzwoń z rozmowy w Komunikatorze.");
  } catch (err) {
    toast.error(err, "Nie udało się rozpocząć połączenia");
  }
}

// ── Start ───────────────────────────────────────────────────────────────────
let inited = false;

// Raz przy starcie apki (app/_layout). Zdarzenia zgłoszone, zanim JS wstał (zimny start z pushu
// VoIP), moduł kolejkuje i oddaje po podpięciu słuchaczy (meta.flushed).
export function initCallEngine() {
  if (inited) return;
  inited = true;
  const CK = callkit();
  if (!CK) return;
  try {
    CK.addCallSessionAddedListener((e) => sessions.set(e.session.id, e.session));
    CK.addCallSessionUpdatedListener((e) => sessions.set(e.session.id, e.session));
    CK.addCallSessionRemovedListener((e) => sessions.delete(e.id));
    CK.addIncomingCallReportedListener((e) => void onIncomingReported(e.id));
    CK.addCallAnsweredListener((e) => void onAnswered(e.id, e.requestId));
    CK.addCallEndedListener((e) => void onSystemEnded(e.id, "user"));
    CK.addReportedCallEndedListener((e) => void onSystemEnded(e.id, e.reason));
    CK.addSetMutedActionListener((e) => onMutedAction(e.id, e.isMuted));
    CK.addSetHeldActionListener((e) => onHeldAction(e.id, e.isOnHold));
    CK.addAudioRouteChangedListener(onRouteChanged);
    CK.addCallIntentReceivedListener((e) => void onIntent(e));
  } catch (e) {
    if (__DEV__) console.warn("[calls] init failed:", (e as Error)?.message);
    return;
  }

  // Wideo odebrane przy zablokowanym ekranie: kamera po wejściu do apki. Po powrocie odśwież też
  // stan (realtime w tle mogło być zerwane).
  AppState.addEventListener("change", (s) => {
    if (s !== "active") return;
    if (cameraPending && current) {
      cameraPending = false;
      void enableCamera(current.key, true);
    }
    if (current || ringing.size) void pollCalls();
  });

  // Zapas na zimny start: sesja istnieje, a zdarzenie zgłoszenia nie dotarło.
  CK.getActiveCallSession()
    .then((s) => {
      if (!s) return;
      sessions.set(s.id, s);
      if (s.origin === "incoming" && s.status === "ringing" && !ringing.has(s.id)) void onIncomingReported(s.id, s);
    })
    .catch(() => undefined);

  if (__DEV__ && Platform.OS === "ios") console.log("[calls] CallKit gotowy");
}

// Wylogowanie — kończymy wszystko lokalnie (serwer i tak zamknie po czasie).
export async function resetCallEngine() {
  myEmail = null;
  for (const r of Array.from(ringing.values())) await endRinging(r, "failed");
  if (current) await finishCurrent({ server: "auto", reason: "remoteEnded" });
}

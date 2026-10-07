// Czysta logika Komunikatora w aplikacji (bez React Native i bez sieci) — lustrzana kopia
// webowego src/modules/Komunikator/utils/chatLogic.js: te same zasady kolejności listy, filtrów,
// sekcji, liczników nieprzeczytanych i podglądów. Test parytetu: src/modules/Komunikator/utils/
// chatLogic.test.js (uruchamia te same przypadki na obu wersjach). Nie importuj tu nic z RN.

export const normEmail = (e: string | null | undefined) => String(e ?? "").trim().toLowerCase();
export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && normEmail(a) === normEmail(b);
// Wzorzec do .ilike() dla dokładnego e-maila bez względu na wielkość liter (% i _ dosłownie).
export const emailPattern = (e: string) => String(e ?? "").replace(/[\\%_]/g, "\\$&");

type Vars = Record<string, string | number>;
export type Translate = (s: string, vars?: Vars) => string;

const ts = (v: unknown): number => {
  const t = v ? new Date(v as string).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};
const fill: Translate = (s, vars) =>
  vars ? String(s).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? "")) : String(s);

export interface PreviewAttachment {
  url?: string;
  name?: string;
  type?: string;
  size?: number;
  duration?: number;
  isVoiceMessage?: boolean;
}

export interface PreviewMessage {
  id?: string;
  conversation_id?: string;
  sender_email?: string | null;
  content?: string | null;
  created_at?: string;
  message_type?: string | null;
  attachments?: PreviewAttachment[] | null | Record<string, never>;
  deleted_at?: string | null;
  mentions?: string[] | null;
}

interface ConvLike {
  id?: string;
  type?: string;
  pinned?: boolean;
  starred?: boolean;
  archived?: boolean;
  unread_count?: number;
  unreadCount?: number;
  created_at?: string | null;
  updated_at?: string | null;
  last_message_at?: string | null;
  last_message?: PreviewMessage | null;
  lastMessage?: PreviewMessage | null;
}

const lastMsgOf = (c: ConvLike | null | undefined) => c?.lastMessage || c?.last_message || null;
const unreadOf = (c: ConvLike | null | undefined) => Number(c?.unreadCount ?? c?.unread_count ?? 0) || 0;

// Ostatnia aktywność: ostatnia wiadomość; rozmowa bez wiadomości — data zmiany/utworzenia.
export const lastActivity = (c: ConvLike | null | undefined): number => {
  const m = lastMsgOf(c);
  if (m?.created_at) return Math.max(ts(m.created_at), ts(c?.last_message_at));
  return Math.max(ts(c?.last_message_at), ts(c?.updated_at), ts(c?.created_at));
};

// Kolejność listy (web i aplikacja): przypięte na górze, potem od najświeższej wiadomości.
export function sortConversations(a: ConvLike, b: ConvLike): number {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  const d = lastActivity(b) - lastActivity(a);
  if (d !== 0) return d;
  return String(a.id ?? "").localeCompare(String(b.id ?? ""));
}

export type ConversationFilter = "all" | "unread" | "starred" | "archived";
export const CONVERSATION_FILTERS: ConversationFilter[] = ["all", "unread", "starred", "archived"];
export const FILTER_LABELS: Record<ConversationFilter, string> = {
  all: "Wszystkie",
  unread: "Nieprzeczytane",
  starred: "Ulubione",
  archived: "Archiwum",
};
// Pusta rozmowa 1:1 założona przez kogoś innego — ukryta do pierwszej wiadomości (jak web).
export const isSilentEmptyDirect = (c: (ConvLike & { created_by?: string | null }) | null | undefined, myEmail?: string | null) =>
  !!c && c.type === "direct" && !lastMsgOf(c) && !!myEmail && !!c.created_by && !sameEmail(c.created_by, myEmail);

// Zarchiwizowane widać wyłącznie w „Archiwum”.
export function matchesFilter(
  c: (ConvLike & { created_by?: string | null }) | null | undefined,
  filter: ConversationFilter = "all",
  myEmail: string | null = null,
): boolean {
  if (!c) return false;
  if (isSilentEmptyDirect(c, myEmail)) return false;
  if (filter === "archived") return !!c.archived;
  if (c.archived) return false;
  if (filter === "unread") return unreadOf(c) > 0;
  if (filter === "starred") return !!c.starred;
  return true;
}

export type SectionKey = "pinned" | "announcement" | "direct" | "group" | "ministry";
export const SECTION_ORDER: SectionKey[] = ["pinned", "announcement", "direct", "group", "ministry"];
export const SECTION_TITLES: Record<SectionKey, string> = {
  pinned: "Przypięte",
  announcement: "Ogłoszenia",
  direct: "Prywatne",
  group: "Grupy",
  // „Kanały” = kanały służb i grup domowych (type='ministry', skład synchronizuje serwer) — jak web.
  ministry: "Kanały",
};
export const sectionOf = (c: ConvLike | null | undefined): SectionKey => {
  if (c?.pinned) return "pinned";
  return (SECTION_ORDER as string[]).includes(String(c?.type)) ? (c!.type as SectionKey) : "group";
};
export function groupIntoSections<T extends ConvLike>(list: T[] = []) {
  const buckets = Object.fromEntries(SECTION_ORDER.map((k) => [k, [] as T[]])) as Record<SectionKey, T[]>;
  for (const c of list) buckets[sectionOf(c)].push(c);
  return SECTION_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
    key: k,
    title: SECTION_TITLES[k],
    items: [...buckets[k]].sort(sortConversations),
  }));
}

// Od kiedy liczyć nieprzeczytane: „przeczytane”, a bez niego — dołączenie do rozmowy.
export const readSince = (p: { last_read_at?: string | null; joined_at?: string | null } | null | undefined) =>
  p?.last_read_at || p?.joined_at || null;

// Jedno źródło prawdy: conversation_participants.last_read_at (unread_count nikt nie aktualizuje).
export function countUnread(messages: PreviewMessage[] = [], myEmail: string | null | undefined, since: unknown): number {
  const from = ts(since);
  let n = 0;
  for (const m of messages) {
    if (!m || sameEmail(m.sender_email, myEmail) || m.message_type === "system") continue;
    if (ts(m.created_at) > from) n += 1;
  }
  return n;
}

export function summarizeMessages<M extends PreviewMessage>(
  rows: M[] = [],
  myEmail: string | null | undefined,
  sinceByConv: Map<string, unknown> | Record<string, unknown> = {},
) {
  const sinceOf = (cid: string) =>
    sinceByConv instanceof Map ? sinceByConv.get(cid) : (sinceByConv as Record<string, unknown>)?.[cid];
  const last: Record<string, M> = {};
  const unread: Record<string, number> = {};
  for (const m of rows) {
    if (!m?.conversation_id) continue;
    const cid = String(m.conversation_id);
    if (!last[cid] || ts(m.created_at) > ts(last[cid].created_at)) last[cid] = m;
    if (sameEmail(m.sender_email, myEmail) || m.message_type === "system") continue;
    if (ts(m.created_at) > ts(sinceOf(cid))) unread[cid] = (unread[cid] || 0) + 1;
  }
  return { last, unread };
}

export function conversationsMissingLast(
  rows: { conversation_id?: string }[] = [],
  ids: string[] = [],
  limit = Infinity,
): string[] {
  if (rows.length < limit) return [];
  const seen = new Set(rows.map((r) => String(r?.conversation_id)));
  return ids.filter((id) => !seen.has(String(id)));
}

// Znacznik „przeczytane”: teraz, ale nie wcześniej niż ostatnia wiadomość (zegar telefonu bywa
// spóźniony względem serwera — wtedy ostatnia wiadomość wisiała jako nieprzeczytana).
export function readMarkTimestamp(latestCreatedAt: unknown, now: number | string | Date = Date.now()): string {
  const n = typeof now === "number" ? now : ts(now);
  return new Date(Math.max(n, ts(latestCreatedAt))).toISOString();
}

export const attachmentsOf = (m: PreviewMessage | null | undefined): PreviewAttachment[] =>
  Array.isArray(m?.attachments) ? (m!.attachments as PreviewAttachment[]).filter(Boolean) : [];
export const isImageAttachment = (a: PreviewAttachment | null | undefined) => !!a && String(a.type || "").startsWith("image/");
export const isVoiceAttachment = (a: PreviewAttachment | null | undefined) =>
  !!a && (a.isVoiceMessage === true || String(a.type || "").startsWith("audio/") || String(a.name || "").startsWith("voice-"));
export function voiceDurationMs(a: PreviewAttachment | null | undefined): number | undefined {
  if (!a) return undefined;
  const d = Number(a.duration);
  if (Number.isFinite(d) && d > 0) return Math.round(d * 1000);
  if (String(a.name || "").startsWith("voice-") && !a.isVoiceMessage) {
    const s = Number(a.size);
    if (Number.isFinite(s) && s > 0) return s;
  }
  return undefined;
}

const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

export function previewText(m: PreviewMessage | null | undefined, t: Translate = fill): string {
  if (!m) return "";
  const type = m.message_type || "text";
  const text = oneLine(m.content);
  if (type === "poll") return `📊 ${text || t("Ankieta")}`;
  if (type === "prayer") return `🙏 ${text || t("Prośba o modlitwę")}`;
  if (type === "event") return `📅 ${text || t("Wydarzenie")}`;
  if (text) return text;
  const atts = attachmentsOf(m);
  if (!atts.length) return "";
  if (atts.some(isVoiceAttachment)) return `🎤 ${t("Wiadomość głosowa")}`;
  const images = atts.filter(isImageAttachment).length;
  if (images === atts.length) return images > 1 ? `📷 ${t("Zdjęcia: {n}", { n: images })}` : `📷 ${t("Zdjęcie")}`;
  if (atts.length > 1) return `📎 ${t("Załączniki: {n}", { n: atts.length })}`;
  return `📎 ${oneLine(atts[0].name) || t("Załącznik")}`;
}

export function lastMessagePreview(
  m: PreviewMessage | null | undefined,
  opts: { myEmail?: string | null; convType?: string | null; senderName?: string | null; t?: Translate } = {},
): string {
  if (!m) return "";
  const t = opts.t ?? fill;
  const text = previewText(m, t);
  if (m.message_type === "system") return text;
  let prefix = "";
  if (sameEmail(m.sender_email, opts.myEmail)) prefix = t("Ty");
  else if (opts.convType && opts.convType !== "direct") prefix = oneLine(opts.senderName).split(" ")[0] || "";
  return prefix ? `${prefix}: ${text}` : text;
}

export function pickDirectConversation<T extends ConvLike>(candidates: (T | null | undefined)[] = []): T | null {
  const list = candidates.filter(Boolean) as T[];
  if (!list.length) return null;
  return [...list].sort((a, b) => lastActivity(b) - lastActivity(a) || ts(a.created_at) - ts(b.created_at))[0];
}

// Nowa wiadomość z realtime na liście rozmów (kształt aplikacji: last_message / unread_count).
export function applyIncomingMessage<T extends ConvLike>(
  list: T[] | undefined,
  msg: PreviewMessage | null | undefined,
  myEmail: string | null | undefined,
  opts: { openId?: string | null } = {},
): T[] | undefined {
  if (!list || !msg?.conversation_id || msg.deleted_at) return list;
  const cid = String(msg.conversation_id);
  let hit = false;
  const next = list.map((c) => {
    if (String(c.id) !== cid) return c;
    hit = true;
    const prev = c.last_message;
    if (prev?.id && prev.id === msg.id) return c;
    if (prev && ts(prev.created_at) > ts(msg.created_at)) return { ...c, archived: false };
    const counts =
      !sameEmail(msg.sender_email, myEmail) && msg.message_type !== "system" && String(opts.openId ?? "") !== cid;
    return { ...c, last_message: msg, archived: false, unread_count: (c.unread_count || 0) + (counts ? 1 : 0) };
  });
  return hit ? next.sort(sortConversations) : list;
}

export function unreadIdsToMark(
  messages: { id?: string; sender_email?: string | null }[] = [],
  userEmail: string | null | undefined,
  alreadyMarked: Set<string> = new Set(),
  receipts: Record<string, { user_email: string; read_at?: string | null }[]> = {},
): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (!m?.id || sameEmail(m.sender_email, userEmail) || alreadyMarked.has(m.id)) continue;
    const mine = (receipts[m.id] || []).find((r) => sameEmail(r.user_email, userEmail));
    if (mine?.read_at) continue;
    out.push(m.id);
  }
  return out;
}

export const mentionsUser = (m: PreviewMessage | null | undefined, email: string | null | undefined) =>
  !!email && Array.isArray(m?.mentions) && m!.mentions!.some((e) => sameEmail(e, email));

// =====================================================================
// Komunikator+ (K1–K11) — czysta logika aplikacji (bez RN i sieci).
// =====================================================================

// Doklejenie starszej paczki na początek: bez duplikatów, rosnąco po dacie (jak web).
export function mergeOlderMessages<M extends { id?: string; created_at?: string }>(list: M[] = [], older: M[] = []): M[] {
  const ids = new Set(list.map((m) => m.id));
  const fresh = older.filter((m) => m && !ids.has(m.id));
  if (!fresh.length) return list;
  return [...fresh, ...list].sort((a, b) => ts(a.created_at) - ts(b.created_at));
}

// Odświeżenie najnowszej paczki wątku bez gubienia doczytanej wcześniej historii: zostają
// wiadomości starsze niż najstarsza z paczki (paczka niepełna = cała rozmowa — starszych nie ma)
// oraz ŚWIEŻE (ostatnie 2 min) nowsze niż najnowsza z paczki — doszły przez realtime w trakcie
// pobierania. Starsza „nowsza” wiadomość spoza paczki to wiadomość usunięta — znika.
export function mergeLatestPage<M extends { id?: string; created_at?: string }>(
  prev: M[] | undefined,
  page: M[],
  full: boolean,
  now: number = Date.now(),
): M[] {
  if (!prev?.length || !page.length) return page;
  const oldest = ts(page[0].created_at);
  const newest = ts(page[page.length - 1].created_at);
  const ids = new Set(page.map((m) => m.id));
  const older = full ? prev.filter((m) => m && !ids.has(m.id) && ts(m.created_at) < oldest) : [];
  const newer = prev.filter(
    (m) => m && !ids.has(m.id) && ts(m.created_at) > newest && ts(m.created_at) > now - 2 * 60 * 1000,
  );
  return older.length || newer.length ? [...older, ...page, ...newer] : page;
}

// Pierwsza cudza (nie systemowa) wiadomość nowsza niż moje „przeczytane” — tu stoi separator
// „Nowe wiadomości” i tu otwiera się rozmowa. Bez znacznika (nigdy nie czytano) — brak.
export function firstUnreadMessageId(
  messages: PreviewMessage[] = [],
  myEmail: string | null | undefined,
  since: unknown,
): string | null {
  const from = ts(since);
  if (!from) return null;
  for (const m of messages) {
    if (!m?.id || sameEmail(m.sender_email, myEmail) || m.message_type === "system") continue;
    if (ts(m.created_at) > from) return m.id;
  }
  return null;
}

// K1: ścieżka pliku czatu w magazynie (`<conversationId>/plik`) z adresu załącznika, albo null
// (adres spoza magazynu czatu — np. stary link zewnętrzny — zostaje bez podpisu).
export function attachmentStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/\/storage\/messenger[-_]attachments\/([^?#]+)/);
  if (!m) return null;
  const path = m[1]
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg);
      } catch {
        return seg;
      }
    })
    .join("/");
  return path || null;
}

// Pełny adres z podpisanej ścieżki serwera (`/storage/<bucket>/<plik>?exp=…&sig=…`): segmenty
// ścieżki zakodowane (polskie litery, spacje), zapytanie bez zmian.
export function buildSignedUrl(base: string, signedPath: string): string {
  const raw = String(signedPath || "");
  const q = raw.indexOf("?");
  const pathPart = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q) : "";
  const encoded = pathPart
    .split("/")
    .map((seg) => {
      if (!seg) return seg;
      let s = seg;
      try {
        s = decodeURIComponent(seg);
      } catch {
        /* surowa nazwa z „%” */
      }
      return encodeURIComponent(s);
    })
    .join("/");
  return `${String(base || "").replace(/\/+$/, "")}${encoded.startsWith("/") ? "" : "/"}${encoded}${query}`;
}

// K2: linki w treści (http/https/www.) — bez końcowej interpunkcji i niedomkniętego nawiasu.
export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; url: string };
const LINK_RE = /((?:https?:\/\/|www\.)[^\s<>"'`]+)/gi;
const trimLink = (raw: string): string => {
  let s = raw;
  for (;;) {
    const last = s.slice(-1);
    if (/[.,!?:;'"»”’]/.test(last)) s = s.slice(0, -1);
    else if (last === ")" && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) s = s.slice(0, -1);
    else if (last === "]" && !s.includes("[")) s = s.slice(0, -1);
    else break;
  }
  return s;
};
export function normalizeLink(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const url = /^www\./i.test(s) ? `https://${s}` : s;
  if (!/^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(url) && !/^https?:\/\/localhost/i.test(url)) return null;
  return url;
}
export function splitLinks(text: string | null | undefined): TextPart[] {
  const src = String(text ?? "");
  const out: TextPart[] = [];
  let last = 0;
  LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK_RE.exec(src))) {
    const raw = trimLink(m[1]);
    const url = normalizeLink(raw);
    if (!url) continue;
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    out.push({ kind: "link", text: raw, url });
    last = m.index + raw.length;
    LINK_RE.lastIndex = last;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
}
export const firstLink = (text: string | null | undefined): string | null => {
  const p = splitLinks(text).find((x) => x.kind === "link");
  return p && p.kind === "link" ? p.url : null;
};
export const linkDomain = (url: string | null | undefined): string => {
  const m = String(url ?? "").match(/^https?:\/\/([^/?#:]+)/i);
  return m ? m[1].replace(/^www\./i, "").toLowerCase() : "";
};

// K4: wyciszenie na czas. „Zawsze” = muted:true bez terminu; reszta = termin w muted_until.
export type MuteOption = "1h" | "8h" | "tomorrow" | "always";
export function muteUntilFor(option: MuteOption, now: Date = new Date()): string | null {
  if (option === "always") return null;
  if (option === "1h") return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  if (option === "8h") return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
  return t.toISOString();
}
export const isMutedNow = (
  p: { muted?: boolean | null; muted_until?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean => !!p && (!!p.muted || (!!p.muted_until && ts(p.muted_until) > now));
// „do 14:30” (dziś), „do jutra 8:00”, „do 12 paź 8:00”; wyciszenie bez terminu — pusty tekst.
export function mutedUntilLabel(mutedUntil: string | null | undefined, now: Date = new Date()): string {
  const t = ts(mutedUntil);
  if (!t || t <= now.getTime()) return "";
  const d = new Date(t);
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff <= 0) return `do ${hm}`;
  if (diff === 1) return `do jutra ${hm}`;
  return `do ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${hm}`;
}

// K5: @wszyscy — w mentions zapisywane jako "*".
export const MENTION_ALL = "*";
export const mentionsAll = (m: PreviewMessage | null | undefined) =>
  Array.isArray(m?.mentions) && m!.mentions!.includes(MENTION_ALL);
export const hasMentionAllToken = (text: string | null | undefined) =>
  /(^|[\s(])@wszyscy(?![\p{L}\d_])/iu.test(String(text ?? ""));
// Wpisywana wzmianka tuż przed kursorem („…@Ol”): początek „@” i wpisany fragment.
export function activeMentionQuery(text: string, cursor: number = text.length): { start: number; query: string } | null {
  const before = String(text ?? "").slice(0, Math.max(0, cursor));
  const m = before.match(/(^|\s)@([\p{L}\d._-]{0,30})$/u);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}
// Wstaw wybraną wzmiankę w miejsce wpisywanego fragmentu (z odstępem po niej).
export function applyMention(text: string, start: number, cursor: number, label: string): string {
  const src = String(text ?? "");
  const after = src.slice(cursor).replace(/^[\p{L}\d._-]*/u, "");
  return `${src.slice(0, start)}@${label} ${after.replace(/^\s+/, "")}`;
}

// K6: potwierdzenia odczytu własnej wiadomości. ✓✓ „przeczytane” dopiero, gdy przeczytali
// WSZYSCY pozostali uczestnicy (1:1 — druga osoba); lista czytelników od najwcześniejszego.
export interface ReceiptLike {
  user_email: string;
  read_at?: string | null;
  delivered_at?: string | null;
}
export function receiptSummary<R extends ReceiptLike>(
  receipts: R[] | undefined,
  senderEmail: string | null | undefined,
  participantEmails: string[] = [],
): { status: "sent" | "delivered" | "read"; readers: R[]; readCount: number; total: number } {
  const others = (receipts ?? []).filter((r) => r && !sameEmail(r.user_email, senderEmail));
  const readers = others
    .filter((r) => !!r.read_at)
    .sort((a, b) => ts(a.read_at) - ts(b.read_at));
  const audience = Array.from(
    new Set(participantEmails.map(normEmail).filter((e) => e && e !== normEmail(senderEmail))),
  );
  const readSet = new Set(readers.map((r) => normEmail(r.user_email)));
  const total = audience.length;
  const allRead = total > 0 ? audience.every((e) => readSet.has(e)) : readers.length > 0;
  const status = allRead ? "read" : others.some((r) => r.delivered_at || r.read_at) ? "delivered" : "sent";
  return { status, readers, readCount: readers.length, total };
}

// K8: kanał grupy domowej (ministry_key = 'home_group:<id>').
export const isHomeGroupChannel = (c: { type?: string | null; ministry_key?: string | null } | null | undefined) =>
  !!c && c.type === "ministry" && String(c.ministry_key ?? "").startsWith("home_group:");

// Godzina/dzień na liście rozmów — jak web (formatMessageDate): dziś godzina, wczoraj „Wczoraj”,
// w tym tygodniu dzień tygodnia, starsze — „7 paź”.
const WEEKDAYS = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export function formatListTime(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(now) - day(d)) / 86_400_000);
  if (diffDays <= 0) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diffDays === 1) return "Wczoraj";
  if (diffDays < 7) return WEEKDAYS[d.getDay()];
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

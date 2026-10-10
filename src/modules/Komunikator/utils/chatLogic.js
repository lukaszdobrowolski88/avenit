// Czysta logika Komunikatora (bez Reacta i bez sieci) — testowana w chatLogic.test.js.
// Lustrzana kopia dla aplikacji mobilnej: packages/mobile/src/features/messenger/logic.ts
// (te same zasady list, liczników i podglądów; test parytetu w chatLogic.test.js).

// Porównanie e-maili bez względu na wielkość liter (serwer porównuje lower()).
export const normEmail = (e) => String(e ?? '').trim().toLowerCase();
export const sameEmail = (a, b) => !!a && !!b && normEmail(a) === normEmail(b);

// Wzorzec do .ilike() dla dokładnego e-maila bez względu na wielkość liter (% i _ dosłownie).
// Wiersze uczestników mogą mieć e-mail zapisany inną wielkością liter (np. z tabeli zespołu).
export const emailPattern = (e) => String(e ?? '').replace(/[\\%_]/g, '\\$&');

const ts = (v) => {
  const t = v ? new Date(v).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

// Prosty tłumacz zastępczy (PL + zmienne {x}); web podaje tu tr().
const fill = (s, vars) => (vars ? String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : String(s));

// Ostatnia wiadomość rozmowy (web: lastMessage, mobilka: last_message).
const lastMsgOf = (c) => c?.lastMessage || c?.last_message || null;
const unreadOf = (c) => Number(c?.unreadCount ?? c?.unread_count ?? 0) || 0;

// Ostatnia aktywność rozmowy: ostatnia wiadomość; rozmowa bez wiadomości — data zmiany/utworzenia
// (świeżo założona rozmowa ląduje na górze, ale zmiana nazwy starej rozmowy jej nie podbija).
export const lastActivity = (c) => {
  const m = lastMsgOf(c);
  if (m?.created_at) return Math.max(ts(m.created_at), ts(c?.last_message_at));
  return Math.max(ts(c?.last_message_at), ts(c?.updated_at), ts(c?.created_at));
};

// Kolejność listy (web i mobilka): przypięte na górze, potem od najświeższej wiadomości.
export function sortConversations(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  const d = lastActivity(b) - lastActivity(a);
  if (d !== 0) return d;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

// Pusta rozmowa 1:1 założona przez KOGOŚ INNEGO (jeszcze nic nie napisał) — jak w WhatsAppie nie
// pokazujemy jej, dopóki nie przyjdzie pierwsza wiadomość. Swoją pustą widzę (żeby do niej napisać).
export const isSilentEmptyDirect = (c, myEmail) =>
  !!c && c.type === 'direct' && !lastMsgOf(c) && !!myEmail && !!c.created_by && !sameEmail(c.created_by, myEmail);

// Filtry listy — te same nazwy i znaczenie w webie i w aplikacji.
// Zarchiwizowane widać wyłącznie w „Archiwum”.
export const CONVERSATION_FILTERS = ['all', 'unread', 'starred', 'archived'];
export function matchesFilter(c, filter = 'all', myEmail = null) {
  if (!c) return false;
  if (isSilentEmptyDirect(c, myEmail)) return false;
  if (filter === 'archived') return !!c.archived;
  if (c.archived) return false;
  if (filter === 'unread') return unreadOf(c) > 0;
  if (filter === 'starred') return !!c.starred;
  return true;
}

// Sekcje listy (ta sama kolejność w webie i w aplikacji). Przypięte zbierają wszystkie typy.
// „Kanały” = kanały służb i grup domowych (type='ministry', skład synchronizuje serwer).
export const SECTION_ORDER = ['pinned', 'meeting', 'announcement', 'direct', 'group', 'ministry'];
export const SECTION_TITLES = {
  pinned: 'Przypięte',
  meeting: 'Spotkania',
  announcement: 'Ogłoszenia',
  direct: 'Prywatne',
  group: 'Grupy',
  ministry: 'Kanały',
};
export const sectionOf = (c) => {
  if (c?.pinned) return 'pinned';
  return SECTION_ORDER.includes(c?.type) ? c.type : 'group';
};
export function groupIntoSections(list = []) {
  const buckets = Object.fromEntries(SECTION_ORDER.map((k) => [k, []]));
  for (const c of list) buckets[sectionOf(c)].push(c);
  return SECTION_ORDER
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ key: k, title: SECTION_TITLES[k], items: [...buckets[k]].sort(sortConversations) }));
}

// Od kiedy liczyć nieprzeczytane: moje „przeczytane”, a bez niego — dołączenie do rozmowy
// (nowa osoba w kanale nie dostaje „99+” za całą wcześniejszą historię).
export const readSince = (p) => p?.last_read_at || p?.joined_at || null;

// Jedno źródło prawdy dla liczników: conversation_participants.last_read_at (zapisują je obie
// aplikacje; kolumny unread_count nikt nie aktualizuje). Liczymy cudze wiadomości nowsze niż ono.
export function countUnread(messages = [], myEmail, since) {
  const from = ts(since);
  let n = 0;
  for (const m of messages) {
    if (!m || sameEmail(m.sender_email, myEmail) || m.message_type === 'system') continue;
    if (ts(m.created_at) > from) n += 1;
  }
  return n;
}

// Jedna paczka wiadomości wielu rozmów (dowolna kolejność) → ostatnia wiadomość i liczba
// nieprzeczytanych dla każdej rozmowy. sinceByConv: obiekt albo Map { convId: znacznik }.
export function summarizeMessages(rows = [], myEmail, sinceByConv = {}) {
  const sinceOf = (cid) => (sinceByConv instanceof Map ? sinceByConv.get(cid) : sinceByConv?.[cid]);
  const last = {};
  const unread = {};
  for (const m of rows) {
    if (!m?.conversation_id) continue;
    const cid = String(m.conversation_id);
    if (!last[cid] || ts(m.created_at) > ts(last[cid].created_at)) last[cid] = m;
    if (sameEmail(m.sender_email, myEmail) || m.message_type === 'system') continue;
    if (ts(m.created_at) > ts(sinceOf(cid))) unread[cid] = (unread[cid] || 0) + 1;
  }
  return { last, unread };
}

// Rozmowy bez wiadomości w paczce „najnowszych” — gdy paczka była pełna (limit), ich ostatnią
// wiadomość trzeba dociągnąć osobno; gdy niepełna, to rozmowy naprawdę puste.
export function conversationsMissingLast(rows = [], ids = [], limit = Infinity) {
  if (rows.length < limit) return [];
  const seen = new Set(rows.map((r) => String(r?.conversation_id)));
  return ids.filter((id) => !seen.has(String(id)));
}

// Znacznik „przeczytane”: teraz, ale nie wcześniej niż ostatnia wiadomość. Zegar komputera/telefonu
// bywa spóźniony względem serwera — wtedy ostatnia wiadomość wyglądała na wiecznie nieprzeczytaną.
export function readMarkTimestamp(latestCreatedAt, now = Date.now()) {
  const n = typeof now === 'number' ? now : ts(now);
  return new Date(Math.max(n, ts(latestCreatedAt))).toISOString();
}

// Załączniki: tablica (API bywa zwraca {} zamiast []).
export const attachmentsOf = (m) => (Array.isArray(m?.attachments) ? m.attachments.filter(Boolean) : []);
export const isImageAttachment = (a) => !!a && String(a.type || '').startsWith('image/');
// Głosówka: web zapisuje isVoiceMessage + duration (s), starsze nagrania z telefonu — nazwę „voice-…”.
export const isVoiceAttachment = (a) =>
  !!a && (a.isVoiceMessage === true || String(a.type || '').startsWith('audio/') || String(a.name || '').startsWith('voice-'));
// Długość głosówki w ms: duration (sekundy, web i nowe nagrania z telefonu); starsze nagrania
// z telefonu niosły długość w polu size (ms) — u innych size to rozmiar pliku w bajtach.
export function voiceDurationMs(a) {
  if (!a) return undefined;
  const d = Number(a.duration);
  if (Number.isFinite(d) && d > 0) return Math.round(d * 1000);
  if (String(a.name || '').startsWith('voice-') && !a.isVoiceMessage) {
    const s = Number(a.size);
    if (Number.isFinite(s) && s > 0) return s;
  }
  return undefined;
}

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Treść podglądu wiadomości (lista rozmów, cytat odpowiedzi): tekst albo opis zamiast pustego.
// t — tłumacz (web: tr), domyślnie tekst polski.
export function previewText(m, t = fill) {
  if (!m) return '';
  const type = m.message_type || 'text';
  const text = oneLine(m.content);
  if (type === 'poll') return `📊 ${text || t('Ankieta')}`;
  if (type === 'prayer') return `🙏 ${text || t('Prośba o modlitwę')}`;
  if (type === 'event') return `📅 ${text || t('Wydarzenie')}`;
  if (text) return text;
  const atts = attachmentsOf(m);
  if (!atts.length) return '';
  if (atts.some(isVoiceAttachment)) return `🎤 ${t('Wiadomość głosowa')}`;
  const images = atts.filter(isImageAttachment).length;
  if (images === atts.length) return images > 1 ? `📷 ${t('Zdjęcia: {n}', { n: images })}` : `📷 ${t('Zdjęcie')}`;
  if (atts.length > 1) return `📎 ${t('Załączniki: {n}', { n: atts.length })}`;
  return `📎 ${oneLine(atts[0].name) || t('Załącznik')}`;
}

// Podgląd ostatniej wiadomości na liście: „Ty: …”, w grupach imię nadawcy, w rozmowie 1:1 bez
// prefiksu. senderName — wyświetlana nazwa nadawcy (bierzemy pierwsze słowo).
export function lastMessagePreview(m, { myEmail, convType, senderName, t = fill } = {}) {
  if (!m) return '';
  const text = previewText(m, t);
  if (m.message_type === 'system') return text;
  let prefix = '';
  if (sameEmail(m.sender_email, myEmail)) prefix = t('Ty');
  else if (convType && convType !== 'direct') prefix = oneLine(senderName).split(' ')[0] || '';
  return prefix ? `${prefix}: ${text}` : text;
}

// Skład nowej rozmowy: twórca jako administrator, reszta jako członkowie (bez duplikatów i bez twórcy).
// opts.allAdmins — rozmowa prywatna 1:1: obie strony są administratorami (każda może ją usunąć).
export function buildParticipantRows(conversationId, creatorEmail, emails = [], opts = {}) {
  const seen = new Set([normEmail(creatorEmail)]);
  const rows = [{ conversation_id: conversationId, user_email: creatorEmail, role: 'admin' }];
  for (const e of emails) {
    const k = normEmail(e);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    rows.push({ conversation_id: conversationId, user_email: e, role: opts.allAdmins ? 'admin' : 'member' });
  }
  return rows;
}

// Spośród kilku rozmów 1:1 z tą samą osobą (dawne duplikaty) — ta z najświeższą aktywnością,
// przy remisie najstarsza (pierwotna).
export function pickDirectConversation(candidates = []) {
  const list = candidates.filter(Boolean);
  if (!list.length) return null;
  return [...list].sort((a, b) => (lastActivity(b) - lastActivity(a)) || (ts(a.created_at) - ts(b.created_at)))[0];
}

// Istniejąca rozmowa prywatna z daną osobą (także zarchiwizowana) — żeby nie tworzyć drugiej.
export function findDirectConversation(conversations = [], myEmail, otherEmail) {
  if (!otherEmail || sameEmail(otherEmail, myEmail)) return null;
  return pickDirectConversation(conversations.filter((c) =>
    c?.type === 'direct' &&
    (c.participants || []).some((p) => sameEmail(p.user_email, otherEmail))
  ));
}

// Nowa wiadomość z realtime na liście rozmów (web): rozmowa idzie na górę, podgląd się zmienia,
// licznik rośnie (cudza wiadomość, rozmowa nieotwarta), a rozmowa wychodzi z archiwum (jak serwer).
export function applyIncomingMessage(list = [], msg, myEmail, { openId = null } = {}) {
  if (!msg?.conversation_id || msg.deleted_at) return list;
  const cid = String(msg.conversation_id);
  let hit = false;
  const next = list.map((c) => {
    if (String(c.id) !== cid) return c;
    hit = true;
    const prev = c.lastMessage;
    if (prev?.id && prev.id === msg.id) return c;
    if (prev && ts(prev.created_at) > ts(msg.created_at)) return { ...c, archived: false };
    const counts = !sameEmail(msg.sender_email, myEmail) && msg.message_type !== 'system' && String(openId ?? '') !== cid;
    return { ...c, lastMessage: msg, archived: false, unreadCount: (c.unreadCount || 0) + (counts ? 1 : 0) };
  });
  return hit ? next.sort(sortConversations) : list;
}

// Dopisanie jednej wiadomości (np. wysłanej albo z realtime) bez duplikatów.
export function appendMessage(list = [], msg) {
  if (!msg || list.some((m) => m.id === msg.id)) return list;
  return [...list, msg];
}

// Doklejenie starszej paczki na początek: bez duplikatów, rosnąco po dacie.
export function mergeOlderMessages(list = [], older = []) {
  const ids = new Set(list.map((m) => m.id));
  const fresh = older.filter((m) => m && !ids.has(m.id));
  if (!fresh.length) return list;
  return [...fresh, ...list].sort((a, b) => ts(a.created_at) - ts(b.created_at));
}

// Zmiana wiadomości z realtime: edycja nadpisuje pola, usunięcie (deleted_at) wyrzuca z listy.
export function applyMessageUpdate(list = [], row) {
  if (!row?.id) return list;
  if (row.deleted_at) return list.filter((m) => m.id !== row.id);
  let changed = false;
  const next = list.map((m) => {
    if (m.id !== row.id) return m;
    changed = true;
    return { ...m, ...row, sender: m.sender };
  });
  return changed ? next : list;
}

// Które cudze wiadomości trzeba jeszcze oznaczyć jako przeczytane (bez powtórnych zapisów).
export function unreadIdsToMark(messages = [], userEmail, alreadyMarked = new Set(), receipts = {}) {
  const out = [];
  for (const m of messages) {
    if (!m?.id || sameEmail(m.sender_email, userEmail) || alreadyMarked.has(m.id)) continue;
    const mine = (receipts[m.id] || []).find((r) => sameEmail(r.user_email, userEmail));
    if (mine?.read_at) continue;
    out.push(m.id);
  }
  return out;
}

// Czy wiadomość wspomina mnie (@) — bez względu na wielkość liter e-maila.
export const mentionsUser = (m, email) =>
  !!email && Array.isArray(m?.mentions) && m.mentions.some((e) => sameEmail(e, email));

// Czy mogę pisać w rozmowie (kanał ogłoszeń: tylko administratorzy rozmowy).
export const canPostIn = (conv) => !!conv && ((conv.posting_policy || 'everyone') !== 'admins' || (conv.myRole ?? conv.my_role) === 'admin');

// Czy mogę opuścić rozmowę. Zwraca null (wolno) albo powód odmowy (klucz).
//  - 'ministry'  — skład kanału służby wynika z zespołu (po wyjściu i tak wróciłbym przy synchronizacji);
//  - 'lastAdmin' — jestem jedynym administratorem, a w rozmowie zostają inne osoby.
export function leaveBlocker(conv, myEmail) {
  if (!conv) return 'missing';
  if (conv.type === 'ministry') return 'ministry';
  const ps = conv.participants || [];
  const others = ps.filter((p) => !sameEmail(p.user_email, myEmail));
  const otherAdmins = others.filter((p) => p.role === 'admin');
  if (conv.myRole === 'admin' && others.length > 0 && otherAdmins.length === 0) return 'lastAdmin';
  return null;
}

// ── Komunikator+ ──────────────────────────────────────────────────────────────

// Kanały z automatycznym składem (K8): służby (ministry_key = klucz służby) i grupy domowe
// (ministry_key = 'home_group:<id>'). Nazwę nadaje serwer (etykieta modułu / nazwa grupy).
export const HOME_GROUP_PREFIX = 'home_group:';
export const isHomeGroupChannel = (c) =>
  c?.type === 'ministry' && String(c?.ministry_key || '').startsWith(HOME_GROUP_PREFIX);
export const homeGroupIdOf = (c) => (isHomeGroupChannel(c) ? String(c.ministry_key).slice(HOME_GROUP_PREFIX.length) : null);
// Nazwa kanału: najpierw nazwa z bazy (serwer), dopiero potem zapasowa etykieta po kluczu.
export const channelName = (c, fallbackByKey = () => '') =>
  String(c?.name || '').trim() || fallbackByKey(c?.ministry_key) || String(c?.ministry_key || '');

// Wyciszenie (K4): muted = „zawsze”, muted_until = „do…”. Efektywnie wyciszona, gdy jedno z nich.
export function muteState(c, now = Date.now()) {
  const n = typeof now === 'number' ? now : ts(now);
  const until = c?.mutedUntil ?? c?.muted_until ?? null;
  if (c?.muted) return { muted: true, until: null };
  const u = ts(until);
  if (u > n) return { muted: true, until: new Date(u) };
  return { muted: false, until: null };
}
export const isMutedNow = (c, now = Date.now()) => muteState(c, now).muted;

// Zapis wyciszenia dla wybranej opcji. Zwraca kolumny conversation_participants.
//  '1h' | '8h' | 'tomorrow' (jutro 8:00 czasu lokalnego) | 'always' | 'off'
export const MUTE_OPTIONS = ['1h', '8h', 'tomorrow', 'always'];
export function mutePatch(option, now = Date.now()) {
  const d = new Date(typeof now === 'number' ? now : ts(now));
  if (option === 'always') return { muted: true, muted_until: null };
  if (option === '1h') return { muted: false, muted_until: new Date(d.getTime() + 3600000).toISOString() };
  if (option === '8h') return { muted: false, muted_until: new Date(d.getTime() + 8 * 3600000).toISOString() };
  if (option === 'tomorrow') {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8, 0, 0, 0);
    return { muted: false, muted_until: t.toISOString() };
  }
  return { muted: false, muted_until: null };
}

// „Do kiedy” w formie do wyświetlenia: { kind: 'today'|'tomorrow'|'date', date }.
export function muteUntilKind(until, now = Date.now()) {
  if (!until) return null;
  const u = new Date(until);
  const n = new Date(typeof now === 'number' ? now : ts(now));
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(u) - day(n)) / 86400000);
  return { kind: diff <= 0 ? 'today' : diff === 1 ? 'tomorrow' : 'date', date: u };
}

// @wszyscy (K5): wzmianka zapisana jako "*" w messages.mentions.
export const MENTION_ALL = '*';
export const MENTION_ALL_TOKEN = '@wszyscy';
export const mentionsAll = (m) => Array.isArray(m?.mentions) && m.mentions.includes(MENTION_ALL);
// Czy wiadomość mnie dotyczy (osobiście albo @wszyscy) — własnych nie podświetlamy.
export const mentionsMe = (m, email) =>
  !!email && !sameEmail(m?.sender_email, email) && (mentionsUser(m, email) || mentionsAll(m));
// @wszyscy wolno administratorowi rozmowy (w kanałach serwer nadaje tę rolę liderom) albo
// administratorowi aplikacji. Nie w rozmowie 1:1. Serwer i tak sprawdza (403).
export const canMentionAll = (conv, isAppAdmin = false) =>
  !!conv && conv.type !== 'direct' && (isAppAdmin || (conv.myRole ?? conv.my_role) === 'admin');

// Potwierdzenia (K6). Stan ptaszków mojej wiadomości: 'read' dopiero gdy przeczytali WSZYSCY
// pozostali uczestnicy (1:1 — druga osoba), 'delivered' gdy u wszystkich doręczona.
// receipts: [{ user_email, read_at, delivered_at }], participantEmails: e-maile składu rozmowy.
export function receiptStatus(receipts = [], senderEmail, participantEmails = []) {
  const others = [...new Set(participantEmails.filter((e) => e && !sameEmail(e, senderEmail)).map(normEmail))];
  const byEmail = new Map();
  for (const r of receipts || []) {
    if (!r?.user_email || sameEmail(r.user_email, senderEmail)) continue;
    byEmail.set(normEmail(r.user_email), r);
  }
  if (!others.length) {
    // Skład nieznany — zachowanie jak dawniej (ktokolwiek).
    const list = [...byEmail.values()];
    if (list.some((r) => r.read_at)) return 'read';
    if (list.some((r) => r.delivered_at)) return 'delivered';
    return 'sent';
  }
  if (others.every((e) => byEmail.get(e)?.read_at)) return 'read';
  if (others.every((e) => byEmail.get(e)?.read_at || byEmail.get(e)?.delivered_at)) return 'delivered';
  return 'sent';
}

// „Widziane przez”: kto przeczytał (bez nadawcy), od najwcześniej przeczytanych.
export function seenBy(receipts = [], senderEmail) {
  const seen = new Map();
  for (const r of receipts || []) {
    if (!r?.read_at || !r.user_email || sameEmail(r.user_email, senderEmail)) continue;
    const k = normEmail(r.user_email);
    if (!seen.has(k)) seen.set(k, r);
  }
  return [...seen.values()].sort((a, b) => ts(a.read_at) - ts(b.read_at));
}

// Ankieta (K7): definicja w metadata.poll (nowy format) albo bezpośrednio w metadata (starsze).
export function pollOf(m) {
  const meta = m?.metadata && typeof m.metadata === 'object' ? m.metadata : {};
  const p = meta.poll && typeof meta.poll === 'object' ? { ...meta, ...meta.poll } : meta;
  const options = Array.isArray(p.options) ? p.options.filter(Boolean).map((o, i) =>
    (typeof o === 'string' ? { id: `o${i + 1}`, text: o } : { ...o, id: o.id ?? `o${i + 1}` })) : [];
  return {
    question: String(p.question || m?.content || ''),
    options,
    multiple: !!p.multiple,
    anonymous: !!p.anonymous,
    closes_at: p.closes_at || null,
  };
}
export const isPollClosed = (poll, now = Date.now()) => {
  const c = ts(poll?.closes_at);
  return c > 0 && c <= (typeof now === 'number' ? now : ts(now));
};
// Metadane nowej ankiety: pola na wierzchu (starsze wersje aplikacji) + metadata.poll (kontrakt).
export function buildPollMetadata({ question, options = [], multiple = false, anonymous = false, closes_at = null }) {
  const poll = {
    question: String(question || '').trim(),
    options: options.map((o, i) => ({ id: o.id || `o${i + 1}`, text: String(o.text || '').trim() })).filter((o) => o.text),
    multiple: !!multiple,
    anonymous: !!anonymous,
    closes_at: closes_at || null,
  };
  return { ...poll, poll };
}

// Nieprzeczytane na pulpicie (K11): jedna paczka wiadomości wielu rozmów → { convId: { count, last } },
// gdzie last to najnowsza NIEPRZECZYTANA cudza wiadomość (bez usuniętych i systemowych).
export function unreadSummary(rows = [], myEmail, sinceByConv = {}) {
  const out = {};
  for (const m of rows) {
    if (!m?.conversation_id || m.deleted_at) continue;
    if (sameEmail(m.sender_email, myEmail) || m.message_type === 'system') continue;
    const cid = String(m.conversation_id);
    if (ts(m.created_at) <= ts(sinceByConv?.[cid])) continue;
    const cur = out[cid] || { count: 0, last: null };
    cur.count += 1;
    if (!cur.last || ts(m.created_at) > ts(cur.last.created_at)) cur.last = m;
    out[cid] = cur;
  }
  return out;
}

// Czy wiadomość od zablokowanej osoby trzeba schować (K10): tylko cudze, poza systemowymi.
export const isFromBlocked = (m, blockedSet, myEmail) =>
  !!m && !!blockedSet && m.message_type !== 'system' && !sameEmail(m.sender_email, myEmail) &&
  blockedSet.has(normEmail(m.sender_email));

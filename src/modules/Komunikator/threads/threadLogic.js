// Wątki w Komunikatorze (migracja 112) — czysta logika (web; mobilka ma odpowiednik w threads.ts).
// Odpowiedź w wątku: messages.thread_root_id = id wiadomości głównej; licznik i czas ostatniej
// odpowiedzi liczy serwer (thread_reply_count / thread_last_reply_at na wiadomości głównej).
import { sameEmail } from '../utils/chatLogic';
import { trPlural } from '../../../i18n';

const ts = (v) => {
  const n = v ? new Date(v).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
};

export const replyCountOf = (m) => Math.max(0, Number(m?.thread_reply_count) || 0);
export const hasThread = (m) => replyCountOf(m) > 0;
export const isThreadReply = (m) => !!m?.thread_root_id;

// Czy wiadomość może zacząć wątek: zwykła (nie systemowa/połączenie), nieusunięta, nie odpowiedź.
export const canStartThread = (m) =>
  !!m?.id && !m.deleted_at && !isThreadReply(m) && m.message_type !== 'system' && m.message_type !== 'call';

// „1 odpowiedź” / „N odpowiedzi” — odmiana według bieżącego języka (trPlural).
export function replyCountLabel(n) {
  return trPlural(n, '{n} odpowiedź', '{n} odpowiedzi', '{n} odpowiedzi');
}

// Ostatni odpowiadający (najnowsi pierwsi, bez powtórzeń) per wiadomość główna.
// rows: [{ thread_root_id, sender_email, created_at }] w dowolnej kolejności.
export function repliersByRoot(rows = [], limit = 3) {
  const sorted = [...rows].filter((r) => r?.thread_root_id && r.sender_email).sort((a, b) => ts(b.created_at) - ts(a.created_at));
  const out = {};
  for (const r of sorted) {
    const key = String(r.thread_root_id);
    const list = out[key] || (out[key] = []);
    if (list.length >= limit || list.some((e) => sameEmail(e, r.sender_email))) continue;
    list.push(r.sender_email);
  }
  return out;
}

// Odpowiedzi wątku rosnąco po czasie, bez duplikatów.
export function addReply(list = [], row) {
  if (!row?.id || row.deleted_at || list.some((m) => m.id === row.id)) return list;
  return [...list, row].sort((a, b) => ts(a.created_at) - ts(b.created_at));
}

// Zmiana odpowiedzi z realtime / po edycji: nadpisanie pól, usunięcie (deleted_at) — z listy.
export function applyReplyUpdate(list = [], row) {
  if (!row?.id) return list;
  if (row.deleted_at) return list.filter((m) => m.id !== row.id);
  let hit = false;
  const next = list.map((m) => {
    if (m.id !== row.id) return m;
    hit = true;
    return { ...m, ...row, sender: m.sender };
  });
  return hit ? next : list;
}

// Mój wpis obserwowania → true/false; brak wpisu → false (zacznę obserwować po odpowiedzi).
export function isFollowing(rows = [], myEmail) {
  const mine = (rows || []).find((r) => sameEmail(r?.user_email, myEmail));
  return !!mine && mine.following !== false;
}

// Parametr ?thread= z linku powiadomienia (tylko id — bez obcych znaków).
export function threadParam(value) {
  const v = String(value ?? '').trim();
  return /^[0-9a-f-]{8,64}$/i.test(v) ? v : null;
}

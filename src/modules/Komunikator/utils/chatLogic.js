// Czysta logika Komunikatora (bez Reacta i bez sieci) — testowana w chatLogic.test.js.

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

// Ostatnia aktywność rozmowy: ostatnia wiadomość, a bez niej data zmiany/utworzenia.
export const lastActivity = (c) => Math.max(ts(c?.lastMessage?.created_at), ts(c?.last_message_at), ts(c?.updated_at), ts(c?.created_at));

// Sortowanie listy: przypięte > ulubione > nieprzeczytane > ostatnia aktywność.
export function sortConversations(a, b) {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  if (!!a.starred !== !!b.starred) return a.starred ? -1 : 1;
  const ua = (a.unreadCount || 0) > 0;
  const ub = (b.unreadCount || 0) > 0;
  if (ua !== ub) return ua ? -1 : 1;
  return lastActivity(b) - lastActivity(a);
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

// Istniejąca rozmowa prywatna z daną osobą (żeby nie tworzyć drugiej).
export function findDirectConversation(conversations = [], myEmail, otherEmail) {
  return conversations.find((c) =>
    c.type === 'direct' &&
    (c.participants || []).some((p) => sameEmail(p.user_email, otherEmail)) &&
    !sameEmail(otherEmail, myEmail)
  ) || null;
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

// Czy mogę pisać w rozmowie (kanał ogłoszeń: tylko administratorzy rozmowy).
export const canPostIn = (conv) => !!conv && ((conv.posting_policy || 'everyone') !== 'admins' || conv.myRole === 'admin');

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

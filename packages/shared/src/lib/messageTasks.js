// Komunikator — „Utwórz zadanie” z wiadomości i „Zapisane” (migracja 114). Czysta logika wspólna
// dla webu i mobilki (bez zapytań): nazwa i opis zadania z wiadomości, służba kanału → tablica
// zadań, link do wiadomości, wskaźnik „Zadanie: …” przy wiadomości i lista zapisanych.
import { isCustomModuleKey } from '../permissions/moduleScope.js';
import { isDoneLabel } from './boardStatus.js';

export const TASK_NAME_MAX = 120;

// Nazwa zadania: pierwsza niepusta linia wiadomości, bez nadmiarowych spacji, przycięta.
export function messageTaskName(content, max = TASK_NAME_MAX) {
  const line = String(content ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .find(Boolean) || '';
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

// Kanały służb (conversations.ministry_key, jak chat-channels-sync BUILTIN_TEAMS) → klucz modułu.
export const MINISTRY_CHANNEL_MODULES = {
  worship_team: 'worship',
  media_team: 'media',
  atmosfera_team: 'atmosfera',
  kids_ministry: 'kids',
  home_groups: 'homegroups',
  youth_ministry: 'mlodziezowka',
};
const HOME_GROUP_PREFIX = 'home_group:';

// Moduł (służba) rozmowy — tylko kanały służb; inne rozmowy → null (zadania Kalendarza).
export function conversationModuleKey(conv) {
  if (!conv || conv.type !== 'ministry') return null;
  const key = String(conv.ministry_key || '').trim();
  if (!key) return null;
  if (key.startsWith(HOME_GROUP_PREFIX)) return 'homegroups';
  if (MINISTRY_CHANNEL_MODULES[key]) return MINISTRY_CHANNEL_MODULES[key];
  return isCustomModuleKey(key) ? key : null;
}

// Ścieżka weba otwierająca rozmowę na tej wiadomości (KomunikatorModule: ?conversation=&message=).
// Odpowiedź w wątku (112: thread_root_id) — także &thread=<wiadomość główna>, jak link przypomnienia:
// web skacze do wiadomości głównej i otwiera panel wątku, aplikacja — ekran wątku.
export function messageLinkPath(conversationId, messageId, threadRootId = null) {
  const conv = encodeURIComponent(String(conversationId ?? ''));
  if (!messageId) return `/komunikator?conversation=${conv}`;
  const base = `/komunikator?conversation=${conv}&message=${encodeURIComponent(String(messageId))}`;
  return threadRootId ? `${base}&thread=${encodeURIComponent(String(threadRootId))}` : base;
}

// Odwrotność: z linku → { conversationId, messageId } albo null (dowolny host, sama ścieżka też).
export function parseMessageLink(link) {
  try {
    const u = new URL(String(link || ''), 'https://x.invalid');
    if (!/\/komunikator\/?$/.test(u.pathname)) return null;
    const conversationId = u.searchParams.get('conversation');
    if (!conversationId) return null;
    return {
      conversationId,
      messageId: u.searchParams.get('message') || null,
      threadRootId: u.searchParams.get('thread') || null,
    };
  } catch { return null; }
}

// Opis zadania: pełna treść wiadomości + linia pochodzenia (już przetłumaczona) + link do wiadomości.
export function messageTaskDescription({ content, fromLine, url }) {
  return [String(content ?? '').trim(), [String(fromLine || '').trim(), String(url || '').trim()].filter(Boolean).join('\n')]
    .filter(Boolean)
    .join('\n\n');
}

const labelsOf = (col) => (Array.isArray(col?.settings?.labels) ? col.settings.labels : []);

// Zadania utworzone z wiadomości → Map(messageId → [{ id, boardId, board, name, status, done }]).
// items: board_items z source_message_id; boards: [{ id, module_key, source_kind, name }];
// columns: kolumny statusu tych tablic ({ id, board_id, type, settings, display_order }).
// Tablica, której nie widzę (brak w boards), pomijana — jak w zadaniach wydarzenia.
export function tasksByMessage(items, boards = [], columns = []) {
  const boardById = new Map((boards || []).filter(Boolean).map((b) => [String(b.id), b]));
  const statusByBoard = new Map();
  const sorted = [...(columns || [])].filter((c) => c && c.type === 'status')
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  for (const c of sorted) if (!statusByBoard.has(String(c.board_id))) statusByBoard.set(String(c.board_id), c);
  const out = new Map();
  for (const it of items || []) {
    if (!it?.source_message_id) continue;
    const board = boardById.get(String(it.board_id));
    if (!board || board.is_template) continue;
    const col = statusByBoard.get(String(it.board_id)) || null;
    const cells = it.cells && typeof it.cells === 'object' ? it.cells : {};
    const raw = col ? cells[col.id] : null;
    const label = col && raw != null ? labelsOf(col).find((l) => String(l?.id) === String(raw)) || null : null;
    const row = {
      id: String(it.id),
      boardId: String(it.board_id),
      board,
      name: String(it.name || '').trim(),
      status: label ? { id: label.id, title: label.title || '', color: label.color || null } : null,
      done: isDoneLabel(label),
      createdAt: it.created_at || null,
    };
    const key = String(it.source_message_id);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(row);
  }
  for (const list of out.values()) list.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return out;
}

// Lista „Zapisane”: wiersze saved_messages + wiadomości, które widzę (odczyt messages przez /api/db
// zwraca tylko moje rozmowy). Brak wiadomości albo usunięta → pomijamy. Najnowsze zapisane najpierw.
export function savedMessageRows(saved, messages) {
  const byId = new Map((messages || []).filter(Boolean).map((m) => [String(m.id), m]));
  return (saved || [])
    .filter(Boolean)
    .map((s) => ({ saved: s, message: byId.get(String(s.message_id)) || null }))
    .filter((r) => r.message && !r.message.deleted_at)
    .sort((a, b) => String(b.saved.created_at || '').localeCompare(String(a.saved.created_at || '')));
}

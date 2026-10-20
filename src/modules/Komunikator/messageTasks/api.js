// Komunikator — „Utwórz zadanie” z wiadomości i „Zapisane” (migracja 114): zapytania webu.
// Zakres wierszy pilnuje serwer (/api/db): zadania tylko z tablic, które widzę (prywatne, zakres
// służby), powiązanie z wiadomością tylko z moich rozmów, zapisane — tylko moje i tylko z rozmów,
// w których jestem (dataapi/messageTasks.js + ownership.js).
import { supabase } from '../../../lib/supabase';
import { tr } from '../../../i18n';
import {
  tasksByMessage, conversationModuleKey, messageLinkPath, messageTaskDescription, savedMessageRows,
} from '@avenit/shared/src/lib/messageTasks.js';
import { sliceResource } from '@avenit/shared/src/permissions/moduleScope.js';
import { eventTasksSource, eventTasksModule, resolveEventTaskBoard, newTaskCells } from '../../Events/eventTasks';
import { CALENDAR_TASKS_SOURCE } from '../../Boards/lib/calendarTasks';
import { getMinistryName } from '../utils/messageHelpers';
import { attachmentsOf, isVoiceAttachment, isImageAttachment } from '../utils/chatLogic';

const CHUNK = 150;
const chunks = (list, n = CHUNK) => {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

// ── Wskaźnik „Zadanie: …” przy wiadomościach ────────────────────────────────
// Zadania utworzone z tych wiadomości → Map(messageId → [{ id, boardId, board, name, status, done }]).
// Brak dostępu do zadań (403) albo stary serwer bez kolumny — null (wątek przestaje pytać).
export async function loadMessageTasks(messageIds) {
  const ids = [...new Set((messageIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const items = [];
  for (const part of chunks(ids)) {
    const r = await supabase.from('board_items')
      .select('id, board_id, name, cells, source_message_id, created_at')
      .in('source_message_id', part);
    if (r.error) return null;
    items.push(...(r.data || []));
  }
  if (!items.length) return new Map();
  const boardIds = [...new Set(items.map((i) => String(i.board_id)))];
  const [b, c] = await Promise.all([
    supabase.from('boards').select('id, name, module_key, source_kind, is_template').in('id', boardIds),
    supabase.from('board_columns').select('id, board_id, type, settings, display_order').in('board_id', boardIds).eq('type', 'status'),
  ]);
  return tasksByMessage(items, b.data || [], c.data || []);
}

// ── Tablice docelowe ────────────────────────────────────────────────────────
// Nazwa rozmowy jak na liście (kanał służby po nazwie służby, 1:1 po drugiej osobie).
export const conversationLabel = (c) => (c?.type === 'ministry'
  ? (c.name || getMinistryName(c.ministry_key) || tr('Kanał służby'))
  : (c?.displayName || c?.name || tr('Rozmowa')));

// Opcje tablicy: zadania służby kanału (domyślnie), Kalendarz, tablice Projektów.
// canModule(moduleKey, table, op) — reguła „globalnie albo w zakresie służby” (jak serwer).
// → [{ key, kind: 'tasks'|'board', label, moduleKey?, board?, module }] (tylko te, w których mogę tworzyć).
export async function loadTaskTargets(conversation, { canModule, moduleLabel = () => null } = {}) {
  const out = [];
  const convModule = conversationModuleKey(conversation);
  const can = (mod) => !!canModule?.(mod || null, 'board_items', 'create');
  // Kanał służby z własną tablicą zadań (Media, Grupy domowe, moduł z kreatora…).
  if (convModule && sliceResource(convModule, 'tasks') && eventTasksSource(convModule) !== CALENDAR_TASKS_SOURCE) {
    const mod = eventTasksModule(convModule);
    if (can(mod)) {
      const label = moduleLabel(convModule) || conversationLabel(conversation);
      out.push({ key: `tasks:${convModule}`, kind: 'tasks', moduleKey: convModule, module: mod, label: tr('Zadania — {name}', { name: label }) });
    }
  }
  if (can('calendar')) out.push({ key: 'tasks:calendar', kind: 'tasks', moduleKey: null, module: 'calendar', label: tr('Zadania Kalendarza') });
  if (can(null)) {
    const { data } = await supabase.from('boards')
      .select('id, name, module_key, source_kind, is_template, is_archived, visibility, owner_email, created_by, editors')
      .eq('is_template', false).is('module_key', null)
      .order('display_order', { ascending: true }).order('created_at', { ascending: true });
    for (const b of data || []) {
      if (b.is_archived || b.source_kind) continue;
      out.push({ key: `board:${b.id}`, kind: 'board', board: b, module: null, label: b.name || tr('Tablica bez nazwy') });
    }
  }
  return out;
}

// Tablica docelowa z kolumnami i pierwszą grupą (tablica zadań służby/Kalendarza — w razie braku
// tworzy ją serwer, jak zakładka „Zadania”). → { board, columns, groupId }
export async function resolveTarget(target, { title } = {}) {
  if (target.kind === 'tasks') {
    const t = await resolveEventTaskBoard(target.moduleKey, { create: true, title });
    if (!t?.board) throw new Error(tr('Nie udało się otworzyć tablicy zadań.'));
    return t;
  }
  const id = target.board.id;
  const [cols, groups] = await Promise.all([
    supabase.from('board_columns').select('*').eq('board_id', id).order('display_order'),
    supabase.from('board_groups').select('id, display_order').eq('board_id', id).order('display_order').limit(1),
  ]);
  if (cols.error) throw cols.error;
  return { board: target.board, columns: cols.data || [], groupId: groups.data?.[0]?.id || null };
}

// Pełny link do wiadomości (działa też poza aplikacją — w mailu, na telefonie).
export const absoluteMessageUrl = (conversationId, messageId, origin = (typeof window !== 'undefined' ? window.location.origin : ''), threadRootId = null) =>
  `${origin}${messageLinkPath(conversationId, messageId, threadRootId)}`;

export function taskDescriptionFor(message, conversation, senderName) {
  const fromLine = tr('Z wiadomości od {name} w „{conversation}”', {
    name: senderName || message?.sender_email || tr('Nieznany nadawca'),
    conversation: conversationLabel(conversation),
  });
  return messageTaskDescription({ content: message?.content, fromLine, url: absoluteMessageUrl(conversation?.id, message?.id, undefined, message?.thread_root_id || null) });
}

// Utworzenie zadania z wiadomości. input: { name, description, due, people } → { item, board }.
export async function createTaskFromMessage({ target, message, input, userEmail = null, userName = null, title }) {
  const t = await resolveTarget(target, { title });
  const { data: last } = await supabase.from('board_items').select('display_order').eq('board_id', t.board.id)
    .order('display_order', { ascending: false }).limit(1);
  const { data, error } = await supabase.from('board_items').insert({
    board_id: t.board.id,
    group_id: t.groupId,
    name: String(input.name || '').trim(),
    description: input.description || null,
    cells: newTaskCells(t.columns, { due: input.due || null, people: input.people || [] }),
    display_order: (Number(last?.[0]?.display_order) || 0) + 1,
    created_by: userEmail,
    source_message_id: message.id,
    source_conversation_id: message.conversation_id || null,
  }).select().single();
  if (error) throw error;
  // Dziennik aktywności jak przy dodaniu w tablicy (best-effort).
  supabase.from('board_item_activity').insert({
    item_id: data.id, board_id: t.board.id, actor_email: userEmail, actor_name: userName, action: 'created',
  }).then(() => {}, () => {});
  return { item: data, board: t.board, columns: t.columns };
}

// ── Zapisane wiadomości ─────────────────────────────────────────────────────
// Moje zakładki (lekko: do przełącznika „Zapisz / Usuń z zapisanych” w wątku).
export async function loadSavedIds() {
  const { data, error } = await supabase.from('saved_messages').select('id, message_id, conversation_id, note, created_at');
  if (error) throw error;
  return data || [];
}

export async function saveMessage(messageId) {
  const { data, error } = await supabase.from('saved_messages').insert({ message_id: messageId }).select().single();
  if (error) throw error;
  return data;
}

export async function unsaveMessage(messageId) {
  const { error } = await supabase.from('saved_messages').delete().eq('message_id', messageId);
  if (error) throw error;
}

// Lista „Zapisane”: zakładki + wiadomości, które nadal widzę (+ nadawcy). Najnowsze zapisane najpierw.
export async function loadSavedMessages() {
  const saved = await loadSavedIds();
  if (!saved.length) return [];
  const msgs = [];
  for (const part of chunks(saved.map((s) => s.message_id))) {
    const r = await supabase.from('messages')
      .select('id, conversation_id, thread_root_id, sender_email, content, attachments, message_type, deleted_at, created_at')
      .in('id', part);
    if (r.error) throw r.error;
    msgs.push(...(r.data || []));
  }
  const rows = savedMessageRows(saved, msgs);
  const emails = [...new Set(rows.map((r) => r.message.sender_email).filter(Boolean))];
  let people = new Map();
  if (emails.length) {
    const { data } = await supabase.from('app_users').select('email, full_name, avatar_url').in('email', emails);
    people = new Map((data || []).map((u) => [String(u.email || '').toLowerCase(), u]));
  }
  return rows.map((r) => ({ ...r, sender: people.get(String(r.message.sender_email || '').toLowerCase()) || null }));
}

// Podgląd treści bez emoji: tekst albo rodzaj załącznika.
export function savedPreview(m) {
  const text = String(m?.content || '').replace(/\s+/g, ' ').trim();
  const atts = attachmentsOf(m || {});
  const kind = !atts.length ? null : atts.some(isVoiceAttachment) ? 'voice' : atts.every(isImageAttachment) ? 'image' : 'file';
  const attLabel = kind === 'voice' ? tr('Wiadomość głosowa')
    : kind === 'image' ? (atts.length > 1 ? tr('Zdjęcia: {n}', { n: atts.length }) : tr('Zdjęcie'))
      : kind === 'file' ? (atts.length > 1 ? tr('Załączniki: {n}', { n: atts.length }) : (atts[0]?.name || tr('Załącznik'))) : null;
  return { text, kind, attLabel };
}

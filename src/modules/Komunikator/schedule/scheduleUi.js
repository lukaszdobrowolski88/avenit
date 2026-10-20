// Komunikator: zaplanowane wiadomości i „Przypomnij mi” — etykiety terminów i wywołania serwera.
// Terminy liczy wspólny moduł (shared/lib/chatSchedule.js) w czasie polskim; zapis w UTC.
import { tr } from '../../../i18n';
import { callFn } from '../calls/callApi';
import {
  describeChatTime, schedulePresets, reminderPresets, fromWarsawYmdHm, warsawYmdHm, isValidChatTime,
} from '@avenit/shared/src/lib/chatSchedule.js';

export { schedulePresets, reminderPresets, fromWarsawYmdHm, warsawYmdHm, isValidChatTime };

const WEEKDAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];

// „Dziś, 18:00” / „Jutro, 8:00” / „pon. 26.10, 9:00” — w języku interfejsu (godziny polskie).
export function whenLabel(at, now = new Date()) {
  const d = describeChatTime(at, now);
  if (d.kind === 'today') return tr('Dziś, {time}', { time: d.time });
  if (d.kind === 'tomorrow') return tr('Jutro, {time}', { time: d.time });
  return tr('{day} {date}, {time}', { day: tr(WEEKDAYS[d.weekday]), date: d.date, time: d.time });
}

// Etykiety gotowych terminów (PL — tłumaczone przy rysowaniu).
const SCHEDULE_LABELS = { today18: 'Dziś 18:00', tomorrow8: 'Jutro 8:00', tomorrow18: 'Jutro 18:00' };
const REMINDER_LABELS = { in1h: 'Za 1 godzinę', in3h: 'Za 3 godziny', tomorrow9: 'Jutro 9:00', monday9: 'W poniedziałek 9:00' };
export const presetLabel = (key) => tr(SCHEDULE_LABELS[key] || REMINDER_LABELS[key] || key);

// ── Serwer (fn chat-scheduled / chat-reminders) ─────────────────────────────
export const scheduledApi = {
  list: (conversationId) => callFn('chat-scheduled', { action: 'list', conversation_id: conversationId }),
  create: (input) => callFn('chat-scheduled', { action: 'create', ...input }),
  update: (id, patch) => callFn('chat-scheduled', { action: 'update', id, ...patch }),
  cancel: (id) => callFn('chat-scheduled', { action: 'cancel', id }),
  sendNow: (id) => callFn('chat-scheduled', { action: 'send_now', id }),
};

export const remindersApi = {
  list: () => callFn('chat-reminders', { action: 'list' }),
  create: (messageId, remindAt) => callFn('chat-reminders', { action: 'create', message_id: messageId, remind_at: remindAt }),
  cancel: (id) => callFn('chat-reminders', { action: 'cancel', id }),
};

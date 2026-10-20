import React from 'react';
import { AlarmClock, X, MessageSquare } from 'lucide-react';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import EmptyState from '../../../components/EmptyState';
import Spinner from '../../../components/Spinner';
import { toast } from '../../../lib/toast';
import useMyReminders from './useMyReminders';
import { whenLabel } from './scheduleUi';

// „Moje przypomnienia” (z listy rozmów): aktywne przypomnienia o wiadomościach. Kliknięcie otwiera
// rozmowę przy wiadomości (onOpen(conversationId, messageId)); X — usuwa przypomnienie.
export default function MyRemindersPanel({ isOpen, onClose, onOpen }) {
  const { items, loading, error, cancel } = useMyReminders(isOpen);
  if (!isOpen) return null;

  const remove = async (r) => {
    try {
      await cancel(r.id);
      toast.success(tr('Przypomnienie usunięte'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się usunąć przypomnienia. Spróbuj ponownie.') });
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={tr('Moje przypomnienia')} icon={AlarmClock} size="md">
      <div className="p-4">
        {loading && items.length === 0 ? (
          <Spinner center label={tr('Ładowanie...')} />
        ) : error && items.length === 0 ? (
          <EmptyState compact icon={AlarmClock} title={tr('Nie udało się wczytać przypomnień')} subtitle={tr('Sprawdź internet i spróbuj ponownie.')} />
        ) : items.length === 0 ? (
          <EmptyState compact icon={AlarmClock} title={tr('Brak przypomnień')}
            subtitle={tr('W menu wiadomości wybierz „Przypomnij mi”, a przypomnimy Ci o niej w wybranym terminie.')} />
        ) : (
          <ul className="space-y-2">
            {items.map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                <button type="button" disabled={!r.available} onClick={() => { onOpen?.(r.conversation_id, r.message_id, r.thread_root_id || null); onClose?.(); }}
                  className="flex-1 min-w-0 text-left p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50 disabled:cursor-default disabled:hover:bg-transparent">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    <AlarmClock size={13} aria-hidden="true" />{whenLabel(r.remind_at)}
                    {r.conversation_title && <span className="font-normal text-gray-500 dark:text-gray-400 truncate">· {r.conversation_title}</span>}
                  </span>
                  {r.available ? (
                    <span className="mt-1 block text-sm text-gray-900 dark:text-gray-100 line-clamp-2 break-words">
                      {r.sender_name && <span className="font-semibold">{r.sender_name}: </span>}{r.preview}
                    </span>
                  ) : (
                    <span className="mt-1 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                      <MessageSquare size={13} aria-hidden="true" />{tr('Wiadomość jest niedostępna')}
                    </span>
                  )}
                </button>
                <button type="button" onClick={() => remove(r)} aria-label={tr('Usuń przypomnienie')} title={tr('Usuń przypomnienie')}
                  className="m-2 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition">
                  <X size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

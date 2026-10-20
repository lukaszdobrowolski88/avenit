import React, { useState } from 'react';
import { Clock, Send, Pencil, X, AlertTriangle, Paperclip } from 'lucide-react';
import { tr } from '../../../i18n';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { DateInput, TimeField } from '../../../components/pickers';
import { toast } from '../../../lib/toast';
import { confirmDialog } from '../../../lib/dialog';
import { whenLabel, warsawYmdHm, fromWarsawYmdHm, isValidChatTime } from './scheduleUi';

// „Zaplanowane” w rozmowie: moje oczekujące i nieudane wiadomości — zmiana treści i terminu,
// „Wyślij teraz”, anulowanie. hook = useScheduledMessages(conversationId).
export default function ScheduledMessagesPanel({ isOpen, onClose, hook }) {
  const [editing, setEditing] = useState(null); // { id, content, ymd, hm }
  if (!isOpen) return null;
  const { items } = hook;

  const startEdit = (s) => {
    const base = isValidChatTime(s.send_at) ? s.send_at : Date.now() + 60 * 60_000;
    const { ymd, hm } = warsawYmdHm(base);
    setEditing({ id: s.id, content: s.content || '', ymd, hm, hasFiles: (s.attachments || []).length > 0 });
  };
  const editAt = editing ? fromWarsawYmdHm(editing.ymd, editing.hm) : null;
  const editValid = !!editAt && isValidChatTime(editAt) && (editing?.content.trim() || editing?.hasFiles);

  const save = async () => {
    if (!editValid) return;
    try {
      await hook.update(editing.id, { content: editing.content.trim(), send_at: editAt.toISOString() });
      toast.success(tr('Zapisano: {when}', { when: whenLabel(editAt) }));
      setEditing(null);
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się zapisać zmian. Spróbuj ponownie.') });
    }
  };

  const sendNow = async (s) => {
    try {
      await hook.sendNow(s.id);
      toast.success(tr('Wiadomość wysłana'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się wysłać wiadomości. Spróbuj ponownie.') });
    }
  };

  const cancel = async (s) => {
    const ok = await confirmDialog({
      title: tr('Anulować zaplanowaną wiadomość?'),
      message: tr('Wiadomość nie zostanie wysłana.'),
      confirmLabel: tr('Anuluj wysyłkę'),
      danger: true,
    });
    if (!ok) return;
    try {
      await hook.cancel(s.id);
      if (editing?.id === s.id) setEditing(null);
      toast.success(tr('Wysyłka anulowana'));
    } catch (err) {
      toast.error(err, { fallback: tr('Nie udało się anulować wysyłki. Spróbuj ponownie.') });
    }
  };

  const today = warsawYmdHm(Date.now()).ymd;
  return (
    <Modal isOpen onClose={onClose} title={tr('Zaplanowane wiadomości')} icon={Clock} size="md"
      subtitle={items.length ? tr('Zaplanowane: {n}', { n: items.length }) : null}>
      <div className="p-4">
        {items.length === 0 ? (
          <EmptyState compact icon={Clock} title={tr('Brak zaplanowanych wiadomości')}
            subtitle={tr('Przytrzymaj przycisk Wyślij, żeby zaplanować wiadomość na później.')} />
        ) : (
          <ul className="space-y-2">
            {items.map((s) => {
              const failed = s.status === 'failed';
              const files = (s.attachments || []).length;
              const isEditing = editing?.id === s.id;
              return (
                <li key={s.id} className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {failed
                      ? <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><AlertTriangle size={13} aria-hidden="true" />{tr('Nie wysłano')}</span>
                      : <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden="true" />{whenLabel(s.send_at)}</span>}
                  </div>
                  {failed && s.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{s.error}</p>}
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea value={editing.content} onChange={(e) => setEditing((v) => ({ ...v, content: e.target.value }))} rows={3}
                        aria-label={tr('Treść wiadomości')}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-primary-light/50 resize-y" />
                      <div className="flex gap-2">
                        <div className="flex-1 min-w-0">
                          <DateInput value={editing.ymd} min={today} required compact aria-label={tr('Data')}
                            onChange={(e) => setEditing((v) => ({ ...v, ymd: e.target.value }))} />
                        </div>
                        <div className="w-28 shrink-0">
                          <TimeField value={editing.hm} compact aria-label={tr('Godzina')} onChange={(e) => setEditing((v) => ({ ...v, hm: e.target.value }))} />
                        </div>
                      </div>
                      {!editValid && <p className="text-xs text-red-600 dark:text-red-400">{tr('Wybierz termin w przyszłości (najwyżej rok naprzód).')}</p>}
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>{tr('Anuluj')}</Button>
                        <Button size="sm" disabled={!editValid} onClick={save}>{tr('Zapisz')}</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {s.content && <p className="mt-1.5 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words line-clamp-4">{s.content}</p>}
                      {files > 0 && (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Paperclip size={12} aria-hidden="true" />{tr('Załączniki: {n}', { n: files })}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" icon={Send} onClick={() => sendNow(s)}>{tr('Wyślij teraz')}</Button>
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => startEdit(s)}>{failed ? tr('Zaplanuj ponownie') : tr('Edytuj')}</Button>
                        <Button size="sm" variant="ghost" icon={X} onClick={() => cancel(s)}>{tr('Anuluj wysyłkę')}</Button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

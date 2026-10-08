import React, { useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2, ArrowDownToLine } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import { tr } from '../../../i18n';
import { promptDialog, confirmDialog } from '../../../lib/dialog';

// Zapisane składy służby (tabela schedule_templates): wstaw do wydarzenia (tylko do pustych ról),
// zapisz obecny skład wydarzenia jako nowy, usuń.
export default function TemplatesModal({ isOpen, onClose, eventLabel, templates, roleLabel, currentLineup, onSave, onInsert, onDelete }) {
  const [busy, setBusy] = useState(null);
  const canSave = Object.values(currentLineup || {}).some((n) => n?.length);

  const run = async (key, fn) => { setBusy(key); try { await fn(); } finally { setBusy(null); } };

  const save = () => run('save', async () => {
    const name = await promptDialog(tr('Nazwa składu (np. „Skład A”, „Niedziela z perkusją”):'), tr('Skład z {date}', { date: eventLabel?.split(' · ')[0] || '' }));
    if (name && name.trim()) await onSave(name.trim().slice(0, 80));
  });

  const remove = (tpl) => run(`del:${tpl.id}`, async () => {
    if (await confirmDialog(tr('Usunąć zapisany skład „{name}”?', { name: tpl.name }))) await onDelete(tpl);
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={tr('Zapisane składy')}
      subtitle={eventLabel ? tr('Wstawianie do: {event}. Skład trafi tylko do pustych ról; nieobecni zostaną pominięci.', { event: eventLabel }) : undefined}
      icon={Bookmark}
      size="lg"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{tr('Zamknij')}</Button>
          <Button icon={BookmarkPlus} disabled={!canSave} loading={busy === 'save'} onClick={save}
            title={canSave ? undefined : tr('W tym wydarzeniu nie ma jeszcze składu do zapisania')}>
            {tr('Zapisz obecny skład')}
          </Button>
        </>
      )}
    >
      <div className="p-6 space-y-3">
        {templates.length === 0 ? (
          <EmptyState compact icon={Bookmark} title={tr('Brak zapisanych składów')} subtitle={tr('Ułóż skład na jedną niedzielę i zapisz go — potem wstawisz go jednym kliknięciem.')} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-white/10">
            {templates.map((tpl) => {
              const entries = Object.entries(tpl.lineup || {}).filter(([, n]) => n?.length);
              return (
                <li key={tpl.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{tpl.name}</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                      {entries.map(([k, n]) => `${roleLabel(k)}: ${n.join(', ')}`).join(' · ')}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" icon={ArrowDownToLine} loading={busy === `ins:${tpl.id}`}
                    onClick={() => run(`ins:${tpl.id}`, () => onInsert(tpl))}>
                    {tr('Wstaw')}
                  </Button>
                  <button type="button" className="sg-icon-btn text-gray-500 hover:text-red-600 dark:text-gray-400" title={tr('Usuń')} aria-label={tr('Usuń skład {name}', { name: tpl.name })}
                    onClick={() => remove(tpl)} disabled={busy === `del:${tpl.id}`}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

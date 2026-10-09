import React, { useState } from 'react';
import { LayoutGrid, CalendarRange, CheckSquare, Users, Bookmark, Trash2 } from 'lucide-react';
import Modal from '../../../components/Modal';
import Button from '../../../components/Button';
import Spinner from '../../../components/Spinner';
import { ChoiceList, ChoiceRow } from '../../../components/ChoiceList';
import { Toggle } from '../../Settings/components/SettingsUI';
import { FORM_LABEL, FORM_INPUT } from './FormField';
import '../../../components/toolbar.css';
import { BOARD_TEMPLATES } from '../lib/templates';
import { tr } from '../../../i18n';

export const TEMPLATE_ICONS = { LayoutGrid, CalendarRange, CheckSquare, Users };

// Wybór szablonu nowej tablicy: wbudowane szablony + „Moje szablony” (tablice zapisane jako
// szablon, boards.is_template). onPick({ builtin }) albo onPick({ board }).
export default function TemplateChooser({ templates = [], loadingTemplates = false, onPick, onDeleteTemplate, onClose, busy }) {
  return (
    <Modal isOpen onClose={onClose} title={tr('Nowa tablica')} subtitle={tr('Wybierz szablon')} icon={LayoutGrid} size="lg">
      <div className="p-4 sm:p-6" aria-busy={busy || undefined}>
        <ChoiceList label={tr('Szablony')}>
          {BOARD_TEMPLATES.map((t) => (
            <ChoiceRow key={t.key} icon={TEMPLATE_ICONS[t.icon] || LayoutGrid} title={tr(t.name)} description={tr(t.description)}
              primary={t.key === 'blank'} disabled={busy} onClick={() => onPick({ builtin: t })} />
          ))}
        </ChoiceList>
        {(loadingTemplates || templates.length > 0) && (
          <ChoiceList label={tr('Moje szablony')}>
            {loadingTemplates && !templates.length && <Spinner size={18} className="py-3" />}
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <ChoiceRow icon={Bookmark} title={t.name} description={t.description || undefined} disabled={busy}
                    onClick={() => onPick({ board: t })} />
                </div>
                {onDeleteTemplate && (
                  <button type="button" className="icon-btn" disabled={busy} onClick={() => onDeleteTemplate(t)}
                    aria-label={tr('Usuń szablon „{name}”', { name: t.name })} title={tr('Usuń szablon')}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </ChoiceList>
        )}
        {busy && <Spinner size={18} label={tr('Tworzenie tablicy…')} className="mt-3" />}
      </div>
    </Modal>
  );
}

// „Zapisz jako szablon”: nazwa szablonu + czy zachować elementy (struktura zawsze).
export function SaveTemplateModal({ board, onSave, onClose }) {
  const [name, setName] = useState(board?.name || '');
  const [withItems, setWithItems] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try { await onSave({ name: n, withItems }); } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title={tr('Zapisz jako szablon')} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>{tr('Anuluj')}</Button>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>{tr('Zapisz szablon')}</Button>
      </>}>
      <div className="p-6 space-y-4">
        <div>
          <label htmlFor="tpl-name" className={FORM_LABEL}>{tr('Nazwa szablonu')}</label>
          <input id="tpl-name" autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }} className={FORM_INPUT} />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-200">
          <span>
            {tr('Z elementami')}
            <span className="block text-xs text-gray-500 dark:text-gray-400">{tr('Kolumny, grupy i widoki zapisują się zawsze.')}</span>
          </span>
          <Toggle checked={withItems} onChange={setWithItems} label={tr('Z elementami')} />
        </div>
      </div>
    </Modal>
  );
}

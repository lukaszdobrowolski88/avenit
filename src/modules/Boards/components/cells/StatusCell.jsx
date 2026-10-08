import React, { useState } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import Popover from '../Popover';
import LabelsEditor from '../LabelsEditor';
import { findLabel } from '../../lib/columnTypes';
import { boardColor } from '../../lib/palette';
import { tr } from '../../../../i18n';
import { StatusPill } from '../../../../components/ui/DataTable';
import { CELL_TRIGGER, HoverPlus } from './BasicCells';
import '../../../../components/pickList.css';

// Strzałki góra/dół przenoszą fokus między wierszami listy wyboru (jak w natywnym <select>).
// Podpinane na kontenerze okienka — działa też z pola wyszukiwania.
export function listArrowNav(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const opts = [...e.currentTarget.querySelectorAll('.pick-opt:not([aria-disabled="true"]):not(:disabled)')];
  if (!opts.length) return;
  e.preventDefault();
  const i = opts.indexOf(document.activeElement);
  const next = e.key === 'ArrowDown' ? (i + 1) % opts.length : (i <= 0 ? opts.length - 1 : i - 1);
  opts[next].focus();
}

// Wybór etykiety (lista pick-opt z tymi samymi pigułkami co w komórce) albo — dla osób, które
// mogą zmieniać strukturę kolumny — tryb edycji etykiet (wspólny LabelsEditor).
function StatusPicker({ column, value, onChange, onUpdateColumn, close }) {
  const [editing, setEditing] = useState(false);
  const labels = column?.settings?.labels || [];
  const canEdit = typeof onUpdateColumn === 'function';

  if (editing && canEdit) {
    return (
      <div className="p-3">
        <LabelsEditor column={column} onUpdateColumn={onUpdateColumn}
          // Usunięta etykieta była wybrana w tym zadaniu → komórka pusta.
          onRemoved={(id) => { if (id === value) onChange(null); }} />
        <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-white/10">
          <button type="button" onClick={() => setEditing(false)}
            className="text-xs font-semibold px-3 h-7 rounded-full bg-[rgba(42,35,18,0.06)] dark:bg-white/10 text-gray-700 dark:text-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
            {tr('Gotowe')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1" onKeyDown={listArrowNav}>
      <div role="listbox" aria-label={column?.name} className="max-h-64 overflow-y-auto custom-scrollbar">
        {labels.map((l, i) => {
          const sel = value === l.id;
          return (
            // Ta sama miękka pigułka co w komórce (kanon tabel), nie nasycony blok z białym tekstem.
            <button key={l.id} type="button" role="option" aria-selected={sel}
              autoFocus={sel || (!value && i === 0)}
              onClick={() => { onChange(l.id); close(); }}
              className="pick-opt text-gray-800 dark:text-gray-100">
              <StatusPill color={boardColor(l.color)} className="min-w-0 max-w-full overflow-hidden">{l.title}</StatusPill>
              {sel && <Check size={15} className="ml-auto shrink-0 text-gray-700 dark:text-gray-200" aria-hidden="true" />}
            </button>
          );
        })}
        {labels.length === 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4 px-3">{tr('Brak etykiet')}</div>
        )}
      </div>
      {(value || canEdit) && (
        <div className="mt-1 pt-1 border-t border-gray-100 dark:border-white/10">
          {value && (
            <button type="button" onClick={() => { onChange(null); close(); }} className="pick-opt text-gray-600 dark:text-gray-300">
              <X size={15} className="opacity-80" aria-hidden="true" /> {tr('Wyczyść')}
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => setEditing(true)} className="pick-opt text-gray-600 dark:text-gray-300">
              <Pencil size={15} className="opacity-80" aria-hidden="true" /> {tr('Edytuj etykiety')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Komórka Status/Priorytet — wspólna pigułka tabel (StatusPill: kropka + tekst o czytelnym kontraście),
// wyśrodkowana w komórce. Stare kolory Monday z bazy mapuje boardColor.
// `onUpdateColumn` przychodzi tylko, gdy wolno zmieniać strukturę kolumny — bez niego da się
// wyłącznie wybrać wartość. `readOnly` = sama pigułka, bez okienka.
export default function StatusCell({ column, value, onChange, onUpdateColumn, readOnly }) {
  const label = findLabel(column, value);
  const pill = label
    ? <StatusPill color={boardColor(label.color)} className="max-w-full overflow-hidden">{label.title}</StatusPill>
    : null;

  if (readOnly) {
    return <div className="w-full h-full flex items-center justify-center px-2">{pill}</div>;
  }

  const name = column?.name || tr('Status');
  return (
    <Popover
      width={260}
      bare
      className="pick-pop"
      trigger={
        <button type="button" aria-haspopup="listbox" aria-label={label ? `${name}: ${label.title}` : name}
          className={`${CELL_TRIGGER} justify-center hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors`}>
          {pill || <HoverPlus />}
        </button>
      }
    >
      {({ close }) => (
        <StatusPicker column={column} value={value} onChange={onChange} onUpdateColumn={onUpdateColumn} close={close} />
      )}
    </Popover>
  );
}

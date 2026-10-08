import React, { useId } from 'react';
import { Plus } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import { COLUMN_TYPES, COLUMN_TYPE_ORDER } from '../lib/columnTypes';
import { listArrowNav } from './cells/StatusCell';
import { tr } from '../../../i18n';
import '../../../components/pickList.css';

// Typy, po które sięga się najczęściej — na górze; reszta w „Zaawansowane” (kolejność z COLUMN_TYPE_ORDER).
const BASIC = new Set(['text', 'long_text', 'number', 'status', 'priority', 'people', 'date', 'checkbox', 'dropdown', 'link', 'files']);
const GROUPS = [
  { key: 'basic', title: 'Podstawowe', types: COLUMN_TYPE_ORDER.filter(k => BASIC.has(k)) },
  { key: 'advanced', title: 'Zaawansowane', types: COLUMN_TYPE_ORDER.filter(k => !BASIC.has(k)) },
];

// Przycisk „+" w nagłówku tabeli → lista typów kolumn (wspólny wygląd pick-pop / pick-opt).
// `trigger` pozwala użyć własnego wyzwalacza (np. „+ Dodaj pole" w modalu elementu).
export default function AddColumnMenu({ onAdd, trigger, align = 'right', triggerClassName }) {
  const uid = useId();
  return (
    <Popover
      width={260}
      align={align}
      bare
      className="pick-pop overflow-hidden"
      triggerClassName={triggerClassName}
      trigger={
        trigger || ((open) => (
          // Prawdziwy przycisk — osiągalny klawiaturą (wcześniej goły div z ikoną).
          <button type="button" aria-label={tr('Dodaj kolumnę')} title={tr('Dodaj kolumnę')} aria-haspopup="true" aria-expanded={open}
            className="h-full w-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary-light/50">
            <Plus size={16} aria-hidden="true" />
          </button>
        ))
      }
    >
      {({ close }) => (
        <div className="max-h-[min(26rem,70vh)] overflow-y-auto custom-scrollbar py-1" onKeyDown={listArrowNav}>
          {GROUPS.map((g, gi) => (
            <div key={g.key} role="group" aria-labelledby={`${uid}-${g.key}`}>
              <div id={`${uid}-${g.key}`} className="pick-section">{tr(g.title)}</div>
              {g.types.map((key, i) => {
                const t = COLUMN_TYPES[key];
                return (
                  <button key={key} type="button" autoFocus={gi === 0 && i === 0}
                    onClick={() => { onAdd(key, tr(t.label)); close(); }}
                    className="pick-opt text-gray-800 dark:text-gray-100">
                    <ColumnIcon name={t.icon} size={15} className="text-gray-400 shrink-0" />
                    <span className="truncate">{tr(t.label)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Popover>
  );
}

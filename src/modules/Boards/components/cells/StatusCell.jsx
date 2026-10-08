import React, { useState } from 'react';
import { Check, Plus, X, Pencil } from 'lucide-react';
import Popover from '../Popover';
import { findLabel } from '../../lib/columnTypes';
import { STATUS_COLORS, uid } from '../../lib/constants';
import { tr } from '../../../../i18n';
import { StatusPill } from '../../../../components/ui/DataTable';
import '../../../../components/pickList.css';

// Komórka Status/Priorytet — wspólna pigułka tabel (StatusPill: kropka + tekst o czytelnym kontraście),
// wyśrodkowana w komórce; picker etykiet z tymi samymi pigułkami i edycją.
export default function StatusCell({ column, value, onChange, onUpdateColumn, readOnly }) {
  const label = findLabel(column, value);
  const labels = column?.settings?.labels || [];
  const [editing, setEditing] = useState(false);

  const setLabels = (next) => onUpdateColumn?.(column.id, { settings: { ...column.settings, labels: next } });

  const addLabel = () => {
    const used = labels.map(l => l.color);
    const color = STATUS_COLORS.find(c => !used.includes(c)) || STATUS_COLORS[labels.length % STATUS_COLORS.length];
    setLabels([...labels, { id: uid('lbl'), title: tr('Nowa etykieta'), color }]);
  };

  const pill = label
    ? <StatusPill color={label.color} className="max-w-full truncate">{label.title}</StatusPill>
    : <span className="text-gray-300 dark:text-gray-600 text-base leading-none opacity-0 group-hover/row:opacity-100 transition-opacity">+</span>;

  if (readOnly) {
    return <div className="w-full h-full flex items-center justify-center px-2">{pill}</div>;
  }

  return (
    <Popover
      width={240}
      bare
      className="pick-pop"
      trigger={
        <div className="w-full h-full flex items-center justify-center px-2 cursor-pointer hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors">
          {pill}
        </div>
      }
    >
      {({ close }) => (
        <div className="p-2">
          <div className="grid grid-cols-1 gap-0.5 max-h-64 overflow-y-auto custom-scrollbar" role={editing ? undefined : 'listbox'} aria-label={column?.name}>
            {labels.map(l => (
              <div key={l.id} className="flex items-center gap-1">
                {editing ? (
                  <>
                    <span className="w-2 h-2 rounded-full shrink-0 ml-2" style={{ backgroundColor: l.color }} aria-hidden="true" />
                    <input
                      value={l.title}
                      onChange={(e) => setLabels(labels.map(x => x.id === l.id ? { ...x, title: e.target.value } : x))}
                      aria-label={tr('Nazwa etykiety')}
                      className="flex-1 min-w-0 text-sm bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent-primary-light/40 text-gray-800 dark:text-gray-100"
                    />
                    <button onClick={() => setLabels(labels.filter(x => x.id !== l.id))} aria-label={tr('Usuń etykietę')}
                      className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
                  </>
                ) : (
                  // Ta sama miękka pigułka co w komórce (kanon tabel), nie nasycony blok z białym tekstem.
                  <button type="button" role="option" aria-selected={value === l.id}
                    onClick={() => { onChange(l.id); close(); }}
                    className="flex-1 flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5 text-left">
                    <StatusPill color={l.color} className="truncate">{l.title}</StatusPill>
                    {value === l.id && <Check size={15} className="shrink-0 text-gray-700 dark:text-gray-200" aria-hidden="true" />}
                  </button>
                )}
              </div>
            ))}
          </div>

          {editing && (
            <div className="mt-2 flex flex-wrap gap-1 px-1">
              {STATUS_COLORS.map(c => (
                <button key={c} onClick={() => {
                  const target = labels.find(l => l.id === value) || labels[labels.length - 1];
                  if (target) setLabels(labels.map(l => l.id === target.id ? { ...l, color: c } : l));
                }} className="w-5 h-5 rounded" style={{ backgroundColor: c }} />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button onClick={addLabel} className="flex items-center gap-1 text-xs text-gray-500 hover:text-accent-primary px-2 py-1">
              <Plus size={14} /> {tr('Dodaj etykietę')}
            </button>
            <button onClick={() => setEditing(e => !e)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${editing ? 'text-accent-primary' : 'text-gray-500 hover:text-accent-primary'}`}>
              <Pencil size={13} /> {editing ? tr('Gotowe') : tr('Edytuj')}
            </button>
          </div>
          {value && !editing && (
            <button onClick={() => { onChange(null); close(); }}
              className="w-full mt-1 text-xs text-gray-400 hover:text-red-500 py-1">{tr('Wyczyść')}</button>
          )}
        </div>
      )}
    </Popover>
  );
}

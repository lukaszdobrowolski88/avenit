import React, { useState } from 'react';
import { Check, Plus, X, Pencil } from 'lucide-react';
import Popover from '../Popover';
import { findLabel } from '../../lib/columnTypes';
import { STATUS_COLORS, uid } from '../../lib/constants';

// Komórka Status/Priorytet — pełne kolorowe tło, picker etykiet z edycją.
export default function StatusCell({ column, value, onChange, onUpdateColumn, readOnly }) {
  const label = findLabel(column, value);
  const labels = column?.settings?.labels || [];
  const [editing, setEditing] = useState(false);

  const setLabels = (next) => onUpdateColumn?.(column.id, { settings: { ...column.settings, labels: next } });

  const addLabel = () => {
    const used = labels.map(l => l.color);
    const color = STATUS_COLORS.find(c => !used.includes(c)) || STATUS_COLORS[labels.length % STATUS_COLORS.length];
    setLabels([...labels, { id: uid('lbl'), title: 'Nowa etykieta', color }]);
  };

  if (readOnly) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs font-medium text-white"
        style={{ backgroundColor: label ? label.color : 'transparent' }}>
        <span className={label ? '' : 'text-gray-400'}>{label ? label.title : ''}</span>
      </div>
    );
  }

  return (
    <Popover
      width={220}
      trigger={
        <div className="w-full h-full flex items-center justify-center text-xs font-medium text-white transition-colors"
          style={{ backgroundColor: label ? label.color : undefined }}>
          <span className={label ? '' : 'text-gray-300 dark:text-gray-600'}>{label ? label.title : '—'}</span>
        </div>
      }
    >
      {({ close }) => (
        <div className="p-2">
          <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto custom-scrollbar">
            {labels.map(l => (
              <div key={l.id} className="flex items-center gap-1">
                <button
                  onClick={() => { if (!editing) { onChange(l.id); close(); } }}
                  className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ backgroundColor: l.color }}
                >
                  {editing ? (
                    <input
                      value={l.title}
                      onChange={(e) => setLabels(labels.map(x => x.id === l.id ? { ...x, title: e.target.value } : x))}
                      className="bg-white/20 rounded px-1 w-full text-white placeholder-white/60 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <span>{l.title}</span>
                      {value === l.id && <Check size={16} />}
                    </>
                  )}
                </button>
                {editing && (
                  <button onClick={() => setLabels(labels.filter(x => x.id !== l.id))}
                    className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
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
              <Plus size={14} /> Dodaj etykietę
            </button>
            <button onClick={() => setEditing(e => !e)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${editing ? 'text-accent-primary' : 'text-gray-500 hover:text-accent-primary'}`}>
              <Pencil size={13} /> {editing ? 'Gotowe' : 'Edytuj'}
            </button>
          </div>
          {value && !editing && (
            <button onClick={() => { onChange(null); close(); }}
              className="w-full mt-1 text-xs text-gray-400 hover:text-red-500 py-1">Wyczyść</button>
          )}
        </div>
      )}
    </Popover>
  );
}

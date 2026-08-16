import React, { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import Popover from '../Popover';
import { resolveOptions } from '../../lib/columnTypes';
import { STATUS_COLORS, uid } from '../../lib/constants';

// Komórka Lista wyboru (dropdown) — multi-tagi z zarządzaniem opcjami.
export default function TagsCell({ column, value = [], onChange, onUpdateColumn, readOnly }) {
  const options = column?.settings?.options || [];
  const selected = resolveOptions(column, value);
  const [adding, setAdding] = useState('');

  const setOptions = (next) => onUpdateColumn?.(column.id, { settings: { ...column.settings, options: next } });
  const toggle = (optId) => {
    const ids = value || [];
    onChange(ids.includes(optId) ? ids.filter(i => i !== optId) : [...ids, optId]);
  };
  const addOption = () => {
    const title = adding.trim();
    if (!title) return;
    const color = STATUS_COLORS[options.length % STATUS_COLORS.length];
    const opt = { id: uid('opt'), title, color };
    setOptions([...options, opt]);
    setAdding('');
  };

  const Chips = (
    <div className="w-full h-full flex items-center gap-1 px-2 flex-wrap overflow-hidden">
      {selected.length === 0 ? <span className="text-gray-300 dark:text-gray-600 text-xs">—</span> :
        selected.map(o => (
          <span key={o.id} className="text-[11px] px-2 py-0.5 rounded-full text-white whitespace-nowrap" style={{ backgroundColor: o.color }}>
            {o.title}
          </span>
        ))}
    </div>
  );

  if (readOnly) return Chips;

  return (
    <Popover width={220} trigger={Chips}>
      {() => (
        <div className="p-2">
          <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1">
            {options.map(o => (
              <div key={o.id} className="flex items-center gap-1">
                <button onClick={() => toggle(o.id)}
                  className="flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs text-white" style={{ backgroundColor: o.color }}>
                  <span>{o.title}</span>
                  {(value || []).includes(o.id) && <Check size={14} />}
                </button>
                <button onClick={() => { setOptions(options.filter(x => x.id !== o.id)); onChange((value || []).filter(i => i !== o.id)); }}
                  className="p-1 text-gray-400 hover:text-red-500"><X size={13} /></button>
              </div>
            ))}
            {options.length === 0 && <div className="text-xs text-gray-400 text-center py-2">Brak opcji</div>}
          </div>
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <input value={adding} onChange={(e) => setAdding(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addOption()} placeholder="Nowa opcja..."
              className="flex-1 text-xs bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1.5 outline-none text-gray-700 dark:text-gray-200" />
            <button onClick={addOption} className="p-1.5 text-accent-primary hover:bg-accent-primary/10 rounded"><Plus size={16} /></button>
          </div>
        </div>
      )}
    </Popover>
  );
}

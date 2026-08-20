import React from 'react';
import { Plus } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import { COLUMN_TYPES, COLUMN_TYPE_ORDER } from '../lib/columnTypes';

// Przycisk „+" w nagłówku tabeli → paleta typów kolumn.
export default function AddColumnMenu({ onAdd }) {
  return (
    <Popover
      width={240}
      align="right"
      trigger={
        <div className="h-full w-full flex items-center justify-center text-gray-400 hover:text-accent-primary hover:bg-gray-50 dark:hover:bg-gray-700/40" title="Dodaj kolumnę">
          <Plus size={16} />
        </div>
      }
    >
      {({ close }) => (
        <div className="p-2">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 px-2 py-1">Dodaj kolumnę</div>
          <div className="grid grid-cols-1 gap-0.5 max-h-72 overflow-y-auto custom-scrollbar">
            {COLUMN_TYPE_ORDER.map(key => {
              const t = COLUMN_TYPES[key];
              return (
                <button key={key} onClick={() => { onAdd(key, t.label); close(); }}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left">
                  <span className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300">
                    <ColumnIcon name={t.icon} size={15} />
                  </span>
                  <span className="text-sm text-gray-700 dark:text-gray-200">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Popover>
  );
}

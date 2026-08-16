import React, { useState, useEffect } from 'react';
import { MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import Popover from './Popover';
import ColumnIcon from './ColumnIcon';
import CustomSelect from '../../../components/CustomSelect';
import { tr } from '../../../i18n';
import { getColumnType } from '../lib/columnTypes';
import { supabase } from '../../../lib/supabase';
import { fetchBoardColumnsCached } from '../lib/relationCache';

// Nagłówek kolumny: ikona typu + nazwa (edycja) + menu (ustawienia/usuń).
export default function ColumnHeader({ column, allColumns = [], onUpdate, onDelete }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [boards, setBoards] = useState([]);
  const [targetCols, setTargetCols] = useState([]);
  const t = getColumnType(column.type);

  useEffect(() => {
    if (column.type !== 'connect_board') return;
    supabase.from('boards').select('id, name').eq('is_archived', false).order('name').then(({ data }) => setBoards(data || []));
  }, [column.type]);

  // Lustro: załaduj kolumny połączonej tablicy (przez wybraną kolumnę connect_board)
  const throughCol = allColumns.find(c => c.id === column?.settings?.throughColumnId && c.type === 'connect_board');
  useEffect(() => {
    if (column.type !== 'mirror' || !throughCol?.settings?.targetBoardId) { setTargetCols([]); return; }
    fetchBoardColumnsCached(throughCol.settings.targetBoardId).then(setTargetCols);
  }, [column.type, throughCol?.settings?.targetBoardId]);

  const commit = () => { setRenaming(false); if (name.trim() && name !== column.name) onUpdate(column.id, { name: name.trim() }); };

  return (
    <div className="h-full flex items-center gap-1.5 px-2 group/col text-xs font-semibold text-gray-500 dark:text-gray-300">
      <ColumnIcon name={t.icon} size={13} className="text-gray-400 shrink-0" />
      {renaming ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="flex-1 min-w-0 bg-white dark:bg-gray-700 rounded px-1 outline-none ring-2 ring-accent-primary/40" />
      ) : (
        <span className="flex-1 truncate cursor-pointer" onDoubleClick={() => setRenaming(true)}>{column.name}</span>
      )}
      <Popover align="right" width={200} trigger={
        <button className="opacity-0 group-hover/col:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"><MoreHorizontal size={15} /></button>
      }>
        {({ close }) => (
          <div className="p-1.5">
            <button onClick={() => { setRenaming(true); close(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm text-gray-700 dark:text-gray-200">
              <Pencil size={14} /> Zmień nazwę
            </button>
            {column.type === 'number' && (
              <div className="px-2 py-1.5">
                <label className="text-[11px] text-gray-400">Jednostka</label>
                <input defaultValue={column.settings?.unit || ''} onBlur={(e) => onUpdate(column.id, { settings: { ...column.settings, unit: e.target.value } })}
                  className="w-full mt-1 text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 outline-none" placeholder="np. zł, h" />
              </div>
            )}
            {column.type === 'formula' && (
              <div className="px-2 py-1.5">
                <label className="text-[11px] text-gray-400">Wyrażenie</label>
                <input defaultValue={column.settings?.expression || ''} onBlur={(e) => onUpdate(column.id, { settings: { ...column.settings, expression: e.target.value } })}
                  className="w-full mt-1 text-sm bg-gray-100 dark:bg-gray-700/50 rounded px-2 py-1 outline-none font-mono" placeholder="{Budżet} * 2" />
                <p className="text-[10px] text-gray-400 mt-1">Odwołuj się do kolumn: {'{Nazwa}'}. Działania: + − × ÷ ( )</p>
              </div>
            )}
            {column.type === 'connect_board' && (
              <div className="px-2 py-1.5">
                <label className="text-[11px] text-gray-400">{tr('Połącz z tablicą')}</label>
                <div className="mt-1">
                  <CustomSelect compact placeholder={tr('— wybierz tablicę —')} value={column.settings?.targetBoardId || ''}
                    onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, targetBoardId: v || null } })}
                    options={boards} mapOptionToValue={(b) => b.id} mapOptionToLabel={(b) => b.name} />
                </div>
              </div>
            )}
            {column.type === 'mirror' && (
              <div className="px-2 py-1.5 space-y-1.5">
                <div>
                  <label className="text-[11px] text-gray-400">{tr('Przez kolumnę (połączenie)')}</label>
                  <div className="mt-1">
                    <CustomSelect compact placeholder={tr('— wybierz —')} value={column.settings?.throughColumnId || ''}
                      onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, throughColumnId: v || null, targetColumnId: null } })}
                      options={allColumns.filter(c => c.type === 'connect_board')} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
                  </div>
                </div>
                <div className={!throughCol ? 'opacity-50 pointer-events-none' : ''}>
                  <label className="text-[11px] text-gray-400">{tr('Odbij kolumnę')}</label>
                  <div className="mt-1">
                    <CustomSelect compact placeholder={tr('— wybierz —')} value={column.settings?.targetColumnId || ''}
                      onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, targetColumnId: v || null } })}
                      options={targetCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
                  </div>
                </div>
                {allColumns.filter(c => c.type === 'connect_board').length === 0 && (
                  <p className="text-[10px] text-amber-500">{tr('Najpierw dodaj kolumnę „Połącz tablice".')}</p>
                )}
              </div>
            )}
            <button onClick={() => { onDelete(column.id); close(); }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600">
              <Trash2 size={14} /> Usuń kolumnę
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}

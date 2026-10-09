import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, Trash2, Pencil, ArrowLeft, ArrowRight } from 'lucide-react';
import Popover from './Popover';
import LabelsEditor from './LabelsEditor';
import CustomSelect from '../../../components/CustomSelect';
import { tr } from '../../../i18n';
import { supabase } from '../../../lib/supabase';
import { fetchBoardColumnsCached } from '../lib/relationCache';
import { confirmDialog } from '../../../lib/dialog';

// Jeden wygląd nagłówków kolumn w tabeli (nazwa zadania i kolumny): 11 px, szarość 500 — gray-400
// na białym tle przy tej wielkości nie miała kontrastu 4.5:1.
export const COLUMN_HEADER_TEXT = 'text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';

// Pole ustawienia kolumny (jednostka, formuła): zapis na Enter, przy wyjściu z pola ORAZ przy
// zamknięciu menu (Esc / klik obok odmontowują pole bez blur — wcześniej zmiana przepadała).
function SettingInput({ value, onCommit, className, placeholder, label }) {
  const [v, setV] = useState(value || '');
  const latest = useRef({ v: value || '', saved: value || '' });
  latest.current.v = v;
  const commit = () => { if (latest.current.v !== latest.current.saved) { latest.current.saved = latest.current.v; onCommit(latest.current.v); } };
  useEffect(() => () => commit(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} aria-label={label}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} className={className} placeholder={placeholder} />
  );
}

// Nagłówek kolumny: nazwa (edycja) + menu (ustawienia/usuń). Bez ikony typu — nagłówki jak w
// pozostałych tabelach aplikacji (DataTable); typ kolumny widać po zawartości komórek.
export default function ColumnHeader({ column, allColumns = [], onUpdate, onDelete, onReorder }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [boards, setBoards] = useState([]);
  const [targetCols, setTargetCols] = useState([]);

  // Reorder kolumn (menu w lewo/prawo) — bez ryzykownego drag na duplikowanym nagłówku.
  const sortedCols = [...allColumns].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
  const idx = sortedCols.findIndex(c => c.id === column.id);
  const move = (dir) => {
    const j = idx + dir;
    if (!onReorder || j < 0 || j >= sortedCols.length) return;
    const ids = sortedCols.map(c => c.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    onReorder(ids);
  };

  useEffect(() => {
    if (column.type !== 'connect_board') return;
    // Bez szablonów — połączenie z szablonem tablicy nie ma sensu (szablon nie ma prawdziwych zadań).
    supabase.from('boards').select('id, name').eq('is_archived', false).eq('is_template', false).order('name').then(({ data }) => setBoards(data || []));
  }, [column.type]);

  // Lustro: załaduj kolumny połączonej tablicy (przez wybraną kolumnę connect_board)
  const throughCol = allColumns.find(c => c.id === column?.settings?.throughColumnId && c.type === 'connect_board');
  useEffect(() => {
    if (column.type !== 'mirror' || !throughCol?.settings?.targetBoardId) { setTargetCols([]); return; }
    fetchBoardColumnsCached(throughCol.settings.targetBoardId).then(setTargetCols).catch(() => setTargetCols([]));
  }, [column.type, throughCol?.settings?.targetBoardId]);

  const commit = () => { setRenaming(false); if (onUpdate && name.trim() && name !== column.name) onUpdate(column.id, { name: name.trim() }); };
  const cancel = () => { setName(column.name); setRenaming(false); };
  // Bez prawa do zmiany ani usuwania kolumn — sam nagłówek (bez menu, które kończyło się błędem 403).
  const canMenu = !!(onUpdate || onDelete);

  return (
    <div className={`board-th h-full flex items-center gap-1.5 px-2 group/col ${COLUMN_HEADER_TEXT}`}>
      {renaming ? (
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={commit} aria-label={tr('Nazwa kolumny')}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { e.preventDefault(); cancel(); } }}
          className="flex-1 min-w-0 bg-white dark:bg-gray-700 rounded px-1 outline-none ring-2 ring-accent-primary/40" />
      ) : (
        <span className={`flex-1 truncate ${onUpdate ? 'cursor-pointer' : ''}`} onDoubleClick={() => onUpdate && setRenaming(true)}>{column.name}</span>
      )}
      {canMenu && (
      <Popover align="right" width={(column.type === 'status' || column.type === 'priority') ? 280 : 220} triggerClassName="shrink-0" trigger={
        <button type="button" aria-label={tr('Ustawienia kolumny {name}', { name: column.name })}
          className="opacity-0 group-hover/col:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 p-1 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-[rgba(42,35,18,0.07)] dark:hover:text-gray-200 dark:hover:bg-white/10"><MoreHorizontal size={15} aria-hidden="true" /></button>
      }>
        {({ close }) => (
          <div className="py-1">
            {onUpdate && (
              <button type="button" onClick={() => { setRenaming(true); close(); }} className="pick-opt text-gray-800 dark:text-gray-100">
                <Pencil size={15} className="opacity-80" aria-hidden="true" /> {tr('Zmień nazwę')}
              </button>
            )}
            {onReorder && (
              <>
                <button type="button" onClick={() => { move(-1); close(); }} disabled={idx <= 0} className="pick-opt text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ArrowLeft size={15} className="opacity-80" aria-hidden="true" /> {tr('Przesuń w lewo')}
                </button>
                <button type="button" onClick={() => { move(1); close(); }} disabled={idx >= sortedCols.length - 1} className="pick-opt text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">
                  <ArrowRight size={15} className="opacity-80" aria-hidden="true" /> {tr('Przesuń w prawo')}
                </button>
              </>
            )}
            {onUpdate && (column.type === 'status' || column.type === 'priority') && (
              <div className="px-3 py-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{tr('Etykiety statusu')}</label>
                <div className="mt-1.5">
                  <LabelsEditor column={column} onUpdateColumn={onUpdate} />
                </div>
              </div>
            )}
            {onUpdate && column.type === 'number' && (
              <div className="px-3 py-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{tr('Jednostka')}</label>
                <SettingInput value={column.settings?.unit} label={tr('Jednostka')} onCommit={(unit) => onUpdate(column.id, { settings: { ...column.settings, unit } })}
                  className="w-full mt-1 h-8 px-2.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none" placeholder={tr('np. zł, h')} />
              </div>
            )}
            {onUpdate && column.type === 'formula' && (
              <div className="px-3 py-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{tr('Wyrażenie')}</label>
                <SettingInput value={column.settings?.expression} label={tr('Wyrażenie')} onCommit={(expression) => onUpdate(column.id, { settings: { ...column.settings, expression } })}
                  className="w-full mt-1 h-8 px-2.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none font-mono" placeholder={tr('{Budżet} * 2')} />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tr('Odwołuj się do kolumn: {example}. Działania: + − × ÷ ( )', { example: `{${tr('Nazwa')}}` })}</p>
              </div>
            )}
            {onUpdate && column.type === 'connect_board' && (
              <div className="px-3 py-2">
                <label className="text-xs font-bold text-gray-500 uppercase">{tr('Połącz z tablicą')}</label>
                <div className="mt-1">
                  <CustomSelect compact placeholder={tr('— wybierz tablicę —')} value={column.settings?.targetBoardId || ''}
                    onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, targetBoardId: v || null } })}
                    options={boards} mapOptionToValue={(b) => b.id} mapOptionToLabel={(b) => b.name} />
                </div>
              </div>
            )}
            {onUpdate && column.type === 'mirror' && (
              <div className="px-3 py-2 space-y-2">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">{tr('Przez kolumnę (połączenie)')}</label>
                  <div className="mt-1">
                    <CustomSelect compact placeholder={tr('— wybierz —')} value={column.settings?.throughColumnId || ''}
                      onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, throughColumnId: v || null, targetColumnId: null } })}
                      options={allColumns.filter(c => c.type === 'connect_board')} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
                  </div>
                </div>
                <div className={!throughCol ? 'opacity-50 pointer-events-none' : ''}>
                  <label className="text-xs font-bold text-gray-500 uppercase">{tr('Odbij kolumnę')}</label>
                  <div className="mt-1">
                    <CustomSelect compact placeholder={tr('— wybierz —')} value={column.settings?.targetColumnId || ''}
                      onChange={(v) => onUpdate(column.id, { settings: { ...column.settings, targetColumnId: v || null } })}
                      options={targetCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
                  </div>
                </div>
                {allColumns.filter(c => c.type === 'connect_board').length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{tr('Najpierw dodaj kolumnę „Połącz tablice".')}</p>
                )}
              </div>
            )}
            {onDelete && (
              <button type="button" onClick={async () => {
                close();
                const ok = await confirmDialog({
                  title: tr('Usunąć kolumnę „{name}”?', { name: column.name }),
                  message: tr('Wartości tej kolumny znikną ze wszystkich zadań. Tej operacji nie można cofnąć.'),
                  confirmLabel: tr('Usuń kolumnę'),
                  danger: true,
                });
                if (ok) onDelete(column.id);
              }} className="pick-opt text-red-600 dark:text-red-400 border-t border-gray-100 dark:border-white/10">
                <Trash2 size={15} aria-hidden="true" /> {tr('Usuń kolumnę')}
              </button>
            )}
          </div>
        )}
      </Popover>
      )}
    </div>
  );
}

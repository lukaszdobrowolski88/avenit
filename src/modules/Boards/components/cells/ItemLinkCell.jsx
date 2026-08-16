import React, { useState, useMemo } from 'react';
import { Check, Search, X, Link2, GitBranch, AlertTriangle } from 'lucide-react';
import Popover from '../Popover';
import { supabase } from '../../../../lib/supabase';

// Prosty cache elementów per-tablica (nazwy do pickera relacji).
const itemsCache = new Map();
async function fetchBoardItems(boardId) {
  if (itemsCache.has(boardId)) return itemsCache.get(boardId);
  const { data } = await supabase.from('board_items').select('id, name').eq('board_id', boardId).is('parent_item_id', null);
  const rows = data || [];
  itemsCache.set(boardId, rows);
  return rows;
}
export function invalidateItemsCache(boardId) { itemsCache.delete(boardId); }

// Komórka relacji: łączy element z innymi elementami (connect_board=inna tablica,
// dependency=ta sama tablica). Wartość: [{ id, name }].
export default function ItemLinkCell({ column, value = [], onChange, currentItemId, mode = 'connect', readOnly }) {
  const linked = value || [];
  const [q, setQ] = useState('');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const sourceBoardId = mode === 'connect' ? column?.settings?.targetBoardId : column?.board_id;
  const Icon = mode === 'connect' ? Link2 : GitBranch;

  const loadOptions = async () => {
    if (loaded || !sourceBoardId) return;
    const rows = await fetchBoardItems(sourceBoardId);
    setOptions(rows.filter(r => r.id !== currentItemId));
    setLoaded(true);
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter(o => !s || (o.name || '').toLowerCase().includes(s));
  }, [q, options]);

  const isLinked = (id) => linked.some(l => l.id === id);
  const toggle = (o) => {
    if (isLinked(o.id)) onChange(linked.filter(l => l.id !== o.id));
    else onChange([...linked, { id: o.id, name: o.name || 'Element' }]);
  };

  const Chips = (
    <div className="w-full h-full flex items-center gap-1 px-2 flex-wrap overflow-hidden">
      {linked.length === 0
        ? <span className="text-gray-300 dark:text-gray-600 text-xs flex items-center gap-1"><Icon size={12} /> —</span>
        : linked.map(l => (
          <span key={l.id} className="text-[11px] px-2 py-0.5 rounded-full bg-accent-primary/10 text-accent-primary whitespace-nowrap flex items-center gap-1">
            <Icon size={10} /> {l.name}
          </span>
        ))}
    </div>
  );

  if (readOnly) return Chips;

  if (mode === 'connect' && !sourceBoardId) {
    return (
      <div className="w-full h-full flex items-center px-2 text-[11px] text-amber-500 gap-1">
        <AlertTriangle size={12} /> wskaż tablicę
      </div>
    );
  }

  return (
    <Popover width={260} trigger={Chips} onOpenChange={(o) => o && loadOptions()}>
      {() => (
        <div className="p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-2">
            <Search size={14} className="text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj elementu..."
              className="bg-transparent text-sm outline-none w-full text-gray-700 dark:text-gray-200" />
          </div>
          {linked.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {linked.map(l => (
                <span key={l.id} className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5 text-xs">
                  {l.name}<button onClick={() => onChange(linked.filter(x => x.id !== l.id))}><X size={12} className="text-gray-400 hover:text-red-500" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="max-h-56 overflow-y-auto custom-scrollbar">
            {!loaded && <div className="text-xs text-gray-400 text-center py-3">Ładowanie…</div>}
            {loaded && filtered.map(o => (
              <button key={o.id} onClick={() => toggle(o)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left">
                <span className="flex-1 min-w-0 text-sm text-gray-700 dark:text-gray-200 truncate">{o.name || 'Bez nazwy'}</span>
                {isLinked(o.id) && <Check size={15} className="text-accent-primary" />}
              </button>
            ))}
            {loaded && filtered.length === 0 && <div className="text-xs text-gray-400 text-center py-3">Brak elementów</div>}
          </div>
        </div>
      )}
    </Popover>
  );
}

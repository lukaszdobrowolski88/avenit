import React, { useState, useMemo, useEffect } from 'react';
import { Check, Link2, GitBranch } from 'lucide-react';
import Popover from '../Popover';
import { fetchBoardItemsFull } from '../../lib/relationCache';
import { toast } from '../../../../lib/toast';
import { tr } from '../../../../i18n';
import { CELL_TRIGGER, HoverPlus } from './BasicCells';
import { listArrowNav } from './StatusCell';
import '../../../../components/pickList.css';

// Elementy tablicy bierzemy ze wspólnego cache relacji (ten sam co kolumna Lustro) — wcześniej
// komórka miała własny, nigdy nie odświeżany cache i nowe elementy nie pojawiały się w wyborze.
// Błąd wczytania: jeden komunikat, nie po jednym z każdej komórki.
let lastErrorAt = 0;
function reportLoadError() {
  if (Date.now() - lastErrorAt < 10000) return;
  lastErrorAt = Date.now();
  toast.error(tr('Nie udało się wczytać elementów do połączenia'));
}

function ItemLinkPicker({ sourceBoardId, currentItemId, linked, onChange }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ loading: true, rows: [], error: false });

  useEffect(() => {
    let alive = true;
    fetchBoardItemsFull(sourceBoardId)
      .then((rows) => { if (alive) setState({ loading: false, rows: (rows || []).filter(r => r.id !== currentItemId), error: false }); })
      .catch(() => { if (alive) setState({ loading: false, rows: [], error: true }); reportLoadError(); });
    return () => { alive = false; };
  }, [sourceBoardId, currentItemId]);

  const isLinked = (id) => linked.some(l => l.id === id);
  const toggle = (o) => {
    if (isLinked(o.id)) onChange(linked.filter(l => l.id !== o.id));
    else onChange([...linked, { id: o.id, name: o.name || tr('Element') }]);
  };

  const { chosen, others } = useMemo(() => {
    const s = q.trim().toLowerCase();
    const match = (o) => !s || (o.name || '').toLowerCase().includes(s);
    const byId = new Map(state.rows.map(r => [r.id, r]));
    return {
      // Połączone na górze — także te, których już nie ma w tablicy (da się je odpiąć).
      chosen: linked.map(l => byId.get(l.id) || l).filter(match),
      others: state.rows.filter(r => !isLinked(r.id) && match(r)),
    };
  }, [q, state.rows, linked]);

  const option = (o) => {
    const sel = isLinked(o.id);
    return (
      <button key={o.id} type="button" role="option" aria-selected={sel} onClick={() => toggle(o)}
        className="pick-opt text-gray-800 dark:text-gray-100">
        <span className="pick-check" aria-hidden="true">{sel && <Check size={12} strokeWidth={3} />}</span>
        <span className="min-w-0 truncate">{o.name || tr('Bez nazwy')}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col" onKeyDown={listArrowNav}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Szukaj elementu...')}
        aria-label={tr('Szukaj elementu...')} className="pick-search bg-transparent text-gray-800 dark:text-gray-100" />
      <div role="listbox" aria-multiselectable="true" aria-label={tr('Elementy')} className="max-h-64 overflow-y-auto custom-scrollbar py-1">
        {chosen.length > 0 && <div className="pick-section" role="presentation">{tr('Połączone')}</div>}
        {chosen.map(option)}
        {chosen.length > 0 && others.length > 0 && <div className="pick-section" role="presentation">{tr('Pozostałe')}</div>}
        {others.map(option)}
        {state.loading && <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">{tr('Ładowanie…')}</div>}
        {state.error && <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4 px-3" role="alert">{tr('Nie udało się wczytać elementów do połączenia')}</div>}
        {!state.loading && !state.error && chosen.length + others.length === 0 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">{q.trim() ? tr('Brak wyników') : tr('Brak elementów')}</div>
        )}
      </div>
    </div>
  );
}

// Komórka relacji: łączy element z innymi elementami (connect_board=inna tablica,
// dependency=ta sama tablica). Wartość: [{ id, name }].
export default function ItemLinkCell({ column, value = [], onChange, currentItemId, mode = 'connect', readOnly }) {
  const linked = Array.isArray(value) ? value : [];
  const sourceBoardId = mode === 'connect' ? column?.settings?.targetBoardId : column?.board_id;
  const Icon = mode === 'connect' ? Link2 : GitBranch;

  // Połączone elementy jako neutralne, miękkie pigułki; pusto = pusto (bez „—” w każdym wierszu).
  const chips = linked.map(l => (
    <span key={l.id} className="shrink-0 max-w-full inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap overflow-hidden">
      <Icon size={11} className="shrink-0 opacity-70" aria-hidden="true" /><span className="truncate">{l.name}</span>
    </span>
  ));

  if (readOnly) return <div className="w-full h-full flex items-center gap-1 px-2 overflow-hidden">{chips}</div>;

  const name = column?.name || (mode === 'connect' ? tr('Połącz tablice') : tr('Zależności'));
  return (
    <Popover width={300} bare className="pick-pop overflow-hidden" trigger={
      <button type="button" aria-haspopup="listbox"
        aria-label={linked.length ? `${name}: ${linked.map(l => l.name).join(', ')}` : name}
        className={`${CELL_TRIGGER} overflow-hidden`}>
        {linked.length ? chips : <HoverPlus />}
      </button>
    }>
      {() => (sourceBoardId ? (
        <ItemLinkPicker sourceBoardId={sourceBoardId} currentItemId={currentItemId} linked={linked} onChange={onChange} />
      ) : (
        // Nieskonfigurowana kolumna: podpowiedź tylko tutaj, nie ostrzeżenie w każdym wierszu.
        <p className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{tr('Najpierw wskaż tablicę do połączenia w ustawieniach kolumny.')}</p>
      ))}
    </Popover>
  );
}

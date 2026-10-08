import React, { useState, useMemo } from 'react';
import { Check, Plus, Pencil } from 'lucide-react';
import Popover from '../Popover';
import LabelsEditor from '../LabelsEditor';
import { resolveOptions } from '../../lib/columnTypes';
import { uid } from '../../lib/constants';
import { LABEL_COLORS, boardColor } from '../../lib/palette';
import { StatusPill } from '../../../../components/ui/DataTable';
import { tr } from '../../../../i18n';
import { CELL_TRIGGER, HoverPlus } from './BasicCells';
import { listArrowNav } from './StatusCell';
import '../../../../components/pickList.css';

// Okienko listy wyboru: wyszukiwarka (pick-search) + wiersze z kwadratem zaznaczenia (pick-opt),
// jak wybór osób. Tworzenie/edycja/usuwanie opcji tylko z prawem do struktury kolumny.
function TagsPicker({ column, value, onChange, onUpdateColumn, close }) {
  const options = column?.settings?.options || [];
  const ids = Array.isArray(value) ? value : [];
  const multi = column?.settings?.multi !== false;
  const canEdit = typeof onUpdateColumn === 'function';
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return options.filter(o => !s || (o.title || '').toLowerCase().includes(s));
  }, [q, options]);
  const title = q.trim();
  const canCreate = canEdit && title && !options.some(o => (o.title || '').toLowerCase() === title.toLowerCase());

  const toggle = (id) => {
    if (!multi) { onChange(ids.includes(id) ? [] : [id]); close(); return; }
    onChange(ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };
  const create = () => {
    if (!canCreate) return;
    const used = options.map(o => boardColor(o.color));
    const color = LABEL_COLORS.find(c => !used.includes(c)) || LABEL_COLORS[options.length % LABEL_COLORS.length];
    const opt = { id: uid('opt'), title, color };
    onUpdateColumn(column.id, { settings: { ...column.settings, options: [...options, opt] } });
    onChange(multi ? [...ids, opt.id] : [opt.id]);
    setQ('');
  };

  if (editing && canEdit) {
    return (
      <div className="p-3">
        <LabelsEditor column={column} onUpdateColumn={onUpdateColumn} field="options"
          // Usunięta opcja znika też z tego zadania od razu.
          onRemoved={(id) => { if (ids.includes(id)) onChange(ids.filter(i => i !== id)); }} />
        <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-white/10">
          <button type="button" onClick={() => setEditing(false)}
            className="text-xs font-semibold px-3 h-7 rounded-full bg-[rgba(42,35,18,0.06)] dark:bg-white/10 text-gray-700 dark:text-gray-200 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
            {tr('Gotowe')}
          </button>
        </div>
      </div>
    );
  }

  const searchLabel = canEdit ? tr('Szukaj lub utwórz opcję...') : tr('Szukaj opcji...');
  return (
    <div className="flex flex-col" onKeyDown={listArrowNav}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchLabel} aria-label={searchLabel}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          // Enter: jedyny pasujący wynik → zaznacz; brak takiej opcji → utwórz.
          if (filtered.length === 1) { toggle(filtered[0].id); setQ(''); } else if (canCreate) create();
        }}
        className="pick-search bg-transparent text-gray-800 dark:text-gray-100" />
      <div role="listbox" aria-multiselectable={multi} aria-label={column?.name || tr('Opcje')} className="max-h-64 overflow-y-auto custom-scrollbar py-1">
        {filtered.map(o => {
          const sel = ids.includes(o.id);
          return (
            <button key={o.id} type="button" role="option" aria-selected={sel} onClick={() => toggle(o.id)}
              className="pick-opt text-gray-800 dark:text-gray-100">
              <span className="pick-check" aria-hidden="true">{sel && <Check size={12} strokeWidth={3} />}</span>
              <StatusPill color={boardColor(o.color)} className="min-w-0 max-w-full overflow-hidden">{o.title}</StatusPill>
            </button>
          );
        })}
        {canCreate && (
          <button type="button" onClick={create} className="pick-opt text-gray-700 dark:text-gray-200">
            <Plus size={15} className="shrink-0 opacity-80" aria-hidden="true" />
            <span className="min-w-0 truncate">{tr('Utwórz „{name}”', { name: title })}</span>
          </button>
        )}
        {filtered.length === 0 && !canCreate && (
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4 px-3">{options.length ? tr('Brak wyników') : tr('Brak opcji')}</div>
        )}
      </div>
      {canEdit && options.length > 0 && (
        <div className="border-t border-gray-100 dark:border-white/10 py-1">
          <button type="button" onClick={() => setEditing(true)} className="pick-opt text-gray-600 dark:text-gray-300">
            <Pencil size={15} className="opacity-80" aria-hidden="true" /> {tr('Edytuj opcje')}
          </button>
        </div>
      )}
    </div>
  );
}

// Komórka Lista wyboru (dropdown) — wybrane opcje jako te same miękkie pigułki co Status
// (wcześniej nasycone kolory z białym tekstem). Pusto = pusto, „+” tylko po najechaniu.
export default function TagsCell({ column, value = [], onChange, onUpdateColumn, readOnly }) {
  const selected = resolveOptions(column, value);
  const chips = selected.map(o => (
    <StatusPill key={o.id} color={boardColor(o.color)} className="shrink-0 max-w-full overflow-hidden">{o.title}</StatusPill>
  ));

  if (readOnly) {
    return <div className="w-full h-full flex items-center gap-1 px-2 overflow-hidden">{chips}</div>;
  }

  const name = column?.name || tr('Lista wyboru');
  return (
    <Popover width={260} bare className="pick-pop overflow-hidden" trigger={
      <button type="button" aria-haspopup="listbox"
        aria-label={selected.length ? `${name}: ${selected.map(o => o.title).join(', ')}` : name}
        className={`${CELL_TRIGGER} overflow-hidden`}>
        {selected.length ? chips : <HoverPlus />}
      </button>
    }>
      {({ close }) => (
        <TagsPicker column={column} value={value} onChange={onChange} onUpdateColumn={onUpdateColumn} close={close} />
      )}
    </Popover>
  );
}

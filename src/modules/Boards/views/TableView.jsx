import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight, ChevronDown, Plus, GripVertical,
  Trash2, Maximize2, MessageSquare, X, CornerDownRight, Pencil, SearchX, ListTodo, CheckSquare,
} from 'lucide-react';
import BoardCell from '../components/BoardCell';
import ColumnHeader, { COLUMN_HEADER_TEXT } from '../components/ColumnHeader';
import AddColumnMenu from '../components/AddColumnMenu';
import Popover from '../components/Popover';
import { PeoplePickList } from '../components/ViewToolbar';
import EmptyState from '../../../components/EmptyState';
import Button from '../../../components/Button';
import ActionMenu from '../../../components/ActionMenu';
import CustomDatePicker from '../../../components/CustomDatePicker';
import { StatusPill, STATUS_COLORS as APP } from '../../../components/ui/DataTable';
import TableCards, { useNarrow } from './TableCards';
import { summarizeColumn } from '../lib/summaries';
import { applyView, hasActiveFilters, ME } from '../lib/viewData';
import { resolveDragEnd } from '../lib/dnd';
import { GROUP_COLORS } from '../lib/constants';
import { shortcutBlocked } from '../lib/keyboard';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import '../../../components/toolbar.css';
import '../../../components/pickList.css';

const HANDLE_W = 46; // checkbox z odstępem od krawędzi + uchwyt przeciągania
const NAME_MIN = 260;
const ADDCOL_W = 44;
const lower = (v) => String(v ?? '').trim().toLowerCase();
const EMPTY = [];

// Akcje w wierszu jak w pozostałych tabelach aplikacji (Baza pieśni): okrągłe przyciski ikon,
// widoczne po najechaniu na wiersz, przy fokusie i zawsze na ekranach dotykowych.
const ROW_ACTION = 'inline-grid place-items-center w-7 h-7 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-800 hover:bg-[rgba(42,35,18,0.07)] dark:hover:text-white dark:hover:bg-white/10 transition-colors opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

// Nazwy kolorów grup (menu ⋯ grupy) — dla czytnika ekranu i podpisu pozycji.
const COLOR_NAMES = {
  [APP.success]: 'Zielony', [APP.warning]: 'Pomarańczowy', [APP.danger]: 'Czerwony',
  [APP.info]: 'Niebieski', [APP.accent]: 'Musztardowy', [APP.neutral]: 'Szary',
};
// Ikona-kropka koloru dla ActionMenu (stała tożsamość komponentu per kolor).
const DOT_ICONS = Object.fromEntries(GROUP_COLORS.map((c) => [c, function ColorDot({ size = 15, className = '' }) {
  return <span className={`inline-block rounded-full ${className}`} style={{ width: size - 3, height: size - 3, backgroundColor: c }} aria-hidden="true" />;
}]));

// Uchwyt zmiany szerokości kolumny — podgląd na żywo, zapis do bazy raz na koniec.
function ColResizeHandle({ width, onResize, onCommit }) {
  const onDown = (e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startW = width; let lastW = startW;
    const move = (ev) => { lastW = Math.max(80, startW + (ev.clientX - startX)); onResize(lastW); };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      if (lastW !== startW) onCommit(lastW);
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div onPointerDown={onDown} onClick={(e) => e.stopPropagation()} aria-hidden="true"
    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-accent-primary/50 z-20"
    title={tr('Przeciągnij, by zmienić szerokość')} />;
}

// ── Podsumowanie kolumny (stopka grupy) ──────────────────────────────
// Tylko sumy liczb i czasu (statusy widać w wierszach; „0/1” przy osobach/datach to szum).
function SummaryCell({ column, items }) {
  const s = summarizeColumn(column, items);
  if (s.kind === 'number') {
    return <div className="w-full text-right px-2 text-sm font-semibold tabular-nums text-gray-600 dark:text-gray-300">{s.sum}</div>;
  }
  if (s.kind === 'duration') {
    return <div className="w-full text-right px-2 text-sm font-semibold tabular-nums text-gray-600 dark:text-gray-300">{s.text}</div>;
  }
  return null;
}
const hasSummary = (column, items) => ['number', 'duration'].includes(summarizeColumn(column, items).kind);

// ── Wiersz zadania (sortowalny + memoizowany) ───────────────────────
// Siatka ARIA: wiersz = role="row", każda komórka = role="gridcell". Uchwyt przeciągania jest
// przyciskiem (Tab → spacja → strzałki ↑/↓ → spacja), widocznym także przy fokusie z klawiatury.
const ItemRow = React.memo(function ItemRow({ item, columns, people, me, onCell, onUpdateColumn, onOpen, onDelete, updatesCount,
  selected, onToggleSelect, hasSub, subCount, expanded, onToggleExpand, onAddSub, isSub, terms, can }) {
  const canDrag = !isSub && can.editItems;
  const sortable = useSortable({ id: item.id, disabled: !canDrag });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  // Nazwa: lokalny stan + commit na blur/Enter. Zmiana z zewnątrz nie nadpisuje pisanej nazwy.
  const [nameLocal, setNameLocal] = useState(item.name);
  const nameRef = useRef(null);
  const dirty = useRef(false);
  useEffect(() => {
    if (dirty.current && document.activeElement === nameRef.current) return;
    dirty.current = false;
    setNameLocal(item.name);
  }, [item.name]);
  const label = item.name || tr('Bez nazwy');
  // content-visibility:auto = natywna wirtualizacja przeglądarki (pomija render wierszy poza
  // ekranem). contain-intrinsic-size pamięta realną wysokość → bez skoków scrolla.
  const style = {
    transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
    contentVisibility: isDragging ? 'visible' : 'auto', containIntrinsicSize: 'auto 44px',
  };
  return (
    <div ref={setNodeRef} style={style} role="row" aria-selected={isSub ? undefined : !!selected}
      className={`flex items-stretch border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 group/row min-h-[44px] ${isSub ? 'bg-gray-50/50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-800'}`}>
      <div role="gridcell" className="flex items-center gap-0.5 pl-3 shrink-0" style={{ width: HANDLE_W }}>
        {isSub ? null : (
          <>
            <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect(item.id)}
              aria-label={tr('Zaznacz: {name}', { name: label })}
              className={`ui-check ${selected ? '' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'}`} />
            {canDrag && (
              <span {...attributes} {...listeners} aria-label={tr('Przeciągnij, by zmienić kolejność: {name}', { name: label })}
                className="text-gray-400 dark:text-gray-500 cursor-grab active:cursor-grabbing rounded outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                <GripVertical size={13} className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100" aria-hidden="true" />
              </span>
            )}
          </>
        )}
      </div>
      {/* Nazwa zadania */}
      <div role="gridcell" className="flex items-center gap-1 px-2" style={{ flex: 1, minWidth: NAME_MIN, paddingLeft: isSub ? 34 : 8 }}>
        {isSub && <CornerDownRight size={14} className="shrink-0 text-gray-300 dark:text-gray-500" aria-hidden="true" />}
        {!isSub && (
          hasSub ? (
            <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
              aria-label={expanded ? tr('Zwiń podzadania') : tr('Rozwiń podzadania')}
              className="shrink-0 p-0.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            </button>
          ) : <span className="shrink-0 w-[17px]" aria-hidden="true" />
        )}
        <input ref={nameRef} value={nameLocal ?? ''} readOnly={!can.editItems}
          placeholder={isSub ? tr(terms.sub) : tr(terms.placeholder)} aria-label={tr(terms.column)} data-item-name={item.id}
          onChange={(e) => { dirty.current = true; setNameLocal(e.target.value); }}
          onBlur={() => { if (dirty.current && nameLocal !== item.name) onCell(item.id, '__name__', nameLocal); dirty.current = false; }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') { dirty.current = false; setNameLocal(item.name); e.currentTarget.blur(); }
          }}
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/40" />
        {!isSub && subCount > 0 && <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 tabular-nums" title={tr('Podzadania')}>{subCount}</span>}
        <button type="button" onClick={() => onOpen(item)} title={tr('Otwórz')} aria-label={tr('Otwórz: {name}', { name: label })} className={ROW_ACTION}>
          <Maximize2 size={13} aria-hidden="true" />
        </button>
        {!isSub && (
          // Dymek komentarzy: widoczny, gdy są komentarze; inaczej dopiero po najechaniu na wiersz.
          <button type="button" onClick={() => onOpen(item)} title={tr('Komentarze')} aria-label={tr('Komentarze: {n}', { n: updatesCount })}
            className={updatesCount > 0 ? 'inline-flex items-center gap-0.5 h-7 px-1.5 rounded-full text-gray-500 hover:text-gray-800 hover:bg-[rgba(42,35,18,0.07)] dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10' : ROW_ACTION}>
            <MessageSquare size={14} aria-hidden="true" />
            {updatesCount > 0 && <span className="text-[11px] tabular-nums">{updatesCount}</span>}
          </button>
        )}
        {!isSub && onAddSub && can.createItems && (
          <button type="button" onClick={() => onAddSub(item)} title={tr('Dodaj podzadanie')} aria-label={tr('Dodaj podzadanie do: {name}', { name: label })} className={ROW_ACTION}>
            <Plus size={13} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Komórki kolumn */}
      {columns.map(col => (
        <div key={col.id} role="gridcell" className="shrink-0 flex items-stretch" style={{ width: col.width || 160 }}>
          <BoardCell column={col} value={item.cells?.[col.id]} people={people} me={me} item={item} columns={columns}
            onChange={(v) => onCell(item.id, col.id, v)} onUpdateColumn={onUpdateColumn} />
        </div>
      ))}
      <div role="gridcell" className="flex items-center justify-center shrink-0" style={{ width: ADDCOL_W }}>
        {can.deleteItems && (
          <button type="button" onClick={() => onDelete(item)} title={tr('Usuń')} aria-label={tr('Usuń: {name}', { name: label })}
            className={`${ROW_ACTION} hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-500/10`}>
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}, (a, b) => (
  // Re-render tylko gdy zmienią się DANE wiersza (callbacki logicznie stałe — ignorujemy ich tożsamość).
  a.item === b.item && a.columns === b.columns &&
  a.people === b.people && a.me === b.me && a.can === b.can &&
  a.updatesCount === b.updatesCount && a.selected === b.selected && a.hasSub === b.hasSub &&
  a.subCount === b.subCount && a.expanded === b.expanded && a.isSub === b.isSub && a.terms === b.terms
));

// Pole „zaznacz wszystkie” — z obsługą stanu pośredniego (część zaznaczona).
function SelectAllBox({ ids, selected, onSelectMany, label, className = '' }) {
  const ref = useRef(null);
  const count = ids.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0);
  const all = ids.length > 0 && count === ids.length;
  const some = count > 0 && !all;
  useEffect(() => { if (ref.current) ref.current.indeterminate = some; }, [some]);
  if (!ids.length) return null;
  return (
    <input ref={ref} type="checkbox" checked={all} aria-checked={some ? 'mixed' : all}
      onChange={() => onSelectMany(ids, !all)} aria-label={label} className={`ui-check ${className}`} />
  );
}

// ── Blok grupy ───────────────────────────────────────────────────────
function GroupBlock({ group, columns, groupItems, subsByParent, people, me, api, onOpen, onDeleteItem, onDeleteGroup, updatesCountByItem,
  selected, onToggleSelect, onSelectMany, expanded, onToggleExpand, terms, can }) {
  const collapsed = group.collapsed;
  // Strefa upuszczania grupy — pozwala przeciągnąć zadanie także do PUSTEJ grupy (DnD na poziomie tablicy).
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: group.id });

  const totalWidth = HANDLE_W + NAME_MIN + columns.reduce((s, c) => s + (c.width || 160), 0) + ADDCOL_W;
  const [renaming, setRenaming] = useState(false);
  const groupIds = useMemo(() => groupItems.map(i => i.id), [groupItems]);

  // Menu ⋯ grupy — wspólne ActionMenu (jak menu tablicy): nazwa, kolor, usuń.
  const menuItems = [
    ...(can.editGroups ? [
      { key: 'rename', icon: Pencil, label: tr('Zmień nazwę'), onClick: () => setRenaming(true) },
      { divider: true },
      ...GROUP_COLORS.map((c) => ({
        key: `color-${c}`, icon: DOT_ICONS[c], label: tr('Kolor: {name}', { name: tr(COLOR_NAMES[c] || 'Kolor') }),
        hint: group.color === c ? tr('wybrany') : undefined, disabled: group.color === c,
        onClick: () => api.updateGroup(group.id, { color: c }),
      })),
    ] : []),
    ...(can.deleteGroups ? [
      ...(can.editGroups ? [{ divider: true }] : []),
      { key: 'delete', icon: Trash2, label: tr('Usuń grupę'), danger: true, onClick: () => onDeleteGroup(group) },
    ] : []),
  ];

  return (
    <section className="mb-6" aria-label={group.name}>
      {/* Nagłówek grupy — kanon: neutralna nazwa + kolorowa kropka + licznik */}
      <div className="flex items-center gap-2 mb-1.5 pl-0.5 text-gray-900 dark:text-white">
        <button type="button" onClick={() => api.updateGroup(group.id, { collapsed: !collapsed })} aria-expanded={!collapsed}
          aria-label={collapsed ? tr('Rozwiń grupę {name}', { name: group.name }) : tr('Zwiń grupę {name}', { name: group.name })}
          className="p-0.5 rounded text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} aria-hidden="true" />
        <GroupTitle group={group} canEdit={can.editGroups} editing={renaming} onStartEdit={() => setRenaming(true)} onStopEdit={() => setRenaming(false)} onRename={(name) => api.updateGroup(group.id, { name })} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{groupItems.length}</span>
        {menuItems.length > 0 && <ActionMenu variant="ghost" align="left" label={tr('Więcej działań: {name}', { name: group.name })} items={menuItems} />}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-gray-200 dark:border-gray-700" role="grid" aria-label={group.name} aria-multiselectable="true">
          <div style={{ minWidth: totalWidth }} role="presentation">
            {/* Nagłówek kolumn */}
            <div className="flex items-stretch bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-10" role="row">
              <div role="columnheader" className="shrink-0 flex items-center pl-3" style={{ width: HANDLE_W }}>
                <SelectAllBox ids={groupIds} selected={selected} onSelectMany={onSelectMany}
                  label={tr('Zaznacz wszystkie w grupie {name}', { name: group.name })} />
              </div>
              <div role="columnheader" className={`board-th flex items-center px-2 ${COLUMN_HEADER_TEXT}`} style={{ flex: 1, minWidth: NAME_MIN }}>{tr(terms.column)}</div>
              {columns.map(col => (
                <div key={col.id} className="shrink-0 relative" style={{ width: col.width || 160 }} role="columnheader">
                  <ColumnHeader column={col} allColumns={columns}
                    onUpdate={can.editColumns ? api.updateColumn : undefined}
                    onDelete={can.deleteColumns ? api.deleteColumn : undefined}
                    onReorder={can.editColumns ? api.reorderColumns : undefined} />
                  {can.editColumns && <ColResizeHandle width={col.width || 160}
                    onResize={(w) => api.setColumnWidthLocal(col.id, w)}
                    onCommit={(w) => api.updateColumn(col.id, { width: w })} />}
                </div>
              ))}
              <div role="columnheader" aria-label={can.addColumns ? tr('Dodaj kolumnę') : undefined} className="shrink-0 flex items-center justify-center" style={{ width: ADDCOL_W }}>{can.addColumns && <AddColumnMenu onAdd={api.addColumn} />}</div>
            </div>

            {/* Wiersze — droppable grupy (jeden DndContext jest na poziomie tablicy) */}
            <div ref={setDropRef} role="rowgroup" className={isOver ? 'bg-accent-primary/5 transition-colors' : ''}>
              <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
                {groupItems.map(it => {
                  const subs = subsByParent.get(it.id) || [];
                  return (
                    <React.Fragment key={it.id}>
                      <ItemRow item={it} columns={columns} people={people} me={me} terms={terms} can={can}
                        onCell={api.setCell} onUpdateColumn={api.updateColumn} onOpen={onOpen} onDelete={onDeleteItem}
                        updatesCount={updatesCountByItem?.[it.id] || 0}
                        selected={selected.has(it.id)} onToggleSelect={onToggleSelect}
                        hasSub={subs.length > 0} subCount={subs.length} expanded={expanded.has(it.id)}
                        onToggleExpand={() => onToggleExpand(it.id)}
                        onAddSub={(parent) => api.addSubitem(parent).then(() => onToggleExpand(parent.id, true))} />
                      {expanded.has(it.id) && subs.map(sub => (
                        <ItemRow key={sub.id} item={sub} columns={columns} people={people} me={me} terms={terms} can={can}
                          onCell={api.setCell} onUpdateColumn={api.updateColumn} onOpen={onOpen} onDelete={onDeleteItem} isSub />
                      ))}
                    </React.Fragment>
                  );
                })}
              </SortableContext>

              {/* Dodaj zadanie */}
              {can.createItems && (
                <div role="row" className="flex items-center bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60">
                  <div role="gridcell" className="shrink-0" style={{ width: HANDLE_W }} />
                  <div role="gridcell" style={{ flex: 1, minWidth: NAME_MIN }}>
                    <button type="button" onClick={() => api.addItem(group.id)}
                      className="w-full flex items-center gap-1.5 px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                      <Plus size={15} aria-hidden="true" /> {tr(terms.addRow)}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Podsumowania — tylko gdy któraś kolumna ma co zsumować (liczby, czas) */}
            {columns.some(col => hasSummary(col, groupItems)) && (
            <div role="row" className="flex items-stretch bg-gray-50/70 dark:bg-gray-800/60 min-h-[34px]">
              <div role="gridcell" className="shrink-0" style={{ width: HANDLE_W }} />
              <div role="gridcell" className="shrink-0 " style={{ flex: 1, minWidth: NAME_MIN }} />
              {columns.map(col => (
                <div key={col.id} role="gridcell" className="shrink-0 flex items-center" style={{ width: col.width || 160 }}>
                  <SummaryCell column={col} items={groupItems} />
                </div>
              ))}
              <div role="gridcell" className="shrink-0" style={{ width: ADDCOL_W }} />
            </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function GroupTitle({ group, canEdit, editing, onStartEdit, onStopEdit, onRename }) {
  const [name, setName] = useState(group.name);
  useEffect(() => { setName(group.name); }, [group.name]);
  if (editing) {
    return (
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label={tr('Nazwa grupy')}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => { onStopEdit(); if (name.trim() && name !== group.name) onRename(name.trim()); }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); setName(group.name); onStopEdit(); } }}
        className="font-semibold text-sm bg-white dark:bg-gray-700 rounded px-1.5 py-0.5 outline-none ring-2 ring-accent-primary/40 text-gray-900 dark:text-white" />
    );
  }
  if (!canEdit) return <h3 className="font-semibold text-sm">{group.name}</h3>;
  return (
    <button type="button" onClick={onStartEdit} title={tr('Kliknij, aby zmienić nazwę')}
      className="font-semibold text-sm rounded px-1 -mx-1 hover:bg-gray-100 dark:hover:bg-gray-700/60 cursor-text">
      {group.name}
    </button>
  );
}

// Lista etykiet do zmiany zbiorczej (status / priorytet).
function LabelPickList({ column, onPick }) {
  return (
    <div className="py-1" role="listbox" aria-label={column.name}>
      {(column.settings?.labels || []).map(l => (
        <button key={l.id} type="button" role="option" aria-selected="false" onClick={() => onPick(l.id)} className="pick-opt">
          <StatusPill color={l.color}>{l.title}</StatusPill>
        </button>
      ))}
      <button type="button" onClick={() => onPick(null)} className="pick-opt text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-white/10">
        <X size={15} className="opacity-80" aria-hidden="true" /> {tr('Wyczyść')}
      </button>
    </div>
  );
}

// ── Widok Tabela ─────────────────────────────────────────────────────
const DEFAULT_TERMS = { column: 'Element', placeholder: 'Nazwa elementu', addRow: 'Dodaj element', sub: 'Podelement' };
const ALL_ALLOWED = {
  createItems: true, editItems: true, deleteItems: true, addColumns: true, editColumns: true, deleteColumns: true,
  addGroups: true, editGroups: true, deleteGroups: true,
};

export default function TableView({ data, config = {}, onUpdateConfig, onOpenItem, updatesCountByItem, terms = DEFAULT_TERMS }) {
  const { columns, groups, items, people } = data;
  const can = data.can || ALL_ALLOWED;
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const narrow = useNarrow(); // telefon: karty zamiast tabeli przewijanej w bok

  // Po dodaniu zadania („Dodaj zadanie” w nagłówku lub w grupie) ustaw kursor w nazwie świeżego
  // wiersza i przewiń do niego — zamiast otwierać pusty panel.
  useEffect(() => {
    const id = data.focusItemId;
    if (!id) return;
    const el = document.querySelector(`input[data-item-name="${id}"]`);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    data.clearFocusItem();
  }, [data.focusItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo(() => ({
    ...data,
    setCell: (itemId, colId, value) => {
      if (colId === '__name__') return data.updateItem(itemId, { name: value });
      return data.updateCell(itemId, colId, value);
    },
  }), [data]);

  const itemById = useMemo(() => new Map(items.map(it => [it.id, it])), [items]);
  // Podzadania per rodzic — raz dla całej tablicy (zamiast filter po wszystkich zadaniach w każdym wierszu).
  const subsByParent = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (it.parent_item_id == null) continue;
      if (!m.has(it.parent_item_id)) m.set(it.parent_item_id, []);
      m.get(it.parent_item_id).push(it);
    }
    for (const list of m.values()) list.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return m;
  }, [items]);

  // Usunięcie zadania — od razu, z „Cofnij” w komunikacie (znikają też podzadania i komentarze).
  const deleteItem = useCallback((item) => { data.removeItems([item.id]); }, [data]);
  // Usunięcie grupy — potwierdzenie zostaje (znika wiele zadań naraz), potem i tak „Cofnij”.
  const deleteGroup = useCallback(async (group) => {
    const count = items.filter(it => it.group_id === group.id && !it.parent_item_id).length;
    const ok = await confirmDialog({
      title: tr('Usunąć grupę „{name}”?', { name: group.name }),
      message: count
        ? tr('Razem z grupą znikną jej zadania ({n}). Przez kilka sekund można to cofnąć.', { n: count })
        : tr('Grupa jest pusta.'),
      confirmLabel: tr('Usuń grupę'),
      danger: true,
    });
    if (ok) data.removeGroup(group.id);
  }, [data, items]);

  const toggleSelect = useCallback((id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const selectMany = useCallback((ids, on) => setSelected(prev => { const n = new Set(prev); ids.forEach(id => (on ? n.add(id) : n.delete(id))); return n; }), []);
  const toggleExpand = useCallback((id, force) => setExpanded(prev => { const n = new Set(prev); if (force) n.add(id); else (n.has(id) ? n.delete(id) : n.add(id)); return n; }), []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const visibleItems = useMemo(() => {
    const base = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return applyView(base, columns, config);
  }, [items, columns, config]);
  const itemsByGroup = useMemo(() => {
    const m = new Map();
    for (const it of visibleItems) {
      if (!m.has(it.group_id)) m.set(it.group_id, []);
      m.get(it.group_id).push(it);
    }
    return m;
  }, [visibleItems]);
  const visibleIds = useMemo(() => visibleItems.map(it => it.id), [visibleItems]);

  // Zaznaczenie bez zadań, które zniknęły (usunięte, odfiltrowane przez kogoś innego).
  useEffect(() => {
    setSelected(prev => {
      if (!prev.size) return prev;
      const next = new Set([...prev].filter(id => itemById.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [itemById]);

  // Esc czyści zaznaczenie (gdy nikt nie pisze i nie ma otwartego okna/listy).
  useEffect(() => {
    if (!selected.size) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !shortcutBlocked(e)) clearSelection(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected.size, clearSelection]);

  const sortedGroups = useMemo(() => [...groups].sort((a, b) => a.display_order - b.display_order), [groups]);
  const filtersActive = hasActiveFilters(config);
  const nothingVisible = items.length > 0 && visibleItems.length === 0;

  // Operacje zbiorcze — maks. 4 zapisy naraz, jeden komunikat o wyniku.
  const statusCol = columns.find(c => c.type === 'status');
  const priorityCol = columns.find(c => c.type === 'priority');
  const peopleCol = columns.find(c => c.type === 'people');
  const dateCol = columns.find(c => c.type === 'date');
  const runBulk = async (fn, doneMsg) => {
    setBulkBusy(true);
    try {
      const ids = [...selected];
      let ok = 0;
      let next = 0;
      const worker = async () => { while (next < ids.length) { const id = ids[next++]; if (await fn(id)) ok += 1; } };
      await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
      if (ok) toast.success(tr(doneMsg, { n: ok }));
      clearSelection();
    } finally { setBulkBusy(false); }
  };
  const bulkSet = (col, value) => runBulk((id) => data.updateCell(id, col.id, value), 'Zmieniono: {n}');
  const bulkPerson = (person) => runBulk((id) => {
    const cur = itemById.get(id)?.cells?.[peopleCol.id] || [];
    if (!person) return cur.length ? data.updateCell(id, peopleCol.id, []) : Promise.resolve(true);
    if (cur.some(p => lower(p?.email) === lower(person.email))) return Promise.resolve(true);
    return data.updateCell(id, peopleCol.id, [...cur, { email: person.email, name: person.name || person.email, avatar_url: person.avatar_url }]);
  }, 'Zmieniono: {n}');
  const personFor = (value, p) => {
    if (value === ME) return people.find(x => lower(x.email) === lower(data.me)) || { email: data.me, name: data.me };
    return p || people.find(x => lower(x.email) === lower(value)) || null;
  };
  const bulkMove = async (groupId) => {
    setBulkBusy(true);
    try {
      const n = await data.moveItems([...selected], groupId);
      if (n) toast.success(tr('Przeniesiono: {n}', { n }));
      clearSelection();
    } finally { setBulkBusy(false); }
  };
  // Zbiorcze usunięcie — bez okna potwierdzenia, z „Cofnij” w komunikacie.
  const bulkDelete = () => {
    data.removeItems([...selected]);
    clearSelection();
  };

  // ── DnD na poziomie CAŁEJ tablicy (jeden kontekst) → przeciąganie MIĘDZY grupami ──
  // Klawiatura: uchwyt → spacja, strzałki ↑/↓ (także do sąsiedniej grupy), spacja = upuść, Esc = anuluj.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragSortActive = (config.sorts?.length || 0) > 0; // przy aktywnym sortowaniu ręczna kolejność nie ma sensu

  const onDragEnd = ({ active, over }) => {
    if (!can.editItems) return;
    const action = resolveDragEnd({
      activeId: active.id, overId: over?.id ?? null,
      items, groupIds: sortedGroups.map(g => g.id), visibleItems, sortActive: dragSortActive,
    });
    if (!action) return;
    if (action.type === 'reorder') data.reorderItemsInGroup(action.groupId, action.orderedIds);
    else data.moveItem(action.itemId, action.toGroup, action.toIndex);
  };
  const nameOf = (id) => itemById.get(id)?.name || sortedGroups.find(g => g.id === id)?.name || tr('Bez nazwy');
  const dndA11y = {
    screenReaderInstructions: {
      draggable: tr('Aby zmienić kolejność, naciśnij spację lub Enter, przesuwaj strzałkami w górę i w dół i ponownie naciśnij spację. Esc anuluje.'),
    },
    announcements: {
      onDragStart: ({ active }) => tr('Podniesiono: {name}', { name: nameOf(active.id) }),
      onDragOver: ({ over }) => (over ? tr('Nad: {name}', { name: nameOf(over.id) }) : undefined),
      onDragEnd: ({ active, over }) => (over ? tr('Upuszczono: {name}', { name: nameOf(active.id) }) : tr('Anulowano przenoszenie')),
      onDragCancel: () => tr('Anulowano przenoszenie'),
    },
  };

  if (!sortedGroups.length) {
    return (
      <EmptyState icon={ListTodo} title={tr('Brak grup')} subtitle={tr('Zadania układa się w grupy (np. „Do zrobienia”, „Zrobione”).')}
        action={can.addGroups ? <Button icon={Plus} onClick={() => data.addGroup()}>{tr('Dodaj grupę')}</Button> : undefined} />
    );
  }

  const bulkPop = (key, label, content, width = 240) => (
    <Popover key={key} align="left" width={width} bare className="pick-pop overflow-hidden" triggerClassName="inline-flex" trigger={
      <button type="button" className="tool-btn whitespace-nowrap" disabled={bulkBusy}>{label}</button>
    }>
      {content}
    </Popover>
  );

  return (
    <div className="pb-24">
      {nothingVisible && filtersActive && (
        <EmptyState compact icon={SearchX} title={tr('Brak zadań pasujących do wyszukiwania lub filtrów')}
          action={((config.filters?.length || 0) > 0 || config.mine) && onUpdateConfig
            ? <Button variant="secondary" size="sm" onClick={() => onUpdateConfig({ filters: [], mine: false })}>{tr('Wyczyść filtry')}</Button>
            : undefined} />
      )}
      {narrow ? (
        <TableCards data={data} groups={sortedGroups} visibleItems={visibleItems} subsByParent={subsByParent} onOpenItem={onOpenItem}
          updatesCountByItem={updatesCountByItem} can={can} terms={terms} />
      ) : (
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd} accessibility={dndA11y}>
      {sortedGroups.map(g => (
        <GroupBlock key={g.id} group={g} columns={columns} groupItems={itemsByGroup.get(g.id) || EMPTY} subsByParent={subsByParent}
          people={people} me={data.me}
          api={api} onOpen={onOpenItem} onDeleteItem={deleteItem} onDeleteGroup={deleteGroup} updatesCountByItem={updatesCountByItem} can={can}
          selected={selected} onToggleSelect={toggleSelect} onSelectMany={selectMany} expanded={expanded} onToggleExpand={toggleExpand} terms={terms} />
      ))}
      </DndContext>
      )}
      {can.addGroups && (
        <button type="button" onClick={() => data.addGroup()}
          className="mt-3 flex items-center gap-1.5 px-3 h-9 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-[rgba(42,35,18,0.05)] dark:hover:bg-white/5">
          <Plus size={16} aria-hidden="true" /> {tr('Dodaj grupę')}
        </button>
      )}

      {/* Pasek działań na zaznaczonych — jasny, w stylu okienek aplikacji (nie ciemny pływający pasek). */}
      {selected.size > 0 && (
        <div role="toolbar" aria-label={tr('Działania na zaznaczonych')}
          className="pick-pop fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 max-w-[calc(100vw-16px)] overflow-x-auto">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap pr-1">
            <span className="inline-grid place-items-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold tabular-nums bg-[rgb(var(--accent-primary-lighter))] text-[rgb(var(--accent-primary-darkest))]">{selected.size}</span>
            {tr('zaznaczono')}
          </span>
          {selected.size < visibleIds.length && (
            <button type="button" className="tool-btn whitespace-nowrap" onClick={() => selectMany(visibleIds, true)} disabled={bulkBusy}>
              <CheckSquare size={15} aria-hidden="true" />{tr('Zaznacz wszystkie ({n})', { n: visibleIds.length })}
            </button>
          )}
          {statusCol && can.editItems && bulkPop('status', statusCol.name, ({ close }) => (
            <LabelPickList column={statusCol} onPick={(v) => { close(); bulkSet(statusCol, v); }} />
          ))}
          {priorityCol && can.editItems && bulkPop('priority', priorityCol.name, ({ close }) => (
            <LabelPickList column={priorityCol} onPick={(v) => { close(); bulkSet(priorityCol, v); }} />
          ))}
          {peopleCol && can.editItems && bulkPop('people', peopleCol.name, ({ close }) => (
            <PeoplePickList people={people} me={data.me} label={peopleCol.name}
              onPick={(v, p) => { const person = personFor(v, p); close(); if (person) bulkPerson(person); }}
              extra={(
                <button type="button" onClick={() => { close(); bulkPerson(null); }} className="pick-opt text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-white/10">
                  <X size={15} className="opacity-80" aria-hidden="true" /> {tr('Usuń przypisanie')}
                </button>
              )} />
          ), 280)}
          {dateCol && can.editItems && bulkPop('date', dateCol.name, ({ close }) => (
            <div className="p-3 space-y-2">
              <CustomDatePicker compact label={dateCol.name} value="" onChange={(v) => { close(); bulkSet(dateCol, v || null); }} />
              <button type="button" onClick={() => { close(); bulkSet(dateCol, null); }}
                className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary-light/50">
                {tr('Wyczyść')}
              </button>
            </div>
          ), 260)}
          {can.editItems && sortedGroups.length > 1 && bulkPop('move', tr('Przenieś'), ({ close }) => (
            <div className="py-1">
              {sortedGroups.map(g => (
                <button key={g.id} type="button" onClick={() => { close(); bulkMove(g.id); }} className="pick-opt text-gray-800 dark:text-gray-100">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} aria-hidden="true" /> {g.name}
                </button>
              ))}
            </div>
          ), 220)}
          {can.deleteItems && (
            <button type="button" onClick={bulkDelete} disabled={bulkBusy} className="tool-btn whitespace-nowrap !text-red-600 dark:!text-red-400">
              <Trash2 size={15} aria-hidden="true" />{tr('Usuń')}
            </button>
          )}
          <button type="button" onClick={clearSelection} aria-label={tr('Wyczyść zaznaczenie')} title={tr('Wyczyść zaznaczenie')} className="tool-btn tool-btn--icon">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

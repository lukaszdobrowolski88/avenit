import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight, ChevronDown, Plus, GripVertical, MoreHorizontal,
  Trash2, Maximize2, MessageSquare, X, CornerDownRight, Pencil, SearchX, ListTodo,
} from 'lucide-react';
import BoardCell from '../components/BoardCell';
import ColumnHeader from '../components/ColumnHeader';
import AddColumnMenu from '../components/AddColumnMenu';
import Popover from '../components/Popover';
import EmptyState from '../../../components/EmptyState';
import Button from '../../../components/Button';
import { StatusPill } from '../../../components/ui/DataTable';
import TableCards, { useNarrow } from './TableCards';
import { summarizeColumn } from '../lib/summaries';
import { applyView } from '../lib/viewData';
import { resolveDragEnd } from '../lib/dnd';
import { GROUP_COLORS } from '../lib/constants';
import { confirmDialog } from '../../../lib/dialog';
import { toast } from '../../../lib/toast';
import { tr } from '../../../i18n';
import '../../../components/toolbar.css';

const HANDLE_W = 46; // checkbox z odstępem od krawędzi + uchwyt przeciągania
const NAME_MIN = 260;
const ADDCOL_W = 44;

// Akcje w wierszu jak w pozostałych tabelach aplikacji (Baza pieśni): okrągłe przyciski ikon,
// widoczne po najechaniu na wiersz, przy fokusie i zawsze na ekranach dotykowych.
const ROW_ACTION = 'inline-grid place-items-center w-7 h-7 rounded-full text-gray-400 hover:text-gray-800 hover:bg-[rgba(42,35,18,0.07)] dark:hover:text-white dark:hover:bg-white/10 transition-colors opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100';

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
// Tylko sumy liczb i czasu. Kolorowy pasek statusów (bateria jak w Monday) usunięty — statusy widać
// w wierszach, a tęcza kolorów nie pasowała do reszty aplikacji; „0/1” przy osobach/datach to szum.
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
const ItemRow = React.memo(function ItemRow({ item, columns, people, me, onCell, onUpdateColumn, onOpen, onDelete, updatesCount,
  selected, onToggleSelect, hasSub, subCount, expanded, onToggleExpand, onAddSub, isSub, terms, can }) {
  const canDrag = !isSub && can.editItems;
  const sortable = useSortable({ id: item.id, disabled: !canDrag });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  // Nazwa: lokalny stan + commit na blur/Enter — inaczej zapis do bazy przy KAŻDYM znaku (lag).
  const [nameLocal, setNameLocal] = useState(item.name);
  useEffect(() => { setNameLocal(item.name); }, [item.name]);
  const label = item.name || tr('Bez nazwy');
  // content-visibility:auto = natywna wirtualizacja przeglądarki (pomija render wierszy poza
  // ekranem). contain-intrinsic-size pamięta realną wysokość → bez skoków scrolla.
  const style = {
    transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1,
    contentVisibility: isDragging ? 'visible' : 'auto', containIntrinsicSize: 'auto 44px',
  };
  return (
    <div ref={setNodeRef} style={style} role="row"
      className={`flex items-stretch border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 group/row min-h-[44px] ${isSub ? 'bg-gray-50/50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center gap-0.5 pl-3 shrink-0" style={{ width: HANDLE_W }}>
        {isSub ? null : (
          <>
            <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect(item.id)}
              aria-label={tr('Zaznacz: {name}', { name: label })}
              className={`ui-check ${selected ? '' : 'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'}`} />
            {canDrag && (
              <span className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" {...attributes} {...listeners} aria-label={tr('Przeciągnij, by zmienić kolejność')}>
                <GripVertical size={13} className="opacity-0 group-hover/row:opacity-100" aria-hidden="true" />
              </span>
            )}
          </>
        )}
      </div>
      {/* Nazwa zadania */}
      <div className="flex items-center gap-1 px-2" style={{ flex: 1, minWidth: NAME_MIN, paddingLeft: isSub ? 34 : 8 }}>
        {isSub && <CornerDownRight size={14} className="shrink-0 text-gray-300 dark:text-gray-500" aria-hidden="true" />}
        {!isSub && (
          hasSub ? (
            <button type="button" onClick={onToggleExpand} aria-expanded={expanded}
              aria-label={expanded ? tr('Zwiń podzadania') : tr('Rozwiń podzadania')}
              className="shrink-0 p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
              {expanded ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
            </button>
          ) : <span className="shrink-0 w-[17px]" aria-hidden="true" />
        )}
        <input value={nameLocal} readOnly={!can.editItems}
          placeholder={isSub ? tr(terms.sub) : tr(terms.placeholder)} aria-label={tr(terms.column)} data-item-name={item.id}
          onChange={(e) => setNameLocal(e.target.value)}
          onBlur={() => { if (nameLocal !== item.name) onCell(item.id, '__name__', nameLocal); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNameLocal(item.name); e.currentTarget.blur(); } }}
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 rounded focus-visible:ring-2 focus-visible:ring-accent-primary-light/40" />
        {!isSub && subCount > 0 && <span className="text-[10px] text-gray-400 shrink-0 tabular-nums" title={tr('Podzadania')}>{subCount}</span>}
        <button type="button" onClick={() => onOpen(item)} title={tr('Otwórz')} aria-label={tr('Otwórz: {name}', { name: label })} className={ROW_ACTION}>
          <Maximize2 size={13} aria-hidden="true" />
        </button>
        {!isSub && (
          // Dymek komentarzy: widoczny, gdy są komentarze; inaczej dopiero po najechaniu na wiersz.
          <button type="button" onClick={() => onOpen(item)} title={tr('Komentarze')} aria-label={tr('Komentarze: {n}', { n: updatesCount })}
            className={updatesCount > 0 ? 'inline-flex items-center gap-0.5 h-7 px-1.5 rounded-full text-gray-500 hover:text-gray-800 hover:bg-[rgba(42,35,18,0.07)] dark:hover:text-white dark:hover:bg-white/10' : ROW_ACTION}>
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
        <div key={col.id} className="shrink-0 flex items-stretch" style={{ width: col.width || 160 }}>
          <BoardCell column={col} value={item.cells?.[col.id]} people={people} me={me} item={item} columns={columns}
            onChange={(v) => onCell(item.id, col.id, v)} onUpdateColumn={onUpdateColumn} />
        </div>
      ))}
      <div className="flex items-center justify-center shrink-0" style={{ width: ADDCOL_W }}>
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

// ── Blok grupy ───────────────────────────────────────────────────────
function GroupBlock({ group, columns, visibleItems, allItems, people, me, api, onOpen, onDeleteItem, updatesCountByItem, selected, onToggleSelect, expanded, onToggleExpand, terms, can }) {
  const groupItems = useMemo(
    () => visibleItems.filter(it => it.group_id === group.id),
    [visibleItems, group.id]
  );
  const collapsed = group.collapsed;
  // Strefa upuszczania grupy — pozwala przeciągnąć zadanie także do PUSTEJ grupy (DnD na poziomie tablicy).
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: group.id });

  const totalWidth = HANDLE_W + NAME_MIN + columns.reduce((s, c) => s + (c.width || 160), 0) + ADDCOL_W;
  const [renaming, setRenaming] = useState(false);
  const groupMenu = can.editGroups || can.deleteGroups;
  const deleteGroup = async (close) => {
    close();
    const ok = await confirmDialog({
      title: tr('Usunąć grupę „{name}”?', { name: group.name }),
      message: groupItems.length
        ? tr('Razem z grupą znikną jej zadania ({n}). Tej operacji nie można cofnąć.', { n: groupItems.length })
        : tr('Grupa jest pusta. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń grupę'),
      danger: true,
    });
    if (ok) api.deleteGroup(group.id);
  };

  return (
    <section className="mb-6" aria-label={group.name}>
      {/* Nagłówek grupy — kanon: neutralna nazwa + kolorowa kropka + licznik */}
      <div className="flex items-center gap-2 mb-1.5 pl-0.5 text-gray-900 dark:text-white">
        <button type="button" onClick={() => api.updateGroup(group.id, { collapsed: !collapsed })} aria-expanded={!collapsed}
          aria-label={collapsed ? tr('Rozwiń grupę {name}', { name: group.name }) : tr('Zwiń grupę {name}', { name: group.name })}
          className="p-0.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          {collapsed ? <ChevronRight size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} aria-hidden="true" />
        <GroupTitle group={group} canEdit={can.editGroups} editing={renaming} onStartEdit={() => setRenaming(true)} onStopEdit={() => setRenaming(false)} onRename={(name) => api.updateGroup(group.id, { name })} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">{groupItems.length}</span>
        {groupMenu && (
          <Popover align="left" width={220} triggerClassName="inline-flex" trigger={
            <button type="button" className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-[rgba(42,35,18,0.06)] dark:hover:text-gray-200 dark:hover:bg-white/10" aria-label={tr('Więcej działań: {name}', { name: group.name })}>
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>
          }>
            {({ close }) => (
              <div className="py-1">
                {can.editGroups && (
                  <>
                    <button type="button" onClick={() => { setRenaming(true); close(); }} className="pick-opt text-gray-800 dark:text-gray-100">
                      <Pencil size={15} className="opacity-80" aria-hidden="true" /> {tr('Zmień nazwę')}
                    </button>
                    <div className="pick-section">{tr('Kolor grupy')}</div>
                    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                      {GROUP_COLORS.map((c, i) => (
                        <button key={c} type="button" onClick={() => api.updateGroup(group.id, { color: c })}
                          aria-label={tr('Kolor {n}', { n: i + 1 })} aria-pressed={group.color === c}
                          className={`w-6 h-6 rounded-full transition ${group.color === c ? 'ring-2 ring-offset-2 ring-gray-800 dark:ring-white dark:ring-offset-gray-800' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </>
                )}
                {can.deleteGroups && (
                  <button type="button" onClick={() => deleteGroup(close)} className="pick-opt text-red-600 dark:text-red-400 border-t border-gray-100 dark:border-white/10">
                    <Trash2 size={15} aria-hidden="true" /> {tr('Usuń grupę')}
                  </button>
                )}
              </div>
            )}
          </Popover>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto custom-scrollbar rounded-2xl border border-gray-200 dark:border-gray-700" role="table" aria-label={group.name}>
          <div style={{ minWidth: totalWidth }}>
            {/* Nagłówek kolumn */}
            <div className="flex items-stretch bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-10" role="row">
              <div className="shrink-0" style={{ width: HANDLE_W }} />
              <div className="board-th flex items-center px-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400" style={{ flex: 1, minWidth: NAME_MIN }} role="columnheader">{tr(terms.column)}</div>
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
              <div className="shrink-0 flex items-center justify-center" style={{ width: ADDCOL_W }}>{can.addColumns && <AddColumnMenu onAdd={api.addColumn} />}</div>
            </div>

            {/* Wiersze — droppable grupy (jeden DndContext jest na poziomie tablicy) */}
            <div ref={setDropRef} className={isOver ? 'bg-accent-primary/5 transition-colors' : ''}>
              <SortableContext items={groupItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {groupItems.map(it => {
                  const subs = allItems.filter(s => s.parent_item_id === it.id).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
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
                <div className="flex items-center bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60">
                  <div className="shrink-0" style={{ width: HANDLE_W }} />
                  <button type="button" onClick={() => api.addItem(group.id)}
                    className="flex items-center gap-1.5 px-2 py-2.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white" style={{ flex: 1, minWidth: NAME_MIN }}>
                    <Plus size={15} aria-hidden="true" /> {tr(terms.addRow)}
                  </button>
                </div>
              )}
            </div>

            {/* Podsumowania — tylko gdy któraś kolumna ma co zsumować (liczby, czas) */}
            {columns.some(col => hasSummary(col, groupItems)) && (
            <div className="flex items-stretch bg-gray-50/70 dark:bg-gray-800/60 min-h-[34px]">
              <div className="shrink-0" style={{ width: HANDLE_W }} />
              <div className="shrink-0 " style={{ flex: 1, minWidth: NAME_MIN }} />
              {columns.map(col => (
                <div key={col.id} className="shrink-0 flex items-center" style={{ width: col.width || 160 }}>
                  <SummaryCell column={col} items={groupItems} />
                </div>
              ))}
              <div className="shrink-0" style={{ width: ADDCOL_W }} />
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
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(group.name); onStopEdit(); } }}
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
  }, [data.focusItemId]);

  const api = {
    ...data,
    setCell: (itemId, colId, value) => {
      if (colId === '__name__') return data.updateItem(itemId, { name: value });
      return data.updateCell(itemId, colId, value);
    },
  };

  // Usunięcie jednego zadania — z potwierdzeniem jak wszędzie w aplikacji (znikają też podzadania).
  const deleteItem = async (item) => {
    const subs = items.filter(s => s.parent_item_id === item.id).length;
    const name = item.name || tr('Bez nazwy');
    const ok = await confirmDialog({
      title: tr('Usunąć „{name}”?', { name }),
      message: subs
        ? tr('Razem z nim znikną podzadania ({n}) i komentarze. Tej operacji nie można cofnąć.', { n: subs })
        : tr('Znikną też komentarze. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń'),
      danger: true,
    });
    if (!ok) return;
    if (await data.deleteItem(item.id)) toast.success(tr('Usunięto „{name}”', { name }));
  };

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id, force) => setExpanded(prev => { const n = new Set(prev); if (force) n.add(id); else (n.has(id) ? n.delete(id) : n.add(id)); return n; });
  const clearSelection = () => setSelected(new Set());

  const visibleItems = useMemo(() => {
    const base = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return applyView(base, columns, config);
  }, [items, columns, config]);

  const sortedGroups = [...groups].sort((a, b) => a.display_order - b.display_order);
  const filtersActive = (config.filters?.length || 0) > 0 || !!(config.search || '').trim();
  const nothingVisible = items.length > 0 && visibleItems.length === 0;

  // Operacje zbiorcze — po kolei, z jednym komunikatem o wyniku (zamiast N równoległych zapisów).
  const statusCol = columns.find(c => c.type === 'status') || columns.find(c => c.type === 'priority');
  const runBulk = async (fn, doneMsg) => {
    setBulkBusy(true);
    try {
      const ids = [...selected];
      let ok = 0;
      for (const id of ids) if (await fn(id)) ok += 1;
      if (ok) toast.success(tr(doneMsg, { n: ok }));
      clearSelection();
    } finally { setBulkBusy(false); }
  };
  const bulkStatus = (labelId) => runBulk((id) => data.updateCell(id, statusCol.id, labelId), 'Zmieniono: {n}');
  const bulkMove = async (groupId) => {
    setBulkBusy(true);
    try {
      const n = await data.moveItems([...selected], groupId);
      if (n) toast.success(tr('Przeniesiono: {n}', { n }));
      clearSelection();
    } finally { setBulkBusy(false); }
  };
  const bulkDelete = async () => {
    const ok = await confirmDialog({
      title: tr('Usunąć zaznaczone ({n})?', { n: selected.size }),
      message: tr('Znikną też ich podzadania i komentarze. Tej operacji nie można cofnąć.'),
      confirmLabel: tr('Usuń'),
      danger: true,
    });
    if (ok) runBulk((id) => data.deleteItem(id), 'Usunięto: {n}');
  };

  // ── DnD na poziomie CAŁEJ tablicy (jeden kontekst) → przeciąganie MIĘDZY grupami ──
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
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

  if (!sortedGroups.length) {
    return (
      <EmptyState icon={ListTodo} title={tr('Brak grup')} subtitle={tr('Zadania układa się w grupy (np. „Do zrobienia”, „Zrobione”).')}
        action={can.addGroups ? <Button icon={Plus} onClick={() => data.addGroup()}>{tr('Dodaj grupę')}</Button> : undefined} />
    );
  }

  return (
    <div className="pb-24">
      {nothingVisible && filtersActive && (
        <EmptyState compact icon={SearchX} title={tr('Brak zadań pasujących do wyszukiwania lub filtrów')}
          action={(config.filters?.length || 0) > 0 && onUpdateConfig
            ? <Button variant="secondary" size="sm" onClick={() => onUpdateConfig({ filters: [] })}>{tr('Wyczyść filtry')}</Button>
            : undefined} />
      )}
      {narrow ? (
        <TableCards data={data} groups={sortedGroups} visibleItems={visibleItems} allItems={items} onOpenItem={onOpenItem}
          updatesCountByItem={updatesCountByItem} can={can} terms={terms} />
      ) : (
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      {sortedGroups.map(g => (
        <GroupBlock key={g.id} group={g} columns={columns} visibleItems={visibleItems} allItems={items} people={people} me={data.me}
          api={api} onOpen={onOpenItem} onDeleteItem={deleteItem} updatesCountByItem={updatesCountByItem} can={can}
          selected={selected} onToggleSelect={toggleSelect} expanded={expanded} onToggleExpand={toggleExpand} terms={terms} />
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
          {statusCol && can.editItems && (
            <Popover align="left" width={220} triggerClassName="inline-flex" trigger={
              <button type="button" className="tool-btn" disabled={bulkBusy}>{statusCol.name}</button>
            }>
              {({ close }) => (
                <div className="py-1" role="listbox" aria-label={statusCol.name}>
                  {(statusCol.settings?.labels || []).map(l => (
                    <button key={l.id} type="button" role="option" aria-selected="false" onClick={() => { close(); bulkStatus(l.id); }} className="pick-opt">
                      <StatusPill color={l.color}>{l.title}</StatusPill>
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          )}
          {can.editItems && sortedGroups.length > 1 && (
            <Popover align="left" width={220} triggerClassName="inline-flex" trigger={
              <button type="button" className="tool-btn" disabled={bulkBusy}>{tr('Przenieś')}</button>
            }>
              {({ close }) => (
                <div className="py-1">
                  {sortedGroups.map(g => (
                    <button key={g.id} type="button" onClick={() => { close(); bulkMove(g.id); }} className="pick-opt text-gray-800 dark:text-gray-100">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} aria-hidden="true" /> {g.name}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
          )}
          {can.deleteItems && (
            <button type="button" onClick={bulkDelete} disabled={bulkBusy} className="tool-btn !text-red-600 dark:!text-red-400">
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

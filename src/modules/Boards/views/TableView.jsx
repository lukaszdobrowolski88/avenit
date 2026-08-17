import React, { useState, useMemo, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronRight, ChevronDown, Plus, GripVertical, MoreHorizontal,
  Trash2, Maximize2, MessageSquare, X,
} from 'lucide-react';
import BoardCell from '../components/BoardCell';
import ColumnHeader from '../components/ColumnHeader';
import AddColumnMenu from '../components/AddColumnMenu';
import Popover from '../components/Popover';
import { useCan } from '../../../components/Can';
import { summarizeColumn } from '../lib/summaries';
import { applyView } from '../lib/viewData';
import { GROUP_COLORS } from '../lib/constants';

const HANDLE_W = 28;
const NAME_MIN = 260;
const ADDCOL_W = 44;

// ── Podsumowanie kolumny (stopka grupy) ──────────────────────────────
function SummaryCell({ column, items }) {
  const s = summarizeColumn(column, items);
  if (s.kind === 'battery') {
    if (!s.total) return null;
    return (
      <div className="w-full px-2">
        <div className="flex h-4 rounded-full overflow-hidden">
          {s.segments.map((seg, i) => (
            <div key={i} style={{ width: `${seg.pct}%`, backgroundColor: seg.color }} title={`${seg.count}`} />
          ))}
        </div>
      </div>
    );
  }
  if (s.kind === 'number') {
    return <div className="w-full text-right px-2 text-sm font-semibold text-gray-600 dark:text-gray-300">{s.sum}</div>;
  }
  if (s.kind === 'duration') {
    return <div className="w-full text-right px-2 text-sm font-semibold text-gray-600 dark:text-gray-300">{s.text}</div>;
  }
  return <div className="w-full text-center text-[11px] text-gray-400">{s.filled}/{s.total}</div>;
}

// ── Wiersz elementu (sortowalny) ─────────────────────────────────────
function ItemRow({ item, columns, groupColor, people, me, onCell, onUpdateColumn, onOpen, onDelete, canDelete, updatesCount,
  selected, onToggleSelect, hasSub, subCount, expanded, onToggleExpand, onAddSub, isSub }) {
  const sortable = useSortable({ id: item.id, disabled: isSub });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  // Nazwa: lokalny stan + commit na blur/Enter — inaczej zapis do bazy przy KAŻDYM znaku (lag).
  const [nameLocal, setNameLocal] = useState(item.name);
  useEffect(() => { setNameLocal(item.name); }, [item.name]);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <div ref={setNodeRef} style={style}
      className={`flex items-stretch border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50/70 dark:hover:bg-gray-700/30 group/row min-h-[38px] ${isSub ? 'bg-gray-50/50 dark:bg-gray-800/40' : 'bg-white dark:bg-gray-800'}`}>
      <div className="flex items-center justify-center shrink-0" style={{ width: HANDLE_W }}>
        {isSub ? null : (
          <>
            <input type="checkbox" checked={!!selected} onChange={() => onToggleSelect(item.id)}
              className={`w-3.5 h-3.5 rounded accent-accent-primary cursor-pointer ${selected ? '' : 'opacity-0 group-hover/row:opacity-100'}`} />
            <span className="text-gray-300 dark:text-gray-600 cursor-grab active:cursor-grabbing" {...attributes} {...listeners}>
              <GripVertical size={13} className="opacity-0 group-hover/row:opacity-100" />
            </span>
          </>
        )}
      </div>
      <div className="shrink-0" style={{ width: 4, backgroundColor: isSub ? 'transparent' : groupColor }} />
      {/* Nazwa elementu */}
      <div className="flex items-center gap-1 px-2 border-r border-gray-100 dark:border-gray-700/60" style={{ flex: 1, minWidth: NAME_MIN, paddingLeft: isSub ? 26 : 8 }}>
        {!isSub && (
          <button onClick={onToggleExpand} className={`shrink-0 p-0.5 ${hasSub ? 'text-gray-400 hover:text-accent-primary' : 'text-transparent'}`} title="Podelementy">
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
        <input value={nameLocal} placeholder={isSub ? 'Podelement' : 'Nazwa elementu'}
          onChange={(e) => setNameLocal(e.target.value)}
          onBlur={() => { if (nameLocal !== item.name) onCell(item.id, '__name__', nameLocal); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="flex-1 min-w-0 bg-transparent text-sm text-gray-800 dark:text-gray-100 outline-none" />
        {!isSub && subCount > 0 && <span className="text-[10px] text-gray-400 shrink-0">{subCount}</span>}
        <button onClick={() => onOpen(item)} title="Otwórz" className="relative opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-accent-primary p-0.5">
          <Maximize2 size={13} />
        </button>
        {!isSub && (
          <button onClick={() => onOpen(item)} title="Aktualizacje" className="relative flex items-center text-gray-400 hover:text-accent-primary p-0.5">
            <MessageSquare size={14} />
            {updatesCount > 0 && <span className="ml-0.5 text-[10px] text-gray-400">{updatesCount}</span>}
          </button>
        )}
        {!isSub && onAddSub && (
          <button onClick={() => onAddSub(item)} title="Dodaj podelement" className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-accent-primary p-0.5"><Plus size={13} /></button>
        )}
      </div>
      {/* Komórki kolumn */}
      {columns.map(col => (
        <div key={col.id} className="border-r border-gray-100 dark:border-gray-700/60 shrink-0 flex items-stretch" style={{ width: col.width || 160 }}>
          <BoardCell column={col} value={item.cells?.[col.id]} people={people} me={me} item={item} columns={columns}
            onChange={(v) => onCell(item.id, col.id, v)} onUpdateColumn={onUpdateColumn} />
        </div>
      ))}
      <div className="flex items-center justify-center shrink-0" style={{ width: ADDCOL_W }}>
        {canDelete && <button onClick={() => onDelete(item.id)} className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 p-1"><Trash2 size={13} /></button>}
      </div>
    </div>
  );
}

// ── Blok grupy ───────────────────────────────────────────────────────
function GroupBlock({ group, columns, visibleItems, allItems, people, me, api, onOpen, updatesCountByItem, canDeleteItems, canEditStructure, selected, onToggleSelect, expanded, onToggleExpand }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const groupItems = useMemo(
    () => visibleItems.filter(it => it.group_id === group.id),
    [visibleItems, group.id]
  );
  const collapsed = group.collapsed;

  const onDragEnd = (e) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = groupItems.map(i => i.id);
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id));
    api.reorderItemsInGroup(group.id, next);
  };

  const totalWidth = HANDLE_W + 4 + NAME_MIN + columns.reduce((s, c) => s + (c.width || 160), 0) + ADDCOL_W;

  return (
    <div className="mb-6">
      {/* Nagłówek grupy */}
      <div className="flex items-center gap-2 mb-1 pl-1" style={{ color: group.color }}>
        <button onClick={() => api.updateGroup(group.id, { collapsed: !collapsed })} className="p-0.5">
          {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
        </button>
        <GroupTitle group={group} canEdit={canEditStructure} onRename={(name) => api.updateGroup(group.id, { name })} />
        <span className="text-xs text-gray-400 font-normal">{groupItems.length}</span>
        {canEditStructure && (
        <Popover align="left" width={180} trigger={
          <button className="text-gray-300 hover:text-gray-500 p-0.5"><MoreHorizontal size={16} /></button>
        }>
          {({ close }) => (
            <div className="p-2">
              <div className="text-[11px] text-gray-400 px-1 pb-1">Kolor grupy</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {GROUP_COLORS.map(c => (
                  <button key={c} onClick={() => api.updateGroup(group.id, { color: c })} className="w-5 h-5 rounded" style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={() => { if (confirm(`Usunąć grupę „${group.name}" wraz z wszystkimi jej elementami?`)) api.deleteGroup(group.id); close(); }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600">
                <Trash2 size={14} /> Usuń grupę
              </button>
            </div>
          )}
        </Popover>
        )}
      </div>

      {!collapsed && (
        <div className="overflow-x-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700">
          <div style={{ minWidth: totalWidth }}>
            {/* Nagłówek kolumn */}
            <div className="flex items-stretch bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 h-9 sticky top-0 z-10">
              <div className="shrink-0" style={{ width: HANDLE_W }} />
              <div className="shrink-0" style={{ width: 4 }} />
              <div className="flex items-center px-2 border-r border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-300" style={{ flex: 1, minWidth: NAME_MIN }}>Element</div>
              {columns.map(col => (
                <div key={col.id} className="border-r border-gray-200 dark:border-gray-700 shrink-0" style={{ width: col.width || 160 }}>
                  <ColumnHeader column={col} allColumns={columns} onUpdate={api.updateColumn} onDelete={api.deleteColumn} />
                </div>
              ))}
              <div className="shrink-0" style={{ width: ADDCOL_W }}>{canEditStructure && <AddColumnMenu onAdd={api.addColumn} />}</div>
            </div>

            {/* Wiersze */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={groupItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {groupItems.map(it => {
                  const subs = allItems.filter(s => s.parent_item_id === it.id).sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
                  return (
                    <React.Fragment key={it.id}>
                      <ItemRow item={it} columns={columns} groupColor={group.color} people={people} me={me}
                        onCell={api.setCell} onUpdateColumn={api.updateColumn} onOpen={onOpen} onDelete={api.deleteItem} canDelete={canDeleteItems}
                        updatesCount={updatesCountByItem?.[it.id] || 0}
                        selected={selected.has(it.id)} onToggleSelect={onToggleSelect}
                        hasSub={subs.length > 0} subCount={subs.length} expanded={expanded.has(it.id)}
                        onToggleExpand={() => onToggleExpand(it.id)}
                        onAddSub={(parent) => api.addSubitem(parent).then(() => onToggleExpand(parent.id, true))} />
                      {expanded.has(it.id) && subs.map(sub => (
                        <ItemRow key={sub.id} item={sub} columns={columns} groupColor={group.color} people={people} me={me}
                          onCell={api.setCell} onUpdateColumn={api.updateColumn} onOpen={onOpen} onDelete={api.deleteItem} canDelete={canDeleteItems} isSub />
                      ))}
                    </React.Fragment>
                  );
                })}
              </SortableContext>
            </DndContext>

            {/* Dodaj element */}
            <div className="flex items-center bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700/60">
              <div className="shrink-0" style={{ width: HANDLE_W }} />
              <div className="shrink-0" style={{ width: 4, backgroundColor: group.color, opacity: 0.4 }} />
              <button onClick={() => api.addItem(group.id)}
                className="flex items-center gap-1.5 px-2 py-2 text-sm text-gray-400 hover:text-accent-primary" style={{ flex: 1, minWidth: NAME_MIN }}>
                <Plus size={15} /> Dodaj element
              </button>
            </div>

            {/* Podsumowania */}
            <div className="flex items-stretch bg-gray-50/70 dark:bg-gray-800/60 min-h-[34px]">
              <div className="shrink-0" style={{ width: HANDLE_W }} />
              <div className="shrink-0" style={{ width: 4 }} />
              <div className="shrink-0 border-r border-gray-100 dark:border-gray-700/60" style={{ flex: 1, minWidth: NAME_MIN }} />
              {columns.map(col => (
                <div key={col.id} className="border-r border-gray-100 dark:border-gray-700/60 shrink-0 flex items-center" style={{ width: col.width || 160 }}>
                  <SummaryCell column={col} items={groupItems} />
                </div>
              ))}
              <div className="shrink-0" style={{ width: ADDCOL_W }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroupTitle({ group, canEdit, onRename }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  if (editing) {
    return (
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onBlur={() => { setEditing(false); if (name.trim() && name !== group.name) onRename(name.trim()); }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="font-semibold text-sm bg-white dark:bg-gray-700 rounded px-1 outline-none ring-2 ring-current/30" style={{ color: 'inherit' }} />
    );
  }
  return <span className={`font-semibold text-sm ${canEdit ? 'cursor-pointer' : ''}`} onDoubleClick={() => canEdit && setEditing(true)}>{group.name}</span>;
}

// ── Widok Tabela ─────────────────────────────────────────────────────
export default function TableView({ data, config = {}, onOpenItem, updatesCountByItem }) {
  const { columns, groups, items, people } = data;
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  // RBAC: członek dodaje/edytuje elementy, ale nie usuwa ich ani nie zmienia struktury (kolumny/grupy).
  const canDeleteItems = useCan('res:board_items:delete');
  const canEditStructure = useCan('res:board_columns:create');

  const api = {
    ...data,
    setCell: (itemId, colId, value) => {
      if (colId === '__name__') return data.updateItem(itemId, { name: value });
      return data.updateCell(itemId, colId, value);
    },
  };

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleExpand = (id, force) => setExpanded(prev => { const n = new Set(prev); if (force) n.add(id); else (n.has(id) ? n.delete(id) : n.add(id)); return n; });
  const clearSelection = () => setSelected(new Set());

  const visibleItems = useMemo(() => {
    const base = [...items].sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    return applyView(base, columns, config);
  }, [items, columns, config]);

  const sortedGroups = [...groups].sort((a, b) => a.display_order - b.display_order);

  // Operacje masowe
  const statusCol = columns.find(c => c.type === 'status' || c.type === 'priority');
  const bulkStatus = (labelId) => { selected.forEach(id => data.updateCell(id, statusCol.id, labelId)); clearSelection(); };
  const bulkMove = (groupId) => { selected.forEach(id => data.moveItem(id, groupId)); clearSelection(); };
  const bulkDelete = () => { if (confirm(`Usunąć zaznaczone elementy (${selected.size})?`)) { selected.forEach(id => data.deleteItem(id)); clearSelection(); } };

  return (
    <div className="pb-24">
      {sortedGroups.map(g => (
        <GroupBlock key={g.id} group={g} columns={columns} visibleItems={visibleItems} allItems={items} people={people} me={data.me}
          api={api} onOpen={onOpenItem} updatesCountByItem={updatesCountByItem}
          canDeleteItems={canDeleteItems} canEditStructure={canEditStructure}
          selected={selected} onToggleSelect={toggleSelect} expanded={expanded} onToggleExpand={toggleExpand} />
      ))}
      {canEditStructure && (
        <button onClick={() => data.addGroup()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-accent-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/40">
          <Plus size={16} /> Dodaj grupę
        </button>
      )}

      {/* Pasek operacji masowych */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl px-3 py-2.5 border border-gray-700">
          <span className="text-sm font-medium px-2">{selected.size} zaznaczono</span>
          {statusCol && (
            <Popover align="left" width={190} trigger={<button className="text-sm px-3 py-1.5 rounded-lg hover:bg-white/10">Status</button>}>
              {({ close }) => (
                <div className="p-1.5">
                  {(statusCol.settings?.labels || []).map(l => (
                    <button key={l.id} onClick={() => { bulkStatus(l.id); close(); }} className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-white mb-1" style={{ backgroundColor: l.color }}>{l.title}</button>
                  ))}
                </div>
              )}
            </Popover>
          )}
          <Popover align="left" width={190} trigger={<button className="text-sm px-3 py-1.5 rounded-lg hover:bg-white/10">Przenieś</button>}>
            {({ close }) => (
              <div className="p-1.5">
                {sortedGroups.map(g => (
                  <button key={g.id} onClick={() => { bulkMove(g.id); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-200">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} /> {g.name}
                  </button>
                ))}
              </div>
            )}
          </Popover>
          {canDeleteItems && <button onClick={bulkDelete} className="text-sm px-3 py-1.5 rounded-lg text-red-300 hover:bg-red-500/20">Usuń</button>}
          <button onClick={clearSelection} className="p-1.5 rounded-lg hover:bg-white/10"><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

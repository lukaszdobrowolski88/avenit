import React, { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay,
} from '@dnd-kit/core';
import { Plus, GripVertical, Settings2 } from 'lucide-react';
import ItemCard from '../components/ItemCard';
import CustomSelect from '../../../components/CustomSelect';
import Popover from '../components/Popover';
import LabelsEditor from '../components/LabelsEditor';
import { tr } from '../../../i18n';
import { applyView, groupItemsByColumn } from '../lib/viewData';
import { getColumnType } from '../lib/columnTypes';

function DraggableCard({ item, columns, onOpen, updatesCount, subCount, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled });
  const style = { transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.3 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <ItemCard item={item} columns={columns} onOpen={onOpen} updatesCount={updatesCount} subCount={subCount}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners, className: 'cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600', children: <GripVertical size={14} /> }} />
    </div>
  );
}

function KanbanColumn({ col, columns, onOpen, onAdd, updatesCountByItem, subCountByItem, disabled }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div className="w-72 shrink-0 flex flex-col">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{col.title}</span>
        <span className="text-xs text-gray-400">{col.items.length}</span>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 min-h-[120px] transition-colors ${isOver ? 'bg-accent-primary/10 ring-2 ring-accent-primary/30' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
        {col.items.map(it => (
          <DraggableCard key={it.id} item={it} columns={columns} onOpen={onOpen} updatesCount={updatesCountByItem?.[it.id] || 0} subCount={subCountByItem?.[it.id] || 0} disabled={disabled} />
        ))}
        {onAdd && (
          <button onClick={() => onAdd(col)} className="w-full flex items-center gap-1.5 px-2 py-2 text-sm text-gray-400 hover:text-accent-primary">
            <Plus size={15} /> Dodaj
          </button>
        )}
      </div>
    </div>
  );
}

export default function KanbanView({ data, config, onUpdateConfig, onOpenItem, updatesCountByItem }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState(null);

  const groupableCols = data.columns.filter(c => getColumnType(c.type).groupable);
  const groupColId = config.kanbanGroupBy || groupableCols.find(c => c.type === 'status')?.id || groupableCols[0]?.id;
  const groupCol = data.columns.find(c => c.id === groupColId);

  const visibleItems = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);
  const kanbanCols = useMemo(() => groupCol ? groupItemsByColumn(visibleItems, groupCol) : [], [visibleItems, groupCol]);
  const subCountByItem = useMemo(() => {
    const m = {};
    data.items.forEach(it => { if (it.parent_item_id) m[it.parent_item_id] = (m[it.parent_item_id] || 0) + 1; });
    return m;
  }, [data.items]);

  if (!groupCol) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu Status, Priorytet, Lista lub Osoby, aby użyć widoku Kanban.</div>;
  }

  const dragDisabled = groupCol.type === 'people';

  const applyGroupValue = (itemId, key) => {
    if (groupCol.type === 'status' || groupCol.type === 'priority') data.updateCell(itemId, groupCol.id, key === '__empty__' ? null : key);
    else if (groupCol.type === 'dropdown') data.updateCell(itemId, groupCol.id, key === '__empty__' ? [] : [key]);
    else if (groupCol.type === 'checkbox') data.updateCell(itemId, groupCol.id, key === 'true');
  };

  // Wartość komórki dla nowego elementu dodawanego w danej kolumnie Kanban.
  const groupCellsFor = (key) => {
    if (key === '__empty__') return {};
    if (groupCol.type === 'status' || groupCol.type === 'priority') return { [groupCol.id]: key };
    if (groupCol.type === 'dropdown') return { [groupCol.id]: [key] };
    if (groupCol.type === 'checkbox') return { [groupCol.id]: key === 'true' };
    return {};
  };

  const onDragEnd = (e) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    applyGroupValue(active.id, over.id);
  };

  const addToColumn = (col) => {
    const firstGroup = [...data.groups].sort((a, b) => a.display_order - b.display_order)[0];
    // Ustaw wartość kolumny grupującej OD RAZU przy tworzeniu — inaczej updateCell w .then
    // działa na nieaktualnym stanie (element jeszcze nie w items) i status przepadał.
    data.addItem(firstGroup?.id, '', groupCellsFor(col.key));
  };

  const activeItem = activeId ? visibleItems.find(i => i.id === activeId) : null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
        {tr('Grupuj wg:')}
        <div className="w-48">
          <CustomSelect compact value={groupColId} onChange={(v) => onUpdateConfig({ kanbanGroupBy: v })}
            options={groupableCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
        </div>
        {(groupCol.type === 'status' || groupCol.type === 'priority') && (
          <Popover align="left" width={280} triggerClassName="" trigger={
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <Settings2 size={14} /> {tr('Zarządzaj statusami')}
            </button>
          }>
            <div className="p-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{tr('Etykiety')}: {groupCol.name}</div>
              <LabelsEditor column={groupCol} onUpdateColumn={data.updateColumn} />
            </div>
          </Popover>
        )}
      </div>
      <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-4">
          {kanbanCols.map(col => (
            <KanbanColumn key={col.key} col={col} columns={data.columns} onOpen={onOpenItem}
              onAdd={dragDisabled ? null : addToColumn} updatesCountByItem={updatesCountByItem} subCountByItem={subCountByItem} disabled={dragDisabled} />
          ))}
        </div>
        <DragOverlay>
          {activeItem ? <div className="w-72"><ItemCard item={activeItem} columns={data.columns} /></div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

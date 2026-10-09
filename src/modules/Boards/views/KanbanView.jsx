import React, { useMemo, useState } from 'react';
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable, DragOverlay,
} from '@dnd-kit/core';
import { Plus, Settings2, Trello, Columns, Check, SearchX } from 'lucide-react';
import '../../../components/toolbar.css';
import ItemCard from '../components/ItemCard';
import Button from '../../../components/Button';
import EmptyState from '../../../components/EmptyState';
import Popover from '../components/Popover';
import LabelsEditor from '../components/LabelsEditor';
import { tr } from '../../../i18n';
import { applyView, groupItemsByColumn } from '../lib/viewData';
import { getColumnType } from '../lib/columnTypes';

// Klawiatura: strzałka w lewo/prawo przeskakuje od razu do sąsiedniej kolumny (domyślne 25 px
// na naciśnięcie wymagałoby kilkunastu naciśnięć na jedną kolumnę).
function columnKeyboardCoordinates(event, { context, currentCoordinates }) {
  const dir = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
  if (!dir) return undefined;
  const rects = [...(context.droppableRects?.values?.() || [])].filter(Boolean).sort((a, b) => a.left - b.left);
  const x = currentCoordinates.x;
  const target = dir > 0 ? rects.find(r => r.left > x + 10) : [...rects].reverse().find(r => r.left < x - 10);
  return target ? { x: target.left + 8, y: target.top + 8 } : undefined;
}

function DraggableCard({ item, columns, people, onOpen, updatesCount, subCount, disabled }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled });
  const style = { transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined, opacity: isDragging ? 0.3 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="mb-2">
      <ItemCard item={item} columns={columns} people={people} onOpen={onOpen} updatesCount={updatesCount} subCount={subCount}
        dragHandleProps={disabled ? undefined : { ...attributes, ...listeners }} />
    </div>
  );
}

function KanbanColumn({ col, columns, people, onOpen, onAdd, addLabel, updatesCountByItem, subCountByItem, disabled }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled });
  return (
    <section className="w-72 shrink-0 flex flex-col snap-start" aria-label={col.title}>
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">{col.title}</h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{col.items.length}</span>
      </div>
      <div ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 min-h-[120px] transition-colors ${isOver ? 'bg-accent-primary/10 ring-2 ring-accent-primary/30' : 'bg-gray-50 dark:bg-gray-800/50'}`}>
        {col.items.map(it => (
          <DraggableCard key={it.id} item={it} columns={columns} people={people} onOpen={onOpen}
            updatesCount={updatesCountByItem?.[it.id] || 0} subCount={subCountByItem?.[it.id] || 0} disabled={disabled} />
        ))}
        {onAdd && (
          <button type="button" onClick={() => onAdd(col)}
            className="w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100 hover:bg-white/70 dark:hover:bg-gray-700/40 transition">
            <Plus size={15} aria-hidden="true" /> {addLabel}
          </button>
        )}
      </div>
    </section>
  );
}

export default function KanbanView({ data, config, onUpdateConfig, onOpenItem, updatesCountByItem, terms }) {
  const can = data.can || {};
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );
  const [activeId, setActiveId] = useState(null);

  const groupableCols = data.columns.filter(c => getColumnType(c.type).groupable);
  // Zapisana kolumna grupująca mogła zostać usunięta — wtedy domyślna (Status), a nie pusty widok.
  const savedGroupBy = groupableCols.some(c => c.id === config.kanbanGroupBy) ? config.kanbanGroupBy : null;
  const groupColId = savedGroupBy || groupableCols.find(c => c.type === 'status')?.id || groupableCols[0]?.id;
  const groupCol = data.columns.find(c => c.id === groupColId);

  const visibleItems = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);
  const kanbanCols = useMemo(() => groupCol ? groupItemsByColumn(visibleItems, groupCol) : [], [visibleItems, groupCol]);
  const subCountByItem = useMemo(() => {
    const m = {};
    data.items.forEach(it => { if (it.parent_item_id) m[it.parent_item_id] = (m[it.parent_item_id] || 0) + 1; });
    return m;
  }, [data.items]);
  const firstGroup = useMemo(() => [...data.groups].sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0], [data.groups]);
  const boardEmpty = !data.items.some(it => !it.parent_item_id);
  // Filtr/wyszukiwanie ukryło wszystko — komunikat zamiast pustych kolumn.
  const filteredEmpty = !visibleItems.some(it => !it.parent_item_id);

  if (!groupCol) {
    return <EmptyState icon={Trello} title={tr('Dodaj kolumnę typu Status, Priorytet, Lista lub Osoby, aby użyć widoku Kanban.')} />;
  }

  // Przeciąganie zmienia wartość kolumny grupującej — tylko z prawem edycji zadań i nie dla
  // „Osób” (zadanie bywa w kilku kolumnach naraz, przeniesienie byłoby niejednoznaczne).
  const dragDisabled = groupCol.type === 'people' || !can.editItems;
  const canAdd = can.createItems && groupCol.type !== 'people' && !!firstGroup;

  const applyGroupValue = (itemId, key) => {
    if (groupCol.type === 'status' || groupCol.type === 'priority') data.updateCell(itemId, groupCol.id, key === '__empty__' ? null : key);
    else if (groupCol.type === 'dropdown') data.updateCell(itemId, groupCol.id, key === '__empty__' ? [] : [key]);
    else if (groupCol.type === 'checkbox') data.updateCell(itemId, groupCol.id, key === 'true');
  };

  // Wartość komórki dla nowego zadania dodawanego w danej kolumnie Kanban.
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
    const it = visibleItems.find(i => i.id === active.id);
    const fromCol = kanbanCols.find(c => c.items.some(i => i.id === active.id));
    if (!it || fromCol?.key === over.id) return; // upuszczenie w tej samej kolumnie — bez zapisu
    applyGroupValue(active.id, over.id);
  };

  // „+ Dodaj zadanie” w kolumnie: od razu z wartością tej kolumny (updateCell w .then działałby na
  // nieaktualnym stanie i status przepadał) i z otwartym oknem, żeby wpisać nazwę.
  const addToColumn = async (col) => {
    if (!canAdd) return;
    const it = await data.addItem(firstGroup.id, '', groupCellsFor(col.key));
    if (it) onOpenItem?.(it);
  };

  const activeItem = activeId ? visibleItems.find(i => i.id === activeId) : null;
  const nameOf = (id) => visibleItems.find(i => i.id === id)?.name || tr('Bez nazwy');
  const titleOf = (key) => kanbanCols.find(c => c.key === key)?.title || '';
  const accessibility = {
    screenReaderInstructions: {
      draggable: tr('Aby przenieść kartę, naciśnij spację lub Enter, wybierz kolumnę strzałkami w lewo i w prawo i ponownie naciśnij spację. Esc anuluje.'),
    },
    announcements: {
      onDragStart: ({ active }) => tr('Podniesiono: {name}', { name: nameOf(active.id) }),
      onDragOver: ({ over }) => (over ? tr('Nad kolumną: {col}', { col: titleOf(over.id) }) : undefined),
      onDragEnd: ({ active, over }) => (over ? tr('Przeniesiono „{name}” do: {col}', { name: nameOf(active.id), col: titleOf(over.id) }) : tr('Anulowano przenoszenie')),
      onDragCancel: () => tr('Anulowano przenoszenie'),
    },
  };

  return (
    <div>
      {/* Ustawienia widoku w stylu paska narzędzi (tool-btn) — jak Filtruj/Sortuj nad nimi. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Popover align="left" width={240} bare className="pick-pop" triggerClassName="inline-flex" trigger={
          <button type="button" className="tool-btn">
            <Columns size={15} aria-hidden="true" /> {tr('Grupuj wg: {name}', { name: groupCol.name })}
          </button>
        }>
          {({ close }) => (
            <div className="py-1" role="listbox" aria-label={tr('Grupuj wg')}>
              {groupableCols.map((c) => (
                <button key={c.id} type="button" role="option" aria-selected={c.id === groupColId}
                  onClick={() => { onUpdateConfig({ kanbanGroupBy: c.id }); close(); }} className="pick-opt text-gray-800 dark:text-gray-100">
                  <span className="truncate">{c.name}</span>
                  {c.id === groupColId && <Check size={15} className="ml-auto shrink-0" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
        </Popover>
        {can.editColumns && (groupCol.type === 'status' || groupCol.type === 'priority') && (
          <Popover align="left" width={280} triggerClassName="inline-flex" trigger={
            <button type="button" className="tool-btn"><Settings2 size={15} aria-hidden="true" /> {tr('Zarządzaj statusami')}</button>
          }>
            <div className="p-3">
              <div className="text-xs font-bold text-gray-500 uppercase mb-2">{tr('Etykiety')}: {groupCol.name}</div>
              <LabelsEditor column={groupCol} onUpdateColumn={data.updateColumn} />
            </div>
          </Popover>
        )}
      </div>
      {!boardEmpty && filteredEmpty ? (
        <EmptyState compact icon={SearchX} title={tr('Brak zadań pasujących do wyszukiwania lub filtrów')}
          action={(config.filters?.length || 0) > 0 || config.mine
            ? <Button variant="secondary" size="sm" onClick={() => onUpdateConfig({ filters: [], mine: false })}>{tr('Wyczyść filtry')}</Button>
            : undefined} />
      ) : boardEmpty ? (
        <EmptyState compact icon={Trello} title={tr(terms?.kind !== 'item' ? 'Brak zadań' : 'Brak elementów')}
          action={canAdd && kanbanCols[0] ? <Button icon={Plus} onClick={() => addToColumn(kanbanCols[0])}>{tr(terms?.add || 'Dodaj')}</Button> : null} />
      ) : (
        <DndContext sensors={sensors} accessibility={accessibility} onDragStart={(e) => setActiveId(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
          <div className="flex gap-3 overflow-x-auto custom-scrollbar pb-4 snap-x">
            {kanbanCols.map(col => (
              <KanbanColumn key={col.key} col={col} columns={data.columns} people={data.people} onOpen={onOpenItem}
                onAdd={canAdd ? addToColumn : null} addLabel={tr(terms?.add || 'Dodaj')}
                updatesCountByItem={updatesCountByItem} subCountByItem={subCountByItem} disabled={dragDisabled} />
            ))}
          </div>
          <DragOverlay>
            {activeItem ? <div className="w-72"><ItemCard item={activeItem} columns={data.columns} people={data.people} /></div> : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

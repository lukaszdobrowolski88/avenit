import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';

export default function DashboardGrid({ layout, onReorder, children }) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const visibleWidgets = layout.filter(w => w.visible);
      const oldIndex = visibleWidgets.findIndex(w => w.widgetId === active.id);
      const newIndex = visibleWidgets.findIndex(w => w.widgetId === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(visibleWidgets, oldIndex, newIndex);
        const newOrder = reordered.map(w => w.widgetId);
        onReorder?.(newOrder);
      }
    }
  };

  const visibleWidgetIds = layout
    .filter(w => w.visible)
    .map(w => w.widgetId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={visibleWidgetIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {children}
        </div>
      </SortableContext>
    </DndContext>
  );
}

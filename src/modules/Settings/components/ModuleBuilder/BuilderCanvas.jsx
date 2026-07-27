import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { LayoutDashboard } from 'lucide-react';
import { tr } from '../../../../i18n';
import { useBuilder, useBuilderActions } from './BuilderContext';
import CanvasElement from './CanvasElement';

export default function BuilderCanvas() {
  const { root } = useBuilder();
  const { select } = useBuilderActions();
  const { setNodeRef, isOver } = useDroppable({ id: 'zone:root' });

  return (
    <div className="flex-1 overflow-y-auto p-6" onClick={() => select(null)}>
      <div className="max-w-3xl mx-auto">
        <div
          ref={setNodeRef}
          className={`min-h-[400px] rounded-2xl border-2 border-dashed p-4 transition space-y-3
            ${isOver ? 'border-accent-primary bg-accent-primary-lightest/40 dark:bg-accent-primary-darkest/10' : 'border-gray-200 dark:border-gray-700'}`}
        >
          <SortableContext items={root.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            {root.length === 0 ? (
              <div className="py-20 text-center">
                <LayoutDashboard size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">{tr('Przeciągnij elementy z lewej strony')}</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">{tr('Zbuduj układ zakładki z gotowych bloków i widgetów.')}</p>
              </div>
            ) : (
              root.map((el) => <CanvasElement key={el.id} el={el} />)
            )}
          </SortableContext>
        </div>
      </div>
    </div>
  );
}

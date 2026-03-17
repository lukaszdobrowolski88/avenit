import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import FieldItem from './FieldItem';

export default function FieldCanvas({
  fields,
  selectedFieldId,
  onSelectField,
  onRemoveField,
  onDuplicateField
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas'
  });

  if (fields.length === 0) {
    return (
      <div
        ref={setNodeRef}
        className={`flex-1 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-colors
          ${isOver
            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
            : 'border-gray-300 dark:border-gray-600'
          }`}
      >
        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
          <Plus size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
          Przeciągnij pola tutaj
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
          Wybierz pole z palety po lewej stronie i przeciągnij je tutaj, aby zbudować formularz
        </p>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className="flex-1">
      <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
        <div className={`space-y-3 min-h-[200px] p-2 rounded-xl transition-colors ${
          isOver ? 'bg-pink-50 dark:bg-pink-900/20' : ''
        }`}>
          {fields.map((field) => (
            <FieldItem
              key={field.id}
              field={field}
              isSelected={selectedFieldId === field.id}
              onSelect={onSelectField}
              onRemove={onRemoveField}
              onDuplicate={onDuplicateField}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

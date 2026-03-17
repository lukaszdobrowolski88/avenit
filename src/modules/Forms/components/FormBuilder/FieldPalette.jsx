import { useDraggable } from '@dnd-kit/core';
import { FIELD_TYPES } from '../../utils/fieldTypes';
import { CalendarCheck } from 'lucide-react';

function PaletteItem({ fieldType, colorScheme = 'pink' }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${fieldType.id}`,
    data: { type: fieldType.id, fromPalette: true }
  });

  const Icon = fieldType.icon;

  const colorSchemes = {
    pink: {
      bg: 'from-pink-50 to-orange-50 dark:from-pink-900/30 dark:to-orange-900/30',
      icon: 'text-pink-600 dark:text-pink-400',
      hover: 'hover:border-pink-300 dark:hover:border-pink-600'
    },
    green: {
      bg: 'from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30',
      icon: 'text-green-600 dark:text-green-400',
      hover: 'hover:border-green-300 dark:hover:border-green-600'
    }
  };

  const colors = colorSchemes[colorScheme] || colorSchemes.pink;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl cursor-grab active:cursor-grabbing flex items-center gap-3
        ${colors.hover} hover:shadow-md transition-all
        ${isDragging ? 'opacity-50 shadow-lg ring-2 ring-pink-500/30' : ''}`}
    >
      <div className={`w-10 h-10 bg-gradient-to-br ${colors.bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Icon size={20} className={colors.icon} />
      </div>
      <div className="min-w-0">
        <p className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">
          {fieldType.label}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {fieldType.description}
        </p>
      </div>
    </div>
  );
}

export default function FieldPalette() {
  const fieldTypes = Object.values(FIELD_TYPES);

  const basicFields = fieldTypes.filter(f =>
    ['text', 'textarea', 'email', 'phone', 'number'].includes(f.id)
  );

  const choiceFields = fieldTypes.filter(f =>
    ['select', 'radio', 'checkbox'].includes(f.id)
  );

  const otherFields = fieldTypes.filter(f =>
    ['date', 'file', 'image'].includes(f.id)
  );

  // Pola wydarzeniowe (specjalne)
  const eventFields = fieldTypes.filter(f => f.category === 'event');

  return (
    <div className="space-y-6">
      {/* Sekcja wydarzeniowa na górze */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-4 border border-green-200 dark:border-green-800">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider mb-3">
          <CalendarCheck size={14} />
          Pola wydarzenia
        </h3>
        <div className="space-y-2">
          {eventFields.map(fieldType => (
            <PaletteItem key={fieldType.id} fieldType={fieldType} colorScheme="green" />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Pola tekstowe
        </h3>
        <div className="space-y-2">
          {basicFields.map(fieldType => (
            <PaletteItem key={fieldType.id} fieldType={fieldType} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Pola wyboru
        </h3>
        <div className="space-y-2">
          {choiceFields.map(fieldType => (
            <PaletteItem key={fieldType.id} fieldType={fieldType} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Inne
        </h3>
        <div className="space-y-2">
          {otherFields.map(fieldType => (
            <PaletteItem key={fieldType.id} fieldType={fieldType} />
          ))}
        </div>
      </div>
    </div>
  );
}

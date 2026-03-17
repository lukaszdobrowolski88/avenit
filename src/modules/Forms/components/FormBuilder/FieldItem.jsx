import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Copy, Asterisk } from 'lucide-react';
import { FIELD_TYPES } from '../../utils/fieldTypes';

export default function FieldItem({
  field,
  isSelected,
  onSelect,
  onRemove,
  onDuplicate
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto'
  };

  const fieldType = FIELD_TYPES[field.type];
  const Icon = fieldType?.icon;

  const renderFieldPreview = () => {
    switch (field.type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'number':
        return (
          <input
            type="text"
            placeholder={field.placeholder || 'Wpisz odpowiedź...'}
            disabled
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400"
          />
        );

      case 'textarea':
        return (
          <textarea
            placeholder={field.placeholder || 'Wpisz odpowiedź...'}
            disabled
            rows={2}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400 resize-none"
          />
        );

      case 'select':
        return (
          <select
            disabled
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400"
          >
            <option>{field.placeholder || 'Wybierz...'}</option>
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {(field.options || []).slice(0, 3).map((opt, idx) => (
              <label key={opt.id || idx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="radio" disabled className="w-4 h-4" />
                {opt.label}
              </label>
            ))}
            {(field.options || []).length > 3 && (
              <p className="text-xs text-gray-400">+{field.options.length - 3} więcej...</p>
            )}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {(field.options || []).slice(0, 3).map((opt, idx) => (
              <label key={opt.id || idx} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <input type="checkbox" disabled className="w-4 h-4 rounded" />
                {opt.label}
              </label>
            ))}
            {(field.options || []).length > 3 && (
              <p className="text-xs text-gray-400">+{field.options.length - 3} więcej...</p>
            )}
          </div>
        );

      case 'date':
        return (
          <input
            type="date"
            disabled
            className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400"
          />
        );

      case 'file':
        return (
          <div className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
            <p className="text-sm text-gray-400">Przeciągnij plik lub kliknij</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(field.id)}
      className={`group bg-white dark:bg-gray-800 rounded-xl border-2 transition-all cursor-pointer
        ${isDragging ? 'shadow-2xl opacity-90' : 'shadow-sm hover:shadow-md'}
        ${isSelected
          ? 'border-pink-500 ring-2 ring-pink-500/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
        }`}
    >
      <div className="flex items-start gap-2 p-4">
        <button
          {...attributes}
          {...listeners}
          className="mt-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {Icon && (
              <div className="w-6 h-6 bg-pink-50 dark:bg-pink-900/30 rounded flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-pink-600 dark:text-pink-400" />
              </div>
            )}
            <span className="font-medium text-gray-900 dark:text-white truncate">
              {field.label}
            </span>
            {field.required && (
              <Asterisk size={12} className="text-red-500 flex-shrink-0" />
            )}
          </div>

          {field.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 line-clamp-1">
              {field.description}
            </p>
          )}

          <div className="pointer-events-none">
            {renderFieldPreview()}
          </div>
        </div>

        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(field.id);
            }}
            className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
            title="Duplikuj"
          >
            <Copy size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(field.id);
            }}
            className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
            title="Usuń"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Maximize2, Minimize2, EyeOff } from 'lucide-react';
import { WIDGET_SIZES } from '../utils/layoutDefaults';

export default function WidgetContainer({
  widgetId,
  title,
  icon: Icon,
  size,
  children,
  onSizeChange,
  onHide,
  isCustomizing = false,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widgetId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const sizeConfig = WIDGET_SIZES[size] || WIDGET_SIZES.medium;

  const handleSizeToggle = () => {
    const sizes = ['small', 'medium', 'large'];
    const currentIndex = sizes.indexOf(size);
    const nextIndex = (currentIndex + 1) % sizes.length;
    onSizeChange?.(sizes[nextIndex]);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${sizeConfig.className} ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 h-full flex flex-col overflow-hidden transition-all duration-300 hover:shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-750">
          <div className="flex items-center gap-2">
            {isCustomizing && (
              <button
                {...attributes}
                {...listeners}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <GripVertical size={18} />
              </button>
            )}
            {Icon && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center">
                <Icon size={16} className="text-white" />
              </div>
            )}
            <h3 className="font-semibold text-gray-800 dark:text-white">{title}</h3>
          </div>

          {isCustomizing && (
            <div className="flex items-center gap-1">
              <button
                onClick={handleSizeToggle}
                className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                title={`Rozmiar: ${WIDGET_SIZES[size].label}`}
              >
                {size === 'small' ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
              </button>
              <button
                onClick={onHide}
                className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                title="Ukryj widget"
              >
                <EyeOff size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

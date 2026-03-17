import React from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { WIDGET_DEFINITIONS, WIDGET_SIZES } from '../utils/layoutDefaults';
import { hasTabAccess } from '../../../utils/tabPermissions';
import * as Icons from 'lucide-react';

export default function LayoutCustomizer({
  isOpen,
  onClose,
  layout,
  onToggleVisibility,
  onSizeChange,
  onReset,
  userRole,
}) {
  if (!isOpen) return null;

  const getIcon = (iconName) => {
    return Icons[iconName] || Icons.Square;
  };

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] sm:max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">
            Dostosuj Pulpit
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Wybierz widoczne widgety i dostosuj ich rozmiar. Możesz również przeciągać widgety na pulpicie, aby zmienić ich kolejność.
          </p>

          <div className="space-y-3">
            {layout
              .filter(item => hasTabAccess('dashboard', item.widgetId, userRole))
              .map(item => {
              const widget = WIDGET_DEFINITIONS[item.widgetId];
              if (!widget) return null;

              const IconComponent = getIcon(widget.icon);

              return (
                <div
                  key={item.widgetId}
                  className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl border transition-all ${
                    item.visible
                      ? 'bg-white dark:bg-gray-750 border-gray-200 dark:border-gray-600'
                      : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 opacity-60'
                  }`}
                >
                  {/* Icon & Name */}
                  <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      item.visible
                        ? 'bg-gradient-to-br from-pink-500 to-orange-500'
                        : 'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <IconComponent size={20} className="text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 dark:text-white">
                        {widget.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {widget.description}
                      </p>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {/* Size selector */}
                    {item.visible && (
                      <select
                        value={item.size}
                        onChange={(e) => onSizeChange(item.widgetId, e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-pink-500"
                      >
                        {Object.entries(WIDGET_SIZES).map(([key, size]) => (
                          <option key={key} value={key}>
                            {size.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {/* Toggle visibility */}
                    <button
                      onClick={() => onToggleVisibility(item.widgetId)}
                      className={`p-2 rounded-lg transition-colors ${
                        item.visible
                          ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400'
                          : 'hover:bg-green-100 dark:hover:bg-green-900/30 text-gray-400 hover:text-green-600'
                      }`}
                      title={item.visible ? 'Ukryj widget' : 'Pokaż widget'}
                    >
                      {item.visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <RotateCcw size={16} />
            Przywróć domyślne
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-xl font-medium hover:shadow-lg transition-all"
          >
            Gotowe
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

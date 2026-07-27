import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { tr } from '../../../../i18n';
import { ELEMENT_TYPES, ELEMENT_CATEGORIES, WIDGET_META } from './builderElements';

function PaletteItem({ dragId, data, icon: Icon, label }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId, data });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={`w-full flex items-center gap-2 p-2.5 rounded-xl border text-left transition cursor-grab active:cursor-grabbing
        ${isDragging ? 'opacity-40' : ''}
        border-gray-200 dark:border-gray-700 hover:border-accent-primary-light hover:bg-accent-primary-lightest/40 dark:hover:bg-accent-primary-darkest/10`}
    >
      <span className="w-8 h-8 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-accent-primary">
        <Icon size={16} />
      </span>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{tr(label)}</span>
    </button>
  );
}

export default function ElementPalette() {
  return (
    <div className="space-y-5">
      {ELEMENT_CATEGORIES.map((cat) => {
        if (cat.key === 'widget') {
          return (
            <div key={cat.key}>
              <h3 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-2">{tr(cat.label)}</h3>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(WIDGET_META).map(([wtype, meta]) => (
                  <PaletteItem
                    key={wtype}
                    dragId={`palette:widget:${wtype}`}
                    data={{ fromPalette: true, type: 'widget', widgetType: wtype }}
                    icon={meta.icon}
                    label={meta.label}
                  />
                ))}
              </div>
            </div>
          );
        }
        const types = Object.entries(ELEMENT_TYPES).filter(([, def]) => def.category === cat.key);
        if (!types.length) return null;
        return (
          <div key={cat.key}>
            <h3 className="text-xs font-bold uppercase text-gray-400 dark:text-gray-500 mb-2">{tr(cat.label)}</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {types.map(([type, def]) => (
                <PaletteItem
                  key={type}
                  dragId={`palette:${type}`}
                  data={{ fromPalette: true, type }}
                  icon={def.icon}
                  label={def.label}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

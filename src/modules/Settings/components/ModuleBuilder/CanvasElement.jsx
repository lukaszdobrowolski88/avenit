import React from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import * as LucideIcons from 'lucide-react';
import { GripVertical, Copy, Trash2 } from 'lucide-react';
import { tr } from '../../../../i18n';
import { ELEMENT_TYPES, WIDGET_META, isContainer } from './builderElements';
import { styleToCSS } from './styleToCSS';
import { useBuilder, useBuilderActions } from './BuilderContext';

// Strefa upuszczania wewnątrz kontenera.
function ContainerZone({ el, layout = 'stack' }) {
  const { setNodeRef, isOver } = useDroppable({ id: `zone:${el.id}` });
  const children = el.children || [];
  const gridStyle = layout === 'grid'
    ? { display: 'grid', gridTemplateColumns: `repeat(${el.props?.columns || 2}, minmax(0,1fr))`, gap: 8 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={gridStyle}
      className={`min-h-[48px] rounded-lg p-2 ${layout === 'stack' ? 'space-y-2' : ''} transition
        ${isOver ? 'bg-accent-primary-lightest/60 dark:bg-accent-primary-darkest/20 outline outline-2 outline-dashed outline-accent-primary-light' : 'bg-gray-50/60 dark:bg-gray-800/40'}`}
    >
      <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {children.length === 0 ? (
          <div className="text-center text-xs text-gray-400 py-3">{tr('Upuść elementy tutaj')}</div>
        ) : (
          children.map((c) => <CanvasElement key={c.id} el={c} />)
        )}
      </SortableContext>
    </div>
  );
}

function LeafPreview({ el }) {
  const p = el.props || {};
  switch (el.type) {
    case 'heading':
      return <div className="font-bold text-gray-900 dark:text-white" style={{ textAlign: p.align }}>{p.text || tr('Nagłówek')}</div>;
    case 'text':
      return <div className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3" dangerouslySetInnerHTML={{ __html: p.html || '' }} />;
    case 'image':
      return p.src
        ? <img src={p.src} alt="" className="max-h-32 rounded-lg" />
        : <div className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg py-6 text-center">{tr('Obraz')}</div>;
    case 'button':
      return <span className="inline-flex px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-accent-primary to-accent-secondary text-white">{p.label || tr('Przycisk')}</span>;
    case 'list':
      return <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-300">{(p.items || []).slice(0, 4).map((it, i) => <li key={i}>{it}</li>)}</ul>;
    case 'quote':
      return <blockquote className="border-l-4 border-accent-primary pl-3 italic text-sm text-gray-600 dark:text-gray-300">{p.text}</blockquote>;
    case 'alert':
      return <div className="text-xs px-3 py-2 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">{p.text}</div>;
    case 'icon': {
      const Ico = LucideIcons[p.name] || LucideIcons.Star;
      return <Ico size={p.size || 32} className="text-accent-primary" />;
    }
    case 'divider':
      return <hr className="border-gray-300 dark:border-gray-600" />;
    case 'spacer':
      return <div className="text-[10px] text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded text-center py-1">{tr('Odstęp')}</div>;
    case 'widget':
      return (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg px-3 py-2">
          <LucideIcons.Database size={16} className="text-indigo-500" />
          {tr('Widget')}: {tr(WIDGET_META[p.widgetType]?.label || p.widgetType)}
        </div>
      );
    case 'collection':
      return (
        <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
          <LucideIcons.Database size={16} className="text-emerald-500" />
          {tr('Kolekcja')}: {p.title || tr('Kolekcja danych')}
        </div>
      );
    default:
      return <div className="text-xs text-gray-400">{el.type}</div>;
  }
}

export default function CanvasElement({ el }) {
  const { selectedId } = useBuilder();
  const { remove, duplicate, select } = useBuilderActions();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: el.id, data: { elementId: el.id } });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const selected = selectedId === el.id;
  const def = ELEMENT_TYPES[el.type];
  const container = isContainer(el.type);
  const gridLayout = el.type === 'columns' || el.type === 'grid';

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => { e.stopPropagation(); select(el.id); }}
      className={`group/el relative rounded-xl border transition ${selected ? 'border-accent-primary ring-2 ring-accent-primary-light/40' : 'border-gray-200/70 dark:border-gray-700/70 hover:border-accent-primary-light'}`}
    >
      {/* Pasek narzędzi elementu */}
      <div className="absolute -top-3 right-2 z-20 hidden group-hover/el:flex items-center gap-1 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 px-1 py-0.5">
        <button {...listeners} {...attributes} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing" title={tr('Przeciągnij')}>
          <GripVertical size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); duplicate(el.id); }} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title={tr('Duplikuj')}>
          <Copy size={14} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); remove(el.id); }} className="p-1 text-gray-400 hover:text-red-500" title={tr('Usuń')}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Etykieta typu */}
      <div className="absolute -top-2.5 left-2 z-10 hidden group-hover/el:flex">
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-800">{tr(def?.label || el.type)}</span>
      </div>

      <div className="p-2.5" style={styleToCSS(el.style)}>
        {container
          ? <ContainerZone el={el} layout={gridLayout ? 'grid' : 'stack'} />
          : <LeafPreview el={el} />}
      </div>
    </div>
  );
}

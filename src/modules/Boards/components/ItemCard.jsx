import React from 'react';
import { MessageSquare, Calendar, CornerDownRight, Paperclip, Star } from 'lucide-react';
import { Avatar } from './cells/PeopleCell';
import { findLabel, resolveOptions } from '../lib/columnTypes';

// Karta elementu (Kanban / Kalendarz) — pokazuje kluczowe informacje bez otwierania modala.
export default function ItemCard({ item, columns, onOpen, updatesCount = 0, subCount = 0, dragHandleProps }) {
  const statusCols = columns.filter(c => c.type === 'status');
  const priorityCols = columns.filter(c => c.type === 'priority');
  const peopleCol = columns.find(c => c.type === 'people');
  const dateCol = columns.find(c => c.type === 'date');
  const timelineCol = columns.find(c => c.type === 'timeline');
  const dropdownCol = columns.find(c => c.type === 'dropdown');
  const numberCols = columns.filter(c => c.type === 'number');
  const ratingCol = columns.find(c => c.type === 'rating');
  const progressCol = columns.find(c => c.type === 'progress');
  const filesCol = columns.find(c => c.type === 'files');

  const people = peopleCol ? (item.cells?.[peopleCol.id] || []) : [];
  const dateVal = dateCol ? item.cells?.[dateCol.id] : null;
  const tl = timelineCol ? item.cells?.[timelineCol.id] : null;
  const tags = dropdownCol ? resolveOptions(dropdownCol, item.cells?.[dropdownCol.id]) : [];
  const rating = ratingCol ? Number(item.cells?.[ratingCol.id] || 0) : 0;
  const progress = progressCol ? Math.max(0, Math.min(100, Number(item.cells?.[progressCol.id]) || 0)) : null;
  const filesCount = filesCol ? (item.cells?.[filesCol.id] || []).length : 0;
  const numberChips = numberCols
    .map(c => ({ c, v: item.cells?.[c.id] }))
    .filter(x => x.v != null && x.v !== '')
    .slice(0, 2);

  const dateLabel = dateVal || (tl?.start ? `${tl.start}${tl.end ? '–' + tl.end : ''}` : null);
  const pills = [
    ...priorityCols.map(c => findLabel(c, item.cells?.[c.id])).filter(Boolean),
    ...statusCols.map(c => findLabel(c, item.cells?.[c.id])).filter(Boolean),
  ];
  const hasFooter = dateLabel || updatesCount > 0 || subCount > 0 || filesCount > 0 || people.length > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition cursor-pointer"
      onClick={() => onOpen?.(item)}>
      <div className="flex items-start gap-2">
        {dragHandleProps && <div {...dragHandleProps} className="mt-0.5" />}
        <p className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100 line-clamp-2 leading-snug">{item.name || 'Bez nazwy'}</p>
      </div>

      {item.description && (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-snug">{item.description}</p>
      )}

      {(pills.length > 0 || tags.length > 0) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {pills.map((l, i) => (
            <span key={i} className="text-[11px] px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: l.color }}>{l.title}</span>
          ))}
          {tags.map(o => <span key={o.id} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: o.color }}>{o.title}</span>)}
        </div>
      )}

      {(numberChips.length > 0 || rating > 0) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          {numberChips.map(({ c, v }) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <span className="text-gray-400">{c.name}:</span>
              <span className="font-medium text-gray-700 dark:text-gray-200">{v}{c.settings?.unit ? ` ${c.settings.unit}` : ''}</span>
            </span>
          ))}
          {rating > 0 && (
            <span className="inline-flex items-center gap-0.5 text-yellow-500">
              <Star size={12} className="fill-yellow-400 text-yellow-400" /> {rating}
            </span>
          )}
        </div>
      )}

      {progress != null && progress > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? '#00c875' : progress >= 50 ? '#fdab3d' : '#579bfc' }} />
          </div>
          <span className="text-[10px] text-gray-400 w-7 text-right">{progress}%</span>
        </div>
      )}

      {hasFooter && (
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100 dark:border-gray-700/60">
          <div className="flex items-center gap-2.5 text-[11px] text-gray-400 min-w-0">
            {dateLabel && <span className="inline-flex items-center gap-1 truncate"><Calendar size={12} /> {dateLabel}</span>}
            {subCount > 0 && <span className="inline-flex items-center gap-0.5"><CornerDownRight size={12} /> {subCount}</span>}
            {updatesCount > 0 && <span className="inline-flex items-center gap-0.5"><MessageSquare size={12} /> {updatesCount}</span>}
            {filesCount > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={12} /> {filesCount}</span>}
          </div>
          {people.length > 0 && (
            <div className="flex -space-x-2 shrink-0">
              {people.slice(0, 3).map(p => <Avatar key={p.email} person={p} size={22} />)}
              {people.length > 3 && <div className="w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-600 text-[9px] flex items-center justify-center ring-2 ring-white dark:ring-gray-800">+{people.length - 3}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

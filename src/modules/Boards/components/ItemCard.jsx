import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Avatar } from './cells/PeopleCell';
import { findLabel, resolveOptions } from '../lib/columnTypes';

// Kompaktowa karta elementu (Kanban / Kalendarz).
export default function ItemCard({ item, columns, onOpen, updatesCount = 0, dragHandleProps }) {
  const statusCols = columns.filter(c => c.type === 'status' || c.type === 'priority');
  const peopleCol = columns.find(c => c.type === 'people');
  const dateCol = columns.find(c => c.type === 'date');
  const timelineCol = columns.find(c => c.type === 'timeline');
  const dropdownCol = columns.find(c => c.type === 'dropdown');

  const people = peopleCol ? (item.cells?.[peopleCol.id] || []) : [];
  const dateVal = dateCol ? item.cells?.[dateCol.id] : null;
  const tl = timelineCol ? item.cells?.[timelineCol.id] : null;
  const tags = dropdownCol ? resolveOptions(dropdownCol, item.cells?.[dropdownCol.id]) : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => onOpen?.(item)}>
      <div className="flex items-start gap-2">
        {dragHandleProps && <div {...dragHandleProps} className="mt-0.5" />}
        <p className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 line-clamp-2">{item.name || 'Bez nazwy'}</p>
      </div>

      <div className="flex flex-wrap gap-1 mt-2">
        {statusCols.map(c => {
          const l = findLabel(c, item.cells?.[c.id]);
          return l ? <span key={c.id} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: l.color }}>{l.title}</span> : null;
        })}
        {tags.map(o => <span key={o.id} className="text-[11px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: o.color }}>{o.title}</span>)}
      </div>

      {(people.length > 0 || dateVal || tl?.start || updatesCount > 0) && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            {(dateVal || tl?.start) && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                {dateVal || `${tl.start}${tl.end ? '–' + tl.end : ''}`}
              </span>
            )}
            {updatesCount > 0 && (
              <span className="flex items-center gap-0.5 text-[11px] text-gray-400"><MessageSquare size={12} /> {updatesCount}</span>
            )}
          </div>
          {people.length > 0 && (
            <div className="flex -space-x-2">
              {people.slice(0, 3).map(p => <Avatar key={p.email} person={p} size={22} />)}
              {people.length > 3 && <div className="w-[22px] h-[22px] rounded-full bg-gray-200 dark:bg-gray-600 text-[9px] flex items-center justify-center ring-2 ring-white dark:ring-gray-800">+{people.length - 3}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

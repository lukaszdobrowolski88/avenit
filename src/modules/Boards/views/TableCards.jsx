import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, MessageSquare, CornerDownRight, Calendar } from 'lucide-react';
import { Avatar } from '../components/cells/PeopleCell';
import { StatusPill } from '../../../components/ui/DataTable';
import { findLabel, formatDate } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import { tr } from '../../../i18n';

// Wąski ekran (telefon): zamiast tabeli przewijanej w bok — karty zadań w grupach. Na karcie to,
// co najważniejsze: nazwa, status, termin, osoby, liczba podzadań/komentarzy. Dotknięcie otwiera
// panel zadania (tam są wszystkie pola).
export function useNarrow(query = '(max-width: 639px)') {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return narrow;
}

function ItemCardRow({ item, statusCol, dateCol, peopleCol, subCount, updatesCount, onOpen, terms }) {
  const label = statusCol ? findLabel(statusCol, item.cells?.[statusCol.id]) : null;
  const date = dateCol ? item.cells?.[dateCol.id] : null;
  const people = peopleCol ? (item.cells?.[peopleCol.id] || []) : [];
  const overdue = date && date < new Date().toISOString().slice(0, 10) && !/zrobione|gotowe|done|zako/i.test(label?.title || '');
  return (
    <li>
      <button type="button" onClick={() => onOpen(item)}
        className="w-full text-left px-4 py-3 flex flex-col gap-2 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors outline-none">
        <span className={`text-[15px] font-semibold leading-snug ${item.name ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
          {item.name || tr(terms.placeholder || 'Nazwa zadania')}
        </span>
        {(label || date || people.length > 0 || subCount > 0 || updatesCount > 0) && (
          <span className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400">
            {label && <StatusPill color={boardColor(label.color)}>{label.title}</StatusPill>}
            {date && (
              <span className={`inline-flex items-center gap-1 tabular-nums ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                <Calendar size={13} aria-hidden="true" /> {formatDate(date)}
              </span>
            )}
            {subCount > 0 && <span className="inline-flex items-center gap-1"><CornerDownRight size={13} aria-hidden="true" />{subCount}</span>}
            {updatesCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={13} aria-hidden="true" />{updatesCount}</span>}
            {people.length > 0 && (
              <span className="ml-auto flex -space-x-1.5" aria-label={people.map((p) => p.name || p.email).join(', ')}>
                {people.slice(0, 3).map((p) => <Avatar key={p.email} person={p} size={24} />)}
                {people.length > 3 && <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-bold grid place-items-center ring-2 ring-white dark:ring-gray-800">+{people.length - 3}</span>}
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}

export default function TableCards({ data, groups, visibleItems, allItems, onOpenItem, updatesCountByItem = {}, can, terms }) {
  const { columns } = data;
  const statusCol = columns.find((c) => c.type === 'status') || columns.find((c) => c.type === 'priority');
  const dateCol = columns.find((c) => c.type === 'date');
  const peopleCol = columns.find((c) => c.type === 'people');
  const [adding, setAdding] = useState(null);

  // Nowe zadanie na telefonie: od razu panel (nazwa w nim ma fokus, gdy pusta).
  const add = async (groupId) => {
    if (adding) return;
    setAdding(groupId);
    try {
      const it = await data.addItem(groupId, '');
      if (it) onOpenItem(it);
    } finally { setAdding(null); }
  };

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const rows = visibleItems.filter((it) => it.group_id === g.id && !it.parent_item_id);
        const collapsed = !!g.collapsed;
        return (
          <section key={g.id} aria-label={g.name}>
            <button type="button" onClick={() => data.updateGroup(g.id, { collapsed: !collapsed })} aria-expanded={!collapsed}
              className="flex items-center gap-2 mb-2 px-1 h-8 text-sm font-semibold text-gray-900 dark:text-white">
              {collapsed ? <ChevronRight size={16} className="text-gray-400" aria-hidden="true" /> : <ChevronDown size={16} className="text-gray-400" aria-hidden="true" />}
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: boardColor(g.color) }} aria-hidden="true" />
              {g.name}
              <span className="text-xs font-normal text-gray-400 tabular-nums">{rows.length}</span>
            </button>
            {!collapsed && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {rows.map((it) => (
                    <ItemCardRow key={it.id} item={it} statusCol={statusCol} dateCol={dateCol} peopleCol={peopleCol} terms={terms}
                      subCount={allItems.filter((s) => s.parent_item_id === it.id).length}
                      updatesCount={updatesCountByItem[it.id] || 0} onOpen={onOpenItem} />
                  ))}
                </ul>
                {can.createItems && (
                  <button type="button" onClick={() => add(g.id)} disabled={adding === g.id}
                    className={`w-full flex items-center gap-2 px-4 h-11 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${rows.length ? 'border-t border-gray-100 dark:border-gray-700/60' : ''}`}>
                    <Plus size={16} aria-hidden="true" /> {tr(terms.addRow || 'Dodaj element')}
                  </button>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

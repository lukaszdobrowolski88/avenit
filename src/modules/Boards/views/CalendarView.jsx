import React, { useMemo, useState, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, addDays, differenceInCalendarDays, isSameMonth, isSameDay, parseISO,
} from 'date-fns';
import { pl } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import CustomSelect from '../../../components/CustomSelect';
import { useCan } from '../../../components/Can';
import { tr } from '../../../i18n';

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];

export default function CalendarView({ data, config, onUpdateConfig, onOpenItem }) {
  const [cursor, setCursor] = useState(() => new Date());
  const dragItem = useRef(null);
  const canUpdate = useCan('res:board_items:update');
  const canCreate = useCan('res:board_items:create');

  const dateCols = data.columns.filter(c => c.type === 'date' || c.type === 'timeline');
  const dateColId = config.calendarDateColumn || dateCols[0]?.id;
  const dateCol = data.columns.find(c => c.id === dateColId);
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');

  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const getDate = (it) => {
    const v = it.cells?.[dateColId];
    if (!v) return null;
    return dateCol?.type === 'timeline' ? v.start : v;
  };

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const itemsByDay = useMemo(() => {
    const map = {};
    for (const it of items) {
      const d = getDate(it);
      if (!d) continue;
      (map[d] = map[d] || []).push(it);
    }
    return map;
  }, [items, dateColId]);

  // Przenieś element na inny dzień (dla timeline zachowaj długość: przesuń start i end).
  const rescheduleTo = (it, dayKey) => {
    if (!canUpdate) return;
    if (dateCol.type === 'timeline') {
      const v = it.cells?.[dateColId] || {};
      let end = null;
      if (v.start && v.end) {
        const dur = differenceInCalendarDays(parseISO(v.end), parseISO(v.start));
        end = format(addDays(parseISO(dayKey), Math.max(0, dur)), 'yyyy-MM-dd');
      }
      data.updateCell(it.id, dateColId, { start: dayKey, end });
    } else {
      data.updateCell(it.id, dateColId, dayKey);
    }
  };

  // Utwórz nowy element na klikniętym dniu (pierwsza grupa) i otwórz panel.
  const createOnDay = async (dayKey) => {
    if (!canCreate) return;
    const g = [...data.groups].sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0];
    if (!g) return;
    const cells = { [dateColId]: dateCol.type === 'timeline' ? { start: dayKey, end: null } : dayKey };
    const it = await data.addItem(g.id, '', cells);
    if (it) onOpenItem(it);
  };

  if (!dateCol) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu Data lub Oś czasu, aby użyć widoku Kalendarz.</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(addMonths(cursor, -1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={18} /></button>
          <span className="text-lg font-semibold text-gray-800 dark:text-gray-100 capitalize min-w-[160px] text-center">{format(cursor, 'LLLL yyyy', { locale: pl })}</span>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={18} /></button>
          <button onClick={() => setCursor(new Date())} className="ml-2 text-sm text-accent-primary">Dziś</button>
        </div>
        {dateCols.length > 1 && (
          <div className="w-44">
            <CustomSelect compact value={dateColId} onChange={(v) => onUpdateConfig({ calendarDateColumn: v })}
              options={dateCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {WEEKDAYS.map(d => <div key={d} className="bg-gray-50 dark:bg-gray-800 text-center text-xs font-semibold text-gray-500 py-2">{d}</div>)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayItems = itemsByDay[key] || [];
          const muted = !isSameMonth(day, cursor);
          const today = isSameDay(day, new Date());
          return (
            <div key={key}
              onDragOver={(e) => { if (canUpdate && dragItem.current) e.preventDefault(); }}
              onDrop={() => { if (dragItem.current) { rescheduleTo(dragItem.current, key); dragItem.current = null; } }}
              className={`group relative bg-white dark:bg-gray-800 min-h-[92px] p-1.5 ${muted ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className={`text-xs ${today ? 'bg-accent-primary text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-gray-400'}`}>{format(day, 'd')}</div>
                {canCreate && (
                  <button onClick={() => createOnDay(key)} title="Dodaj na ten dzień"
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-accent-primary"><Plus size={13} /></button>
                )}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map(it => {
                  const l = statusCol ? findLabel(statusCol, it.cells?.[statusCol.id]) : null;
                  return (
                    <button key={it.id}
                      draggable={canUpdate}
                      onDragStart={() => { dragItem.current = it; }}
                      onDragEnd={() => { dragItem.current = null; }}
                      onClick={() => onOpenItem(it)}
                      className="w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate text-white cursor-pointer"
                      style={{ backgroundColor: l ? l.color : '#579bfc' }}>
                      {it.name || 'Bez nazwy'}
                    </button>
                  );
                })}
                {dayItems.length > 3 && <div className="text-[10px] text-gray-400 pl-1">+{dayItems.length - 3} więcej</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

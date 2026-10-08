import React, { useMemo, useState, useRef } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, addMonths, addDays, differenceInCalendarDays, isSameMonth, isSameDay, parseISO,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CalendarX } from 'lucide-react';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import Popover from '../components/Popover';
import CustomSelect from '../../../components/CustomSelect';
import EmptyState from '../../../components/EmptyState';
import { readablePillText, STATUS_COLORS } from '../../../components/ui/DataTable';
import '../../../components/pickList.css';
import { tr, appLocale } from '../../../i18n';

const MAX_IN_CELL = 3;
const hex6 = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : STATUS_COLORS.neutral);
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Zadanie w dniu — miękka pigułka z kropką (jak EventBadge w głównym kalendarzu), kolor statusu
// z palety aplikacji; tekst przyciemniony do czytelnego kontrastu (jak StatusPill).
function ItemChip({ item, color, draggable, onDragStart, onDragEnd, onOpen }) {
  const c = hex6(color);
  const name = item.name || tr('Bez nazwy');
  return (
    <button type="button" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onOpen(item); }} title={name}
      className={`w-full text-left text-xs px-1.5 py-1 rounded-md truncate flex items-center gap-1 transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/40 text-[color:var(--pill-fg)] dark:text-[color:var(--pill-fg-dark)] ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ backgroundColor: `${c}22`, '--pill-fg': readablePillText(c, false), '--pill-fg-dark': readablePillText(c, true) }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} aria-hidden="true" />
      <span className={`truncate font-medium ${item.name ? '' : 'italic opacity-70'}`}>{name}</span>
    </button>
  );
}

export default function CalendarView({ data, config, onUpdateConfig, onOpenItem }) {
  const can = data.can || {};
  const [cursor, setCursor] = useState(() => new Date());
  const [dragOverKey, setDragOverKey] = useState(null);
  const dragItem = useRef(null);
  const canUpdate = !!can.editItems;
  const canCreate = !!can.createItems;

  const dateCols = data.columns.filter(c => c.type === 'date' || c.type === 'timeline');
  const dateColId = (dateCols.some(c => c.id === config.calendarDateColumn) ? config.calendarDateColumn : null) || dateCols[0]?.id;
  const dateCol = data.columns.find(c => c.id === dateColId);
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');

  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const itemsByDay = useMemo(() => {
    const map = {};
    for (const it of items) {
      const v = it.cells?.[dateColId];
      const d = v ? String(dateCol?.type === 'timeline' ? v.start || '' : v).slice(0, 10) : '';
      if (!d) continue;
      (map[d] = map[d] || []).push(it);
    }
    return map;
  }, [items, dateColId, dateCol?.type]);

  const colorOf = (it) => {
    const l = statusCol ? findLabel(statusCol, it.cells?.[statusCol.id]) : null;
    return boardColor(l?.color);
  };

  // Przenieś zadanie na inny dzień (dla osi czasu zachowaj długość: przesuń start i koniec).
  const rescheduleTo = (it, dayKey) => {
    if (!canUpdate || !it) return;
    if (dateCol.type === 'timeline') {
      const v = it.cells?.[dateColId] || {};
      if (v.start === dayKey) return;
      let end = null;
      if (v.start && v.end) {
        const dur = differenceInCalendarDays(parseISO(v.end), parseISO(v.start));
        end = format(addDays(parseISO(dayKey), Math.max(0, dur)), 'yyyy-MM-dd');
      }
      data.updateCell(it.id, dateColId, { start: dayKey, end });
    } else if (String(it.cells?.[dateColId] || '').slice(0, 10) !== dayKey) {
      data.updateCell(it.id, dateColId, dayKey);
    }
  };

  // Nowe zadanie na klikniętym dniu (pierwsza grupa) — od razu z datą i z otwartym oknem.
  const createOnDay = async (dayKey) => {
    if (!canCreate || !dateCol) return;
    const g = [...data.groups].sort((a, b) => (a.display_order || 0) - (b.display_order || 0))[0];
    if (!g) return;
    const cells = { [dateColId]: dateCol.type === 'timeline' ? { start: dayKey, end: null } : dayKey };
    const it = await data.addItem(g.id, '', cells);
    if (it) onOpenItem(it);
  };

  if (!dateCol) {
    return <EmptyState icon={CalendarDays} title={tr('Dodaj kolumnę typu Data lub Oś czasu, aby użyć widoku Kalendarz.')} />;
  }

  // Przeciąganie HTML5: dataTransfer.setData jest wymagane w Firefoksie (bez niego nie startuje).
  const dragProps = (it) => (canUpdate ? {
    draggable: true,
    onDragStart: (e) => { dragItem.current = it; try { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ } },
    onDragEnd: () => { dragItem.current = null; setDragOverKey(null); },
  } : { draggable: false });
  const dropProps = (key) => (canUpdate ? {
    onDragOver: (e) => { if (!dragItem.current) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverKey !== key) setDragOverKey(key); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverKey((k) => (k === key ? null : k)); },
    onDrop: (e) => {
      e.preventDefault();
      const id = (() => { try { return e.dataTransfer.getData('text/plain'); } catch { return ''; } })();
      const it = dragItem.current || items.find(x => x.id === id);
      dragItem.current = null; setDragOverKey(null);
      rescheduleTo(it, key);
    },
  } : {});

  const monthTitle = capitalize(cursor.toLocaleDateString(appLocale(), { month: 'long', year: 'numeric' }));
  const dayNames = [
    { short: tr('Pn'), full: tr('Poniedziałek') },
    { short: tr('Wt'), full: tr('Wtorek') },
    { short: tr('Śr'), full: tr('Środa') },
    { short: tr('Cz'), full: tr('Czwartek') },
    { short: tr('Pt'), full: tr('Piątek') },
    { short: tr('So'), full: tr('Sobota') },
    { short: tr('Nd'), full: tr('Niedziela') },
  ];
  const now = new Date();
  const monthDays = days.filter(d => isSameMonth(d, cursor) && (itemsByDay[format(d, 'yyyy-MM-dd')] || []).length > 0);

  const addButton = (key, day, extra = '') => (canCreate ? (
    <button type="button" onClick={() => createOnDay(key)} aria-label={tr('Dodaj w dniu {d}', { d: day.toLocaleDateString(appLocale(), { day: 'numeric', month: 'long' }) })} title={tr('Dodaj')}
      className={`p-0.5 lg:p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 ${extra}`}>
      <Plus size={14} aria-hidden="true" />
    </button>
  ) : null);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCursor(addMonths(cursor, -1))} aria-label={tr('Poprzedni miesiąc')}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronLeft size={18} aria-hidden="true" /></button>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 min-w-[160px] text-center" aria-live="polite">{monthTitle}</h3>
          <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} aria-label={tr('Następny miesiąc')}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ChevronRight size={18} aria-hidden="true" /></button>
          <button type="button" onClick={() => setCursor(new Date())} className="ml-2 px-2 py-1 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">{tr('Dziś')}</button>
        </div>
        {dateCols.length > 1 && (
          <div className="w-44">
            <CustomSelect compact value={dateColId} onChange={(v) => onUpdateConfig({ calendarDateColumn: v })}
              options={dateCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
          </div>
        )}
      </div>

      {/* Telefon: lista dni z zadaniami zamiast ściśniętej siatki 7 kolumn. */}
      <div className="sm:hidden">
        {monthDays.length === 0 ? (
          <EmptyState compact icon={CalendarX} title={tr('Nic w tym miesiącu')} />
        ) : (
          <ol className="space-y-3">
            {monthDays.map(day => {
              const key = format(day, 'yyyy-MM-dd');
              const today = isSameDay(day, now);
              return (
                <li key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold uppercase ${today ? 'text-accent-primary' : 'text-gray-500'}`}>
                      {day.toLocaleDateString(appLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    {addButton(key, day)}
                  </div>
                  <div className="space-y-1">
                    {itemsByDay[key].map(it => <ItemChip key={it.id} item={it} color={colorOf(it)} onOpen={onOpenItem} draggable={false} />)}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="hidden sm:block rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {dayNames.map(d => (
            <div key={d.short} className="py-2 lg:py-3 text-center text-[10px] lg:text-xs font-bold text-gray-500 uppercase">
              <span className="lg:hidden" aria-hidden="true">{d.short}</span>
              <span className="hidden lg:inline">{d.full}</span>
              <span className="sr-only lg:hidden">{d.full}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayItems = itemsByDay[key] || [];
            const inMonth = isSameMonth(day, cursor);
            const today = isSameDay(day, now);
            const over = dragOverKey === key;
            return (
              <div key={key} {...dropProps(key)}
                className={`group relative min-h-[100px] p-1 lg:p-2 transition ${over ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 ring-2 ring-inset ring-accent-primary/40' : inMonth ? 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50' : 'bg-gray-50/60 dark:bg-gray-900/60'}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs lg:text-sm font-bold w-5 h-5 lg:w-7 lg:h-7 flex items-center justify-center rounded-full ${today ? 'bg-accent-primary text-white' : inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}
                    aria-current={today ? 'date' : undefined}>
                    {format(day, 'd')}
                  </span>
                  {addButton(key, day, 'opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100')}
                </div>
                <div className="space-y-1">
                  {dayItems.slice(0, MAX_IN_CELL).map(it => (
                    <ItemChip key={it.id} item={it} color={colorOf(it)} onOpen={onOpenItem} {...dragProps(it)} />
                  ))}
                  {dayItems.length > MAX_IN_CELL && (
                    <Popover width={240} align="left" triggerClassName="block" trigger={
                      <button type="button" className="w-full text-left text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                        +{dayItems.length - MAX_IN_CELL} {tr('więcej')}
                      </button>
                    }>
                      {({ close }) => (
                        <div className="py-1 max-h-72 overflow-y-auto custom-scrollbar">
                          <div className="pick-section">{day.toLocaleDateString(appLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                          {dayItems.map(it => (
                            <button key={it.id} type="button" className="pick-opt text-gray-800 dark:text-gray-100"
                              onClick={() => { close(); onOpenItem(it); }}>
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex6(colorOf(it)) }} aria-hidden="true" />
                              <span className="truncate">{it.name || tr('Bez nazwy')}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </Popover>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

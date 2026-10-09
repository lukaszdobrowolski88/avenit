import React, { useMemo, useState, useEffect } from 'react';
import {
  parseISO, differenceInCalendarDays, eachDayOfInterval, format, addDays, min as dMin, max as dMax, isSameDay, isValid,
} from 'date-fns';
import { CalendarRange } from 'lucide-react';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import CustomSelect from '../../../components/CustomSelect';
import EmptyState from '../../../components/EmptyState';
import { readablePillText, STATUS_COLORS } from '../../../components/ui/DataTable';
import { tr, appLocale } from '../../../i18n';

const DAY_W = 30;
const ROW_H = 40;
const fmt = (d) => format(d, 'yyyy-MM-dd');
const hex6 = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : STATUS_COLORS.neutral);
const DEP_COLOR = '#9ca3af'; // strzałki zależności neutralne (szare) — kolor niesie status, nie linia

// Szerokość kolumny nazw: na telefonie węższa, żeby było widać oś.
function useNameWidth() {
  const get = () => (typeof window !== 'undefined' && window.innerWidth < 640 ? 140 : 220);
  const [w, setW] = useState(get);
  useEffect(() => {
    const on = () => setW(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

// Pasek Gantta: przeciąganie (przesuń, zachowaj długość) + zmiana długości krawędziami. Podgląd na
// żywo przez lokalny stan; zapis dat na koniec. Bez ruchu = klik otwiera zadanie. Klawiatura:
// Enter/Spacja otwiera. pointercancel (np. przewinięcie strony palcem) anuluje bez zapisu.
function TimelineBar({ item, start, end, offset, length, color, editable, resizable, onUpdate, onOpen }) {
  const [drag, setDrag] = useState(null); // { mode:'move'|'left'|'right', dx }
  const startDrag = (mode) => (e) => {
    if (e.button != null && e.button !== 0) return;
    if (!editable) return; // bez prawa edycji pasek tylko otwiera zadanie (onClick)
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX; let dx = 0, moved = false;
    const move = (ev) => { dx = Math.round((ev.clientX - startX) / DAY_W); if (Math.abs(ev.clientX - startX) > 3) moved = true; setDrag({ mode, dx }); };
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
      setDrag(null);
    };
    const cancel = () => cleanup();
    const up = () => {
      cleanup();
      if (!moved && mode === 'move') { onOpen(); return; }
      if (!dx) return;
      if (mode === 'move') onUpdate(fmt(addDays(start, dx)), fmt(addDays(end, dx)));
      else if (mode === 'left') { const ns = addDays(start, dx); onUpdate(fmt(ns <= end ? ns : end), fmt(end)); }
      else { const ne = addDays(end, dx); onUpdate(fmt(start), fmt(ne >= start ? ne : start)); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
  };
  let left = offset * DAY_W + 2, width = Math.max(length * DAY_W - 4, DAY_W - 4);
  if (drag) {
    if (drag.mode === 'move') left += drag.dx * DAY_W;
    else if (drag.mode === 'left') { left += drag.dx * DAY_W; width -= drag.dx * DAY_W; }
    else width += drag.dx * DAY_W;
    width = Math.max(DAY_W - 4, width);
  }
  const c = hex6(color);
  const name = item.name || tr('Bez nazwy');
  const when = `${start.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })}${isSameDay(start, end) ? '' : ` – ${end.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' })}`}`;
  return (
    // Miękki odcień koloru statusu + ciemny tekst (jak StatusPill) zamiast białego na nasyconym.
    <div role="button" tabIndex={0} aria-label={`${name}, ${when}`} title={`${name} · ${when}`}
      onPointerDown={startDrag('move')}
      onClick={() => { if (!editable) onOpen(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={`absolute h-6 rounded-full text-[11px] font-medium px-2 truncate flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 hover:brightness-95 text-[color:var(--pill-fg)] dark:text-[color:var(--pill-fg-dark)] ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{
        top: 8, left, width, backgroundColor: `${c}33`, boxShadow: `inset 0 0 0 1px ${c}55`,
        '--pill-fg': readablePillText(c, false), '--pill-fg-dark': readablePillText(c, true),
        // pan-y: palcem da się przewijać stronę w pionie, a ruch w poziomie przesuwa pasek.
        touchAction: editable ? 'pan-y' : undefined,
      }}>
      {editable && resizable && <div onPointerDown={startDrag('left')} className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden="true" />}
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: c }} aria-hidden="true" />
      <span className="truncate">{name}</span>
      {editable && resizable && <div onPointerDown={startDrag('right')} className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" aria-hidden="true" />}
    </div>
  );
}

export default function TimelineView({ data, config, onUpdateConfig, onOpenItem, terms }) {
  const NAME_W = useNameWidth();
  const tlCols = data.columns.filter(c => c.type === 'timeline' || c.type === 'date');
  const savedCol = tlCols.some(c => c.id === config.timelineColumn) ? config.timelineColumn : null;
  const colId = savedCol || data.columns.find(c => c.type === 'timeline')?.id || tlCols[0]?.id;
  const col = data.columns.find(c => c.id === colId);
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const canUpdate = !!data.can?.editItems;
  const updateBar = (item, ns, ne) => {
    if (col?.type === 'timeline') data.updateCell(item.id, colId, { start: ns, end: ne });
    else data.updateCell(item.id, colId, ns); // kolumna Data = pojedynczy dzień
  };

  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);

  const spans = useMemo(() => {
    const out = [];
    for (const it of items) {
      const v = it.cells?.[colId];
      if (!v) continue;
      let start, end;
      if (col?.type === 'timeline') { start = v.start; end = v.end || v.start; } else { start = v; end = v; }
      if (!start) continue;
      const s = parseISO(String(start).slice(0, 10));
      const e = parseISO(String(end).slice(0, 10));
      if (!isValid(s)) continue;
      out.push({ item: it, start: s, end: isValid(e) && e >= s ? e : s });
    }
    return out;
  }, [items, colId, col?.type]);
  const undated = items.length - spans.length;

  const range = useMemo(() => {
    if (!spans.length) return null;
    const lo = dMin(spans.map(s => s.start));
    const hi = dMax(spans.map(s => s.end));
    const start = addDays(lo, -2);
    const end = addDays(hi, 3);
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [spans]);

  if (!col) return <EmptyState icon={CalendarRange} title={tr('Dodaj kolumnę typu Oś czasu, aby użyć widoku Oś czasu.')} />;

  const colPicker = tlCols.length > 1 && (
    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      {tr('Kolumna dat:')}
      <div className="w-44">
        <CustomSelect compact value={colId} onChange={(v) => onUpdateConfig({ timelineColumn: v })}
          options={tlCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
      </div>
    </div>
  );

  if (!range) {
    return (
      <div>
        {colPicker && <div className="mb-3">{colPicker}</div>}
        <EmptyState icon={CalendarRange} title={tr(terms?.kind === 'item' ? 'Brak elementów z ustawioną datą/osią czasu.' : 'Żadne zadanie nie ma jeszcze daty')}
          subtitle={undated > 0 ? tr('Uzupełnij kolumnę „{name}”, aby zobaczyć oś czasu.', { name: col.name }) : undefined} />
      </div>
    );
  }

  const totalW = range.days.length * DAY_W;
  const today = new Date();
  const todayOffset = differenceInCalendarDays(today, range.start);
  const todayVisible = todayOffset >= 0 && todayOffset < range.days.length;

  // Geometria pasków + strzałki zależności (kolumna typu dependency)
  const depCol = data.columns.find(c => c.type === 'dependency');
  const geom = spans.map((s, i) => {
    const offset = differenceInCalendarDays(s.start, range.start);
    const length = differenceInCalendarDays(s.end, s.start) + 1;
    return { id: s.item.id, left: offset * DAY_W + 2, width: Math.max(length * DAY_W - 4, DAY_W - 4), row: i };
  });
  const geomById = Object.fromEntries(geom.map(g => [g.id, g]));
  const arrows = [];
  if (depCol) {
    for (const s of spans) {
      const D = geomById[s.item.id];
      for (const dep of (s.item.cells?.[depCol.id] || [])) {
        const P = geomById[dep.id];
        if (P && D && P.id !== D.id) arrows.push({
          x1: P.left + P.width, y1: P.row * ROW_H + ROW_H / 2,
          x2: D.left, y2: D.row * ROW_H + ROW_H / 2,
        });
      }
    }
  }

  return (
    <div>
      {(colPicker || undated > 0) && (
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          {colPicker || <span />}
          {undated > 0 && <span className="text-xs text-gray-500 dark:text-gray-400">{tr('Bez daty: {n}', { n: undated })}</span>}
        </div>
      )}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <div style={{ width: NAME_W + totalW }}>
            {/* Nagłówek osi */}
            <div className="flex bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="shrink-0 sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 text-xs font-bold uppercase text-gray-500 flex items-center px-3" style={{ width: NAME_W }}>
                {tr(terms?.column || 'Element')}
              </div>
              <div className="flex">
                {range.days.map((d, i) => {
                  const firstOfMonth = d.getDate() === 1 || i === 0;
                  const isToday = isSameDay(d, today);
                  return (
                    <div key={i} className="shrink-0 text-center border-r border-gray-100 dark:border-gray-700/50 py-1" style={{ width: DAY_W }}>
                      <div className="h-3.5 text-[10px] font-bold text-gray-600 dark:text-gray-300 capitalize whitespace-nowrap">
                        {firstOfMonth ? d.toLocaleDateString(appLocale(), { month: 'short' }).replace('.', '') : ''}
                      </div>
                      <div className={`text-[10px] tabular-nums mx-auto w-5 h-5 flex items-center justify-center rounded-full ${isToday ? 'bg-accent-primary text-white font-bold' : 'text-gray-500 dark:text-gray-400'}`}>{format(d, 'd')}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Wiersze + nakładka strzałek zależności */}
            <div className="relative">
              {spans.map(({ item, start, end }) => {
                const offset = differenceInCalendarDays(start, range.start);
                const length = differenceInCalendarDays(end, start) + 1;
                const l = statusCol ? findLabel(statusCol, item.cells?.[statusCol.id]) : null;
                return (
                  <div key={item.id} className="group flex items-center border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/40" style={{ height: ROW_H }}>
                    <button type="button" onClick={() => onOpenItem(item)}
                      className={`shrink-0 sticky left-0 z-10 h-full bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 border-r border-gray-200 dark:border-gray-700 text-left text-sm truncate px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/50 ${item.name ? 'text-gray-700 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400 italic'}`}
                      style={{ width: NAME_W }}>
                      {item.name || tr('Bez nazwy')}
                    </button>
                    <div className="relative" style={{ width: totalW, height: ROW_H }}>
                      <TimelineBar item={item} start={start} end={end} offset={offset} length={length}
                        color={boardColor(l?.color)} editable={canUpdate} resizable={col.type === 'timeline'}
                        onUpdate={(ns, ne) => updateBar(item, ns, ne)} onOpen={() => onOpenItem(item)} />
                    </div>
                  </div>
                );
              })}
              {todayVisible && (
                <div className="absolute top-0 bottom-0 w-px bg-accent-primary/40 pointer-events-none" style={{ left: NAME_W + todayOffset * DAY_W + DAY_W / 2 }} aria-hidden="true" />
              )}
              {arrows.length > 0 && (
                <svg className="absolute top-0 pointer-events-none" style={{ left: NAME_W, width: totalW, height: spans.length * ROW_H }} aria-hidden="true">
                  <defs>
                    <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill={DEP_COLOR} />
                    </marker>
                  </defs>
                  {arrows.map((a, i) => {
                    const midX = a.x2 - 10;
                    const d = `M ${a.x1} ${a.y1} H ${Math.max(a.x1 + 8, midX)} V ${a.y2} H ${a.x2}`;
                    return <path key={i} d={d} fill="none" stroke={DEP_COLOR} strokeWidth="1.5" markerEnd="url(#dep-arrow)" />;
                  })}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

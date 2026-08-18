import React, { useMemo, useState } from 'react';
import {
  parseISO, differenceInCalendarDays, eachDayOfInterval, format, addDays, min as dMin, max as dMax, isSameMonth,
} from 'date-fns';
import { pl } from 'date-fns/locale';
import { applyView } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import CustomSelect from '../../../components/CustomSelect';
import { useCan } from '../../../components/Can';
import { tr } from '../../../i18n';

const DAY_W = 30;
const NAME_W = 220;
const fmt = (d) => format(d, 'yyyy-MM-dd');

// Pasek Gantta: przeciąganie (przesuń, zachowaj długość) + resize krawędzi. Podgląd na żywo
// przez lokalny stan; commit dat na koniec. Bez ruchu = klik otwiera element.
function TimelineBar({ item, start, end, offset, length, color, editable, resizable, onUpdate, onOpen }) {
  const [drag, setDrag] = useState(null); // { mode:'move'|'left'|'right', dx }
  const startDrag = (mode) => (e) => {
    if (!editable) { onOpen(); return; }
    e.stopPropagation(); e.preventDefault();
    const startX = e.clientX; let dx = 0, moved = false;
    const move = (ev) => { dx = Math.round((ev.clientX - startX) / DAY_W); if (Math.abs(ev.clientX - startX) > 3) moved = true; setDrag({ mode, dx }); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDrag(null);
      if (!moved && mode === 'move') { onOpen(); return; }
      if (!dx) return;
      if (mode === 'move') onUpdate(fmt(addDays(start, dx)), fmt(addDays(end, dx)));
      else if (mode === 'left') { const ns = addDays(start, dx); onUpdate(fmt(ns <= end ? ns : end), fmt(end)); }
      else { const ne = addDays(end, dx); onUpdate(fmt(start), fmt(ne >= start ? ne : start)); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  let left = offset * DAY_W + 2, width = Math.max(length * DAY_W - 4, DAY_W - 4);
  if (drag) {
    if (drag.mode === 'move') left += drag.dx * DAY_W;
    else if (drag.mode === 'left') { left += drag.dx * DAY_W; width -= drag.dx * DAY_W; }
    else width += drag.dx * DAY_W;
    width = Math.max(DAY_W - 4, width);
  }
  return (
    <div onPointerDown={startDrag('move')} title={item.name}
      className={`absolute h-6 rounded-full text-[11px] text-white px-2 truncate flex items-center hover:brightness-110 ${editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{ top: 8, left, width, backgroundColor: color }}>
      {editable && resizable && <div onPointerDown={startDrag('left')} className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize" />}
      <span className="truncate">{item.name}</span>
      {editable && resizable && <div onPointerDown={startDrag('right')} className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize" />}
    </div>
  );
}

export default function TimelineView({ data, config, onUpdateConfig, onOpenItem }) {
  const tlCols = data.columns.filter(c => c.type === 'timeline' || c.type === 'date');
  const colId = config.timelineColumn || data.columns.find(c => c.type === 'timeline')?.id || tlCols[0]?.id;
  const col = data.columns.find(c => c.id === colId);
  const statusCol = data.columns.find(c => c.type === 'status' || c.type === 'priority');
  const canUpdate = useCan('res:board_items:update');
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
      if (col?.type === 'timeline') { start = v.start; end = v.end || v.start; }
      else { start = v; end = v; }
      if (!start) continue;
      try { out.push({ item: it, start: parseISO(start), end: parseISO(end) }); } catch { /* ignore */ }
    }
    return out;
  }, [items, colId, col]);

  const range = useMemo(() => {
    if (!spans.length) return null;
    const lo = dMin(spans.map(s => s.start));
    const hi = dMax(spans.map(s => s.end));
    const start = addDays(lo, -2);
    const end = addDays(hi, 3);
    return { start, end, days: eachDayOfInterval({ start, end }) };
  }, [spans]);

  if (!col) return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu Oś czasu, aby użyć widoku Oś czasu.</div>;
  if (!range) return <div className="text-center py-16 text-gray-400 text-sm">Brak elementów z ustawioną datą/osią czasu.</div>;

  const totalW = range.days.length * DAY_W;
  const ROW_H = 40;

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
      {tlCols.length > 1 && (
        <div className="flex items-center gap-2 mb-3 text-sm text-gray-500">
          {tr('Kolumna dat:')}
          <div className="w-44">
            <CustomSelect compact value={colId} onChange={(v) => onUpdateConfig({ timelineColumn: v })}
              options={tlCols} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
          </div>
        </div>
      )}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <div style={{ width: NAME_W + totalW }}>
            {/* Nagłówek osi */}
            <div className="flex bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 sticky top-0">
              <div className="shrink-0 border-r border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 flex items-center px-3" style={{ width: NAME_W }}>Element</div>
              <div className="flex">
                {range.days.map((d, i) => {
                  const firstOfMonth = d.getDate() === 1 || i === 0;
                  return (
                    <div key={i} className="shrink-0 text-center border-r border-gray-100 dark:border-gray-700/50 py-1" style={{ width: DAY_W }}>
                      {firstOfMonth && <div className="text-[10px] font-semibold text-accent-primary capitalize">{format(d, 'LLL', { locale: pl })}</div>}
                      <div className="text-[10px] text-gray-400">{format(d, 'd')}</div>
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
                  <div key={item.id} className="flex items-center border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30" style={{ height: ROW_H }}>
                    <div className="shrink-0 border-r border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 truncate px-3" style={{ width: NAME_W }}>{item.name || 'Bez nazwy'}</div>
                    <div className="relative" style={{ width: totalW, height: ROW_H }}>
                      <TimelineBar item={item} start={start} end={end} offset={offset} length={length}
                        color={l ? l.color : '#6366f1'} editable={canUpdate} resizable={col.type === 'timeline'}
                        onUpdate={(ns, ne) => updateBar(item, ns, ne)} onOpen={() => onOpenItem(item)} />
                    </div>
                  </div>
                );
              })}
              {arrows.length > 0 && (
                <svg className="absolute top-0 pointer-events-none" style={{ left: NAME_W, width: totalW, height: spans.length * ROW_H }}>
                  <defs>
                    <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                      <path d="M0,0 L6,3 L0,6 Z" fill="#e2445c" />
                    </marker>
                  </defs>
                  {arrows.map((a, i) => {
                    const midX = a.x2 - 10;
                    const d = `M ${a.x1} ${a.y1} H ${Math.max(a.x1 + 8, midX)} V ${a.y2} H ${a.x2}`;
                    return <path key={i} d={d} fill="none" stroke="#e2445c" strokeWidth="1.5" markerEnd="url(#dep-arrow)" opacity="0.7" />;
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

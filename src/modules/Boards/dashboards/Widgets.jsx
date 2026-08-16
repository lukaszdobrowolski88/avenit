import React from 'react';
import { MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import Popover from '../components/Popover';
import { BarChart, DonutChart, Battery } from './Charts';
import { groupItemsByColumn } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';

// Wylicza dane widżetu z pakietu tablic.
export function computeWidget(widget, bundle) {
  const items = bundle.items?.[widget.boardId] || [];
  const columns = bundle.columns?.[widget.boardId] || [];
  const column = columns.find(c => c.id === widget.columnId);

  if (widget.type === 'number') {
    if (widget.aggregation === 'count' || !column) return { value: items.length, label: 'elementów' };
    const nums = items.map(i => i.cells?.[column.id]).filter(v => typeof v === 'number');
    if (widget.aggregation === 'sum') return { value: nums.reduce((a, b) => a + b, 0), label: `suma: ${column.name}` };
    if (widget.aggregation === 'avg') return { value: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0, label: `średnia: ${column.name}` };
    const filled = items.filter(i => i.cells?.[column.id] != null).length;
    return { value: filled, label: `wypełnione: ${column.name}` };
  }

  if (widget.type === 'chart' || widget.type === 'battery') {
    if (!column) return { data: [] };
    const groups = groupItemsByColumn(items, column).filter(g => g.items.length > 0);
    return { data: groups.map(g => ({ label: g.title, value: g.items.length, color: g.color })) };
  }

  if (widget.type === 'table') {
    const statusCol = columns.find(c => c.type === 'status' || c.type === 'priority');
    return { rows: items.slice(0, 50).map(i => ({
      id: i.id, name: i.name,
      status: statusCol ? findLabel(statusCol, i.cells?.[statusCol.id]) : null,
    })) };
  }
  return {};
}

const SIZE_CLASS = { small: 'lg:col-span-1', medium: 'lg:col-span-2', large: 'lg:col-span-3' };

export function WidgetCard({ widget, bundle, boardName, editing, onEdit, onRemove }) {
  const d = computeWidget(widget, bundle);
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 ${SIZE_CLASS[widget.size] || SIZE_CLASS.small}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{widget.title || 'Widżet'}</h3>
          <p className="text-[11px] text-gray-400">{boardName}</p>
        </div>
        {editing && (
          <Popover align="right" width={150} trigger={<button className="text-gray-400 hover:text-gray-600 p-1"><MoreHorizontal size={16} /></button>}>
            {({ close }) => (
              <div className="p-1.5">
                <button onClick={() => { onEdit(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 text-sm"><Pencil size={14} /> Edytuj</button>
                <button onClick={() => { onRemove(); close(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-sm text-red-600"><Trash2 size={14} /> Usuń</button>
              </div>
            )}
          </Popover>
        )}
      </div>

      {widget.type === 'number' && (
        <div className="py-4 text-center">
          <div className="text-4xl font-bold text-accent-primary">{d.value}</div>
          <div className="text-xs text-gray-400 mt-1">{d.label}</div>
        </div>
      )}
      {widget.type === 'chart' && (widget.chartType === 'pie' ? <DonutChart data={d.data} /> : <BarChart data={d.data} />)}
      {widget.type === 'battery' && <Battery data={d.data} />}
      {widget.type === 'table' && (
        <div className="max-h-64 overflow-y-auto custom-scrollbar -mx-1">
          {(d.rows || []).map(r => (
            <div key={r.id} className="flex items-center gap-2 px-1 py-1.5 border-b border-gray-50 dark:border-gray-700/40 text-sm">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{r.name || 'Bez nazwy'}</span>
              {r.status && <span className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: r.status.color }}>{r.status.title}</span>}
            </div>
          ))}
          {(!d.rows || d.rows.length === 0) && <div className="text-center text-sm text-gray-400 py-4">Brak elementów</div>}
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { Trash2, Pencil } from 'lucide-react';
import ActionMenu from '../../../components/ActionMenu';
import { StatusPill } from '../../../components/ui/DataTable';
import { BarChart, DonutChart, Battery } from './Charts';
import { groupItemsByColumn } from '../lib/viewData';
import { findLabel } from '../lib/columnTypes';
import { boardColor } from '../lib/palette';
import { tr } from '../../../i18n';

// Wylicza dane widżetu z pakietu tablic.
export function computeWidget(widget, bundle) {
  const items = bundle.items?.[widget.boardId] || [];
  const columns = bundle.columns?.[widget.boardId] || [];
  const column = columns.find(c => c.id === widget.columnId);

  if (widget.type === 'number') {
    if (widget.aggregation === 'count' || !column) return { value: items.length, label: tr('elementów') };
    const nums = items.map(i => i.cells?.[column.id]).filter(v => typeof v === 'number');
    if (widget.aggregation === 'sum') return { value: nums.reduce((a, b) => a + b, 0), label: tr('suma: {name}', { name: column.name }) };
    if (widget.aggregation === 'avg') return { value: nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0, label: tr('średnia: {name}', { name: column.name }) };
    const filled = items.filter(i => i.cells?.[column.id] != null).length;
    return { value: filled, label: tr('wypełnione: {name}', { name: column.name }) };
  }

  if (widget.type === 'chart' || widget.type === 'battery') {
    if (!column) return { data: [] };
    const groups = groupItemsByColumn(items, column).filter(g => g.items.length > 0);
    return { data: groups.map(g => ({ label: g.title, value: g.items.length, color: g.color ? boardColor(g.color) : null })) };
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
  const title = widget.title || tr('Widżet');
  const headingId = `widget-${widget.id}`;
  return (
    <section aria-labelledby={headingId} className={`bg-white dark:bg-gray-800 rounded-2xl p-4 min-w-0 ${SIZE_CLASS[widget.size] || SIZE_CLASS.small}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{title}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{boardName}</p>
        </div>
        {editing && (
          <ActionMenu variant="ghost" label={tr('Działania: {name}', { name: title })} items={[
            { key: 'edit', icon: Pencil, label: tr('Edytuj'), onClick: onEdit },
            { key: 'remove', icon: Trash2, label: tr('Usuń'), danger: true, onClick: onRemove },
          ]} />
        )}
      </div>

      {widget.type === 'number' && (
        <div className="py-4 text-center">
          <div className="text-4xl font-bold text-gray-900 dark:text-white tabular-nums">{d.value}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{d.label}</div>
        </div>
      )}
      {widget.type === 'chart' && (widget.chartType === 'pie'
        ? <DonutChart data={d.data} title={title} />
        : <BarChart data={d.data} title={title} />)}
      {widget.type === 'battery' && <Battery data={d.data} title={title} />}
      {widget.type === 'table' && (
        <ul className="max-h-64 overflow-y-auto custom-scrollbar -mx-1 divide-y divide-gray-100 dark:divide-gray-700/50">
          {(d.rows || []).map(r => (
            <li key={r.id} className="flex items-center gap-2 px-1 py-1.5 text-sm">
              <span className="flex-1 truncate text-gray-700 dark:text-gray-200">{r.name || tr('Bez nazwy')}</span>
              {r.status && <StatusPill color={boardColor(r.status.color)} className="shrink-0">{r.status.title}</StatusPill>}
            </li>
          ))}
          {(!d.rows || d.rows.length === 0) && <li className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">{tr('Brak elementów')}</li>}
        </ul>
      )}
    </section>
  );
}

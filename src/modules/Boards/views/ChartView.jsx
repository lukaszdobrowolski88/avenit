import React, { useMemo } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import { BarChart, DonutChart } from '../dashboards/Charts';
import { applyView, groupItemsByColumn } from '../lib/viewData';
import { getColumnType } from '../lib/columnTypes';

// Widok Wykres — rozkład elementów wg wybranej kolumny (słupkowy/kołowy).
export default function ChartView({ data, config, onUpdateConfig }) {
  const groupable = data.columns.filter(c => getColumnType(c.type).groupable);
  const colId = config.chartColumn || groupable.find(c => c.type === 'status')?.id || groupable[0]?.id;
  const col = data.columns.find(c => c.id === colId);
  const chartType = config.chartType || 'bar';

  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);
  const chartData = useMemo(() => {
    if (!col) return [];
    return groupItemsByColumn(items, col).filter(g => g.items.length > 0)
      .map(g => ({ label: g.title, value: g.items.length, color: g.color }));
  }, [items, col]);

  if (!col) {
    return <div className="text-center py-16 text-gray-400 text-sm">Dodaj kolumnę typu Status, Priorytet, Lista, Osoby lub Pole wyboru, aby zobaczyć wykres.</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          Grupuj wg:
          <select value={colId} onChange={(e) => onUpdateConfig({ chartColumn: e.target.value })}
            className="bg-gray-100 dark:bg-gray-700/50 rounded-lg px-2 py-1 text-sm outline-none">
            {groupable.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex gap-1">
          {[{ k: 'bar', icon: BarChart3 }, { k: 'pie', icon: PieChart }].map(o => (
            <button key={o.k} onClick={() => onUpdateConfig({ chartType: o.k })}
              className={`p-2 rounded-lg border ${chartType === o.k ? 'border-accent-primary text-accent-primary bg-accent-primary/10' : 'border-gray-200 dark:border-gray-700 text-gray-400'}`}>
              <o.icon size={16} />
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Elementy wg „{col.name}" ({items.length})</h3>
        {chartType === 'pie' ? <DonutChart data={chartData} size={220} /> : <BarChart data={chartData} height={280} />}
      </div>
    </div>
  );
}

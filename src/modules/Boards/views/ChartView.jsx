import React, { useMemo } from 'react';
import { BarChart3, PieChart } from 'lucide-react';
import { BarChart, DonutChart } from '../dashboards/Charts';
import CustomSelect from '../../../components/CustomSelect';
import EmptyState from '../../../components/EmptyState';
import '../../../components/toolbar.css';
import { tr } from '../../../i18n';
import { applyView, groupItemsByColumn } from '../lib/viewData';
import { getColumnType } from '../lib/columnTypes';
import { boardColor, LABEL_COLORS } from '../lib/palette';

const CHART_TYPES = [
  { k: 'bar', icon: BarChart3, label: 'Wykres słupkowy' },
  { k: 'pie', icon: PieChart, label: 'Wykres kołowy' },
];

// Widok Wykres — rozkład zadań wg wybranej kolumny (słupkowy/kołowy).
export default function ChartView({ data, config, onUpdateConfig }) {
  const groupable = data.columns.filter(c => getColumnType(c.type).groupable);
  const savedCol = groupable.some(c => c.id === config.chartColumn) ? config.chartColumn : null;
  const colId = savedCol || groupable.find(c => c.type === 'status')?.id || groupable[0]?.id;
  const col = data.columns.find(c => c.id === colId);
  const chartType = config.chartType === 'pie' ? 'pie' : 'bar';

  const items = useMemo(() => applyView(data.items, data.columns, config), [data.items, data.columns, config]);
  // Kolory zawsze z palety aplikacji — bez tego wykres sięgał po zapasową „tęczę” Monday.
  const chartData = useMemo(() => {
    if (!col) return [];
    return groupItemsByColumn(items, col).filter(g => g.items.length > 0)
      .map((g, i) => ({ label: g.title, value: g.items.length, color: g.color ? boardColor(g.color) : LABEL_COLORS[i % LABEL_COLORS.length] }));
  }, [items, col]);

  if (!col) {
    return <EmptyState icon={BarChart3} title={tr('Dodaj kolumnę typu Status, Priorytet, Lista, Osoby lub Pole wyboru, aby zobaczyć wykres.')} />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          {tr('Grupuj wg:')}
          <div className="w-48">
            <CustomSelect compact value={colId} onChange={(v) => onUpdateConfig({ chartColumn: v })}
              options={groupable} mapOptionToValue={(c) => c.id} mapOptionToLabel={(c) => c.name} />
          </div>
        </div>
        <div className="seg-bar" role="group" aria-label={tr('Rodzaj wykresu')}>
          {CHART_TYPES.map(o => (
            <button key={o.k} type="button" className="seg-btn" aria-pressed={chartType === o.k} aria-label={tr(o.label)} title={tr(o.label)}
              onClick={() => onUpdateConfig({ chartType: o.k })}>
              <o.icon size={15} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-gray-100 truncate">{col.name}</h3>
          <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums shrink-0">{tr('Razem: {n}', { n: items.length })}</span>
        </div>
        {chartType === 'pie'
          ? <DonutChart data={chartData} size={220} title={tr('Wykres kołowy: {name}', { name: col.name })} />
          : <BarChart data={chartData} height={280} title={tr('Wykres słupkowy: {name}', { name: col.name })} />}
      </div>
    </div>
  );
}

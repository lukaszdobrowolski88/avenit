// Wykresy raportów finansowych (Recharts). Theme-aware, w stylu modułu.
// Paleta: status green/red dla wpływy/wydatki; kategoryczna CVD-safe dla kategorii.
import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';

// Kategoryczna paleta (slot order = mechanizm CVD, nie kosmetyka — nie cyklować).
export const CATEGORICAL = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const INCOME = '#0ca30c';   // status: good
const EXPENSE = '#d03b3b';  // status: critical
const SERIES_BLUE = '#2a78d6';
const AXIS = '#898781';     // muted — czytelny w obu motywach
const GRID = 'rgba(136,135,129,0.25)';

const num = (v) => Number(v || 0);
const pln = (n) => num(n).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' zł';
const compact = (n) => {
  const a = Math.abs(num(n));
  if (a >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + ' mln';
  if (a >= 1000) return Math.round(n / 1000) + ' tys.';
  return String(Math.round(n));
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg px-3 py-2 text-xs">
      {label != null && <p className="font-semibold text-gray-900 dark:text-white mb-1">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color || p.payload?.color }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{pln(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = { stroke: AXIS, tick: { fill: AXIS, fontSize: 11 }, tickLine: false, axisLine: { stroke: GRID } };

/** Grupowany słupkowy: Wpływy vs Wydatki w kubełkach czasu. */
export function IncomeExpenseBarChart({ buckets, height = 300, tr = (x) => x }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(136,135,129,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name={tr('Wpływy')} fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name={tr('Wydatki')} fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Skumulowany przepływ gotówki (area z gradientem). */
export function CashFlowAreaChart({ buckets, height = 260, tr = (x) => x }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="cashflowGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES_BLUE} stopOpacity={0.35} />
            <stop offset="100%" stopColor={SERIES_BLUE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="cumulative" name={tr('Saldo skumulowane')} stroke={SERIES_BLUE} strokeWidth={2.5} fill="url(#cashflowGrad)" dot={false} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Donut wg kategorii. data=[{name, amount, pct, color?}]. */
export function CategoryDonut({ data, height = 280, tr = (x) => x }) {
  const slices = (data || []).filter((d) => d.amount > 0);
  if (!slices.length) return <p className="text-center text-gray-400 py-8">{tr('Brak danych')}</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={slices} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius="55%" outerRadius="80%" paddingAngle={2} stroke="none">
          {slices.map((s, i) => <Cell key={i} fill={s.color || CATEGORICAL[i % CATEGORICAL.length]} />)}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-gray-600 dark:text-gray-300">{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Porównanie rok-do-roku: grupowany słupkowy (poprz. vs bież.). */
export function YoYBars({ yoy, prevLabel, nowLabel, height = 240, tr = (x) => x }) {
  if (!yoy) return null;
  const data = [
    { label: tr('Przychody'), prev: yoy.income.prev, now: yoy.income.now },
    { label: tr('Wydatki'), prev: yoy.expense.prev, now: yoy.expense.now },
    { label: tr('Bilans'), prev: yoy.balance.prev, now: yoy.balance.now },
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(136,135,129,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="prev" name={String(prevLabel)} fill="#9ec5f4" radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="now" name={String(nowLabel)} fill={SERIES_BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

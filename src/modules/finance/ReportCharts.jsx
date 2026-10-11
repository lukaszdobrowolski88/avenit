// Wykresy raportów finansowych (Recharts). Theme-aware, w stylu modułu.
// Bez animacji: PDF zrzuca widok zaraz po pokazaniu sekcji — animowany wykres byłby w połowie.
// Paleta: status green/red dla wpływy/wydatki; kategoryczna CVD-safe dla kategorii.
import React from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area, PieChart, Pie, Cell, LabelList,
} from 'recharts';
import { appLocale } from '../../i18n';

// Kategoryczna paleta (slot order = mechanizm CVD, nie kosmetyka — nie cyklować).
export const CATEGORICAL = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834'];
const INCOME = '#0ca30c';   // status: good
const EXPENSE = '#d03b3b';  // status: critical
const SERIES_BLUE = '#2a78d6';
const AXIS = '#898781';     // muted — czytelny w obu motywach
const GRID = 'rgba(136,135,129,0.25)';

const num = (v) => Number(v || 0);
const pln = (n) => num(n).toLocaleString(appLocale(), { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' zł';
const pln2 = (n) => num(n).toLocaleString(appLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
const pct = (n) => num(n).toLocaleString(appLocale(), { maximumFractionDigits: 1 }) + '%';
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

// Pusty stan zamiast wykresu z osią 0–4 i dymkiem „0 zł”.
const hasMoney = (buckets) => (buckets || []).some((b) => num(b.income) !== 0 || num(b.expense) !== 0);
const NoData = ({ tr, text }) => <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">{text || tr('Brak wpływów i wydatków w tym okresie')}</p>;

/** Grupowany słupkowy: Wpływy vs Wydatki w kubełkach czasu. */
export function IncomeExpenseBarChart({ buckets, height = 300, tr = (x) => x }) {
  if (!hasMoney(buckets)) return <NoData tr={tr} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={buckets} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(136,135,129,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name={tr('Wpływy')} fill={INCOME} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="expense" name={tr('Wydatki')} fill={EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Skumulowany przepływ gotówki (area z gradientem). */
export function CashFlowAreaChart({ buckets, height = 260, tr = (x) => x }) {
  if (!hasMoney(buckets)) return <NoData tr={tr} />;
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
        <Area type="monotone" dataKey="cumulative" name={tr('Saldo skumulowane')} stroke={SERIES_BLUE} strokeWidth={2.5} fill="url(#cashflowGrad)" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Wartości liczbowe są widoczne na stałe (legenda z kwotą i %, tabele pod wykresami) — dymki
// działają tylko po najechaniu myszą, więc w PDF i na wydruku liczb wcześniej nie było.
const MAX_SLICES = 9;

/** Donut wg kategorii + legenda z kwotą i udziałem. data=[{name, amount, pct, color?}]. */
export function CategoryDonut({ data, height = 220, tr = (x) => x }) {
  const all = (data || []).filter((d) => d.amount > 0);
  if (!all.length) return <NoData tr={tr} text={tr('Brak danych w tym okresie')} />;
  // Długi ogon zwijamy w „Pozostałe”, żeby legenda (i strona PDF) była czytelna.
  let slices = all;
  if (all.length > MAX_SLICES) {
    const rest = all.slice(MAX_SLICES - 1);
    slices = [...all.slice(0, MAX_SLICES - 1), {
      name: `${tr('Pozostałe')} (${rest.length})`,
      amount: rest.reduce((a, r) => a + num(r.amount), 0),
      pct: rest.reduce((a, r) => a + num(r.pct), 0),
      color: '#a8a29e',
    }];
  }
  const colored = slices.map((s, i) => ({ ...s, fill: s.color || CATEGORICAL[i % CATEGORICAL.length] }));
  const total = all.reduce((a, r) => a + num(r.amount), 0);
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-full sm:w-1/2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={colored} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="85%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {colored.map((s, i) => <Cell key={i} fill={s.fill} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{tr('Razem')}</span>
          <span className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">{pln(total)}</span>
        </div>
      </div>
      <ul className="w-full sm:w-1/2 space-y-1.5 text-sm">
        {colored.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.fill }} />
            <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200" title={tr(s.name)}>{tr(s.name)}</span>
            <span className="tabular-nums font-semibold text-gray-900 dark:text-white whitespace-nowrap">{pln2(s.amount)}</span>
            <span className="tabular-nums text-xs text-gray-500 dark:text-gray-400 w-12 text-right">{pct(s.pct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tabela pod wykresami okresu: wpływy, wydatki, bilans i saldo skumulowane w każdym kubełku. */
export function BucketTable({ buckets, tr = (x) => x }) {
  if (!hasMoney(buckets)) return null;
  const sum = (k) => buckets.reduce((a, b) => a + num(b[k]), 0);
  const tone = (v) => (v >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400');
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left font-medium py-1.5 pr-2">{tr('Okres')}</th>
            <th className="text-right font-medium py-1.5 px-2">{tr('Wpływy')}</th>
            <th className="text-right font-medium py-1.5 px-2">{tr('Wydatki')}</th>
            <th className="text-right font-medium py-1.5 px-2">{tr('Bilans')}</th>
            <th className="text-right font-medium py-1.5 pl-2">{tr('Saldo skumulowane')}</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1 pr-2 text-gray-700 dark:text-gray-200">{b.label}</td>
              <td className="py-1 px-2 text-right text-gray-900 dark:text-white">{pln2(b.income)}</td>
              <td className="py-1 px-2 text-right text-gray-900 dark:text-white">{pln2(b.expense)}</td>
              <td className={`py-1 px-2 text-right font-medium ${tone(b.balance)}`}>{pln2(b.balance)}</td>
              <td className={`py-1 pl-2 text-right ${tone(b.cumulative)}`}>{pln2(b.cumulative)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5 pr-2 text-gray-900 dark:text-white">{tr('Razem')}</td>
            <td className="py-1.5 px-2 text-right text-gray-900 dark:text-white">{pln2(sum('income'))}</td>
            <td className="py-1.5 px-2 text-right text-gray-900 dark:text-white">{pln2(sum('expense'))}</td>
            <td className={`py-1.5 px-2 text-right ${tone(sum('balance'))}`}>{pln2(sum('balance'))}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Porównanie rok-do-roku: grupowany słupkowy (poprz. vs bież.). */
export function YoYBars({ yoy, prevLabel, nowLabel, height = 240, tr = (x) => x }) {
  if (!yoy) return null;
  if (![yoy.income, yoy.expense].some((v) => num(v.now) !== 0 || num(v.prev) !== 0)) return <NoData tr={tr} text={tr('Brak danych do porównania')} />;
  const data = [
    { label: tr('Przychody'), prev: yoy.income.prev, now: yoy.income.now },
    { label: tr('Wydatki'), prev: yoy.expense.prev, now: yoy.expense.now },
    { label: tr('Bilans'), prev: yoy.balance.prev, now: yoy.balance.now },
  ];
  return (
    <>
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} tickFormatter={compact} width={48} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(136,135,129,0.08)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="prev" name={String(prevLabel)} fill="#9ec5f4" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
          <LabelList dataKey="prev" position="top" formatter={compact} style={{ fill: AXIS, fontSize: 11 }} />
        </Bar>
        <Bar dataKey="now" name={String(nowLabel)} fill={SERIES_BLUE} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
          <LabelList dataKey="now" position="top" formatter={compact} style={{ fill: AXIS, fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    <table className="w-full mt-3 text-xs tabular-nums">
      <thead>
        <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
          <th className="text-left font-medium py-1.5" />
          <th className="text-right font-medium py-1.5 px-2">{String(prevLabel)}</th>
          <th className="text-right font-medium py-1.5 px-2">{String(nowLabel)}</th>
          <th className="text-right font-medium py-1.5 pl-2">{tr('Zmiana')}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => {
          const diff = num(d.now) - num(d.prev);
          const rel = num(d.prev) !== 0 ? (diff / Math.abs(num(d.prev))) * 100 : null;
          return (
            <tr key={d.label} className="border-b border-gray-100 dark:border-gray-800">
              <td className="py-1 text-gray-700 dark:text-gray-200">{d.label}</td>
              <td className="py-1 px-2 text-right text-gray-900 dark:text-white">{pln2(d.prev)}</td>
              <td className="py-1 px-2 text-right text-gray-900 dark:text-white">{pln2(d.now)}</td>
              <td className="py-1 pl-2 text-right text-gray-700 dark:text-gray-200">{diff >= 0 ? '+' : ''}{pln2(diff)}{rel != null ? ` (${diff >= 0 ? '+' : ''}${pct(rel)})` : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </>
  );
}

import React from 'react';
import { BarChart3 } from 'lucide-react';
import EmptyState from '../../../components/EmptyState';
import { boardColor, LABEL_COLORS } from '../lib/palette';
import { tr } from '../../../i18n';

// Lekkie wykresy SVG (bez zewnętrznej biblioteki). Kolory z etykiet (status/opcje) przez paletę
// aplikacji (boardColor mapuje stare kolory Monday), zapas — LABEL_COLORS, bez „tęczy”.
// Dostępność: każdy wykres to role="img" z nazwą (title) i streszczeniem danych dla czytnika
// ekranu („Do zrobienia: 3, Gotowe: 5 — razem 8”).
const colorAt = (d, i) => (d.color ? boardColor(d.color) : LABEL_COLORS[i % LABEL_COLORS.length]);

// Streszczenie danych wykresu (czytnik ekranu, podpowiedź). Czyste — testy.
export function chartSummary(data, title = '') {
  const total = (data || []).reduce((s, d) => s + (Number(d.value) || 0), 0);
  const parts = (data || []).map((d) => `${d.label || tr('Bez etykiety')}: ${d.value}`).join(', ');
  const body = parts ? `${parts} — ${tr('razem {n}', { n: total })}` : tr('Brak danych');
  return title ? `${title}. ${body}` : body;
}

export function BarChart({ data, height = 200, title = '' }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(18, Math.min(64, Math.floor(560 / data.length)));
  const gap = 14;
  const chartW = data.length * (barW + gap);
  const h = height, padB = 34, padT = 16;
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <svg width={Math.max(chartW, 200)} height={h} role="img" aria-label={chartSummary(data, title)}>
        {data.map((d, i) => {
          const bh = Math.round(((h - padB - padT) * d.value) / max);
          const x = i * (barW + gap) + gap / 2;
          const y = h - padB - bh;
          return (
            <g key={i} aria-hidden="true">
              <rect x={x} y={y} width={barW} height={bh} rx={5} fill={colorAt(d, i)}><title>{`${d.label}: ${d.value}`}</title></rect>
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="11" className="fill-gray-600 dark:fill-gray-300">{d.value}</text>
              <text x={x + barW / 2} y={h - padB + 16} textAnchor="middle" fontSize="10" className="fill-gray-500 dark:fill-gray-400">
                {truncate(d.label, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({ data, size = 180, title = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const r = size / 2, stroke = 26, rad = r - stroke / 2;
  const circ = 2 * Math.PI * rad;
  let offset = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={chartSummary(data, title)}>
        <g transform={`rotate(-90 ${r} ${r})`} aria-hidden="true">
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * circ;
            const el = (
              <circle key={i} cx={r} cy={r} r={rad} fill="none" stroke={colorAt(d, i)} strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={r} y={r} textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700" className="fill-gray-800 dark:fill-gray-100" aria-hidden="true">{total}</text>
      </svg>
      <ul className="space-y-1" aria-hidden="true">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorAt(d, i) }} />
            <span className="text-gray-700 dark:text-gray-200">{d.label}</span>
            <span className="text-gray-500 dark:text-gray-400 tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pasek udziału (np. statusy). Bez białego tekstu na kolorze — procenty w legendzie.
export function Battery({ data, title = '' }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const pct = (v) => Math.round((v / total) * 100);
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700" role="img" aria-label={chartSummary(data, title)}>
        {data.map((d, i) => d.value > 0 && (
          <div key={i} style={{ width: `${(d.value / total) * 100}%`, backgroundColor: colorAt(d, i) }} title={`${d.label}: ${d.value}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-2" aria-hidden="true">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colorAt(d, i) }} />
            {d.label} <span className="tabular-nums text-gray-500 dark:text-gray-400">{d.value} · {pct(d.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty() { return <EmptyState compact icon={BarChart3} title={tr('Brak danych')} />; }
function truncate(s, n) { return (s || '').length > n ? s.slice(0, n) + '…' : s; }

import React from 'react';

// Lekkie wykresy SVG (bez zewnętrznej biblioteki). Kolory przekazuje wołający
// (etykiety statusów/opcji mają własne kolory), fallback z palety.
const FALLBACK = ['#6366f1', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#0086c0', '#ff5ac4', '#9cd326'];

export function BarChart({ data, height = 200 }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(18, Math.min(64, Math.floor(560 / data.length)));
  const gap = 14;
  const chartW = data.length * (barW + gap);
  const h = height, padB = 34, padT = 16;
  return (
    <div className="overflow-x-auto custom-scrollbar">
      <svg width={Math.max(chartW, 200)} height={h} role="img">
        {data.map((d, i) => {
          const bh = Math.round(((h - padB - padT) * d.value) / max);
          const x = i * (barW + gap) + gap / 2;
          const y = h - padB - bh;
          const color = d.color || FALLBACK[i % FALLBACK.length];
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={bh} rx={5} fill={color} />
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="11" className="fill-gray-600 dark:fill-gray-300">{d.value}</text>
              <text x={x + barW / 2} y={h - padB + 16} textAnchor="middle" fontSize="10" className="fill-gray-400">
                {truncate(d.label, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({ data, size = 180 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  const r = size / 2, stroke = 26, rad = r - stroke / 2;
  const circ = 2 * Math.PI * rad;
  let offset = 0;
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${r} ${r})`}>
          {data.map((d, i) => {
            const frac = d.value / total;
            const len = frac * circ;
            const color = d.color || FALLBACK[i % FALLBACK.length];
            const el = (
              <circle key={i} cx={r} cy={r} r={rad} fill="none" stroke={color} strokeWidth={stroke}
                strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
            );
            offset += len;
            return el;
          })}
        </g>
        <text x={r} y={r} textAnchor="middle" dominantBaseline="central" fontSize="22" fontWeight="700" className="fill-gray-800 dark:fill-gray-100">{total}</text>
      </svg>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color || FALLBACK[i % FALLBACK.length] }} />
            <span className="text-gray-600 dark:text-gray-300">{d.label}</span>
            <span className="text-gray-400">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Battery({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <Empty />;
  return (
    <div>
      <div className="flex h-6 rounded-full overflow-hidden">
        {data.map((d, i) => d.value > 0 && (
          <div key={i} style={{ width: `${(d.value / total) * 100}%`, backgroundColor: d.color }}
            title={`${d.label}: ${d.value}`} className="flex items-center justify-center text-[10px] text-white font-medium">
            {(d.value / total) > 0.08 ? Math.round((d.value / total) * 100) + '%' : ''}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {data.map((d, i) => (
          <span key={i} className="flex items-center gap-1 text-xs text-gray-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} /> {d.label} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}

function Empty() { return <div className="text-center text-sm text-gray-400 py-6">Brak danych</div>; }
function truncate(s, n) { return (s || '').length > n ? s.slice(0, n) + '…' : s; }

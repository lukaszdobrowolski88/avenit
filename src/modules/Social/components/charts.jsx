import React, { useState } from 'react';
import { tr, appLocale } from '../../../i18n';

// Wykresy analityki Social Media — lekkie SVG bez biblioteki.
// Kolory sprawdzone walidatorem palet (dataviz): seria pojedyncza = musztarda #8A6606 (jasny) /
// #B8860B (ciemny); mapa ciepła = jedna barwa (kurkuma), jaśniej → ciemniej = więcej.
// Tekst zawsze w kolorach tekstu (nie w kolorze serii); siatka włosowa; podpowiedź po najechaniu.

export const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 10000) return new Intl.NumberFormat(appLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  return new Intl.NumberFormat(appLocale()).format(Math.round(v * 10) / 10);
};

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-2.5 py-1.5 text-xs shadow-lg whitespace-nowrap"
      style={{ left: tip.x, top: tip.y - 8 }}>
      <div className="font-semibold">{tip.title}</div>
      {tip.lines.map((l) => <div key={l} className="opacity-80">{l}</div>)}
    </div>
  );
}

// Kolumny (jedna seria): data [{ key, label, value, lines: [] }].
export function ColumnChart({ data, height = 180, valueLabel }) {
  const [tip, setTip] = useState(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const W = 640, H = height, padL = 36, padB = 26, padT = 10;
  const band = (W - padL) / Math.max(1, data.length);
  const bw = Math.min(24, band * 0.6);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={valueLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" className="fill-gray-400 text-[10px] tabular-nums">{fmtNum(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + band * i + band / 2;
          const top = y(d.value);
          const h = Math.max(0, H - padB - top);
          const r = Math.min(4, h);
          // Zaokrąglony koniec danych, prosta podstawa.
          const path = h > 0 ? `M${cx - bw / 2},${H - padB} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${H - padB} Z` : '';
          return (
            <g key={d.key}>
              {path && <path d={path} className="fill-[#8A6606] dark:fill-[#B8860B]" />}
              <rect x={padL + band * i} y={padT} width={band} height={H - padT - padB} fill="transparent"
                onMouseEnter={(e) => {
                  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                  setTip({ x: (cx / W) * box.width, y: (top / H) * box.height, title: d.label, lines: d.lines || [`${fmtNum(d.value)}`] });
                }}
                onMouseLeave={() => setTip(null)} />
              {(data.length <= 14 || i % 2 === 0) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400 text-[10px]">{d.short || d.label}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="stroke-gray-300 dark:stroke-gray-600" strokeWidth="1" />
      </svg>
      <Tooltip tip={tip} />
      <table className="sr-only">
        <caption>{valueLabel}</caption>
        <tbody>{data.map((d) => <tr key={d.key}><th>{d.label}</th><td>{d.value}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// Sparkline (seria pojedyncza, 2 px) z kropką na końcu.
export function Sparkline({ values, width = 120, height = 32 }) {
  const v = (values || []).filter((x) => x != null);
  if (v.length < 2) return null;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * (width - 6) + 3, height - 4 - ((x - min) / span) * (height - 8)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" className="stroke-[#8A6606] dark:stroke-[#B8860B]" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" className="fill-[#8A6606] dark:fill-[#B8860B] stroke-white dark:stroke-gray-800" strokeWidth="2" />
    </svg>
  );
}

// Mapa ciepła: dni (pn–nd) × przedziały 3 h; wartość = średnie interakcje na publikację.
const HEAT_LIGHT = ['#FBF1D2', '#F2D98F', '#E0B24A', '#B8860B', '#8A6606'];
const HEAT_DARK = ['#3A3320', '#5C4C1C', '#8A6606', '#B8860B', '#E0A208'];
export const BUCKETS = ['0–3', '3–6', '6–9', '9–12', '12–15', '15–18', '18–21', '21–24'];
const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];

export function Heatmap({ slots, dark = false }) {
  const [tip, setTip] = useState(null);
  const map = new Map((slots || []).map((s) => [`${s.weekday}:${s.bucket}`, s]));
  const max = Math.max(0, ...(slots || []).map((s) => s.avg_interactions || 0));
  const ramp = dark ? HEAT_DARK : HEAT_LIGHT;
  const color = (v) => (max ? ramp[Math.min(ramp.length - 1, Math.floor((v / max) * (ramp.length - 0.0001)))] : ramp[0]);
  return (
    <div className="relative overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {BUCKETS.map((b) => <th key={b} scope="col" className="text-[10px] font-medium text-gray-400 px-0.5 tabular-nums">{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d, i) => (
            <tr key={d}>
              <th scope="row" className="text-[11px] font-medium text-gray-500 pr-2 text-right">{tr(d)}</th>
              {BUCKETS.map((b, k) => {
                const s = map.get(`${i + 1}:${k}`);
                const label = s ? tr('{d}, {h}: średnio {v} interakcji ({n} publ.)', { d: tr(d), h: b, v: fmtNum(s.avg_interactions), n: s.publications }) : tr('{d}, {h}: brak publikacji', { d: tr(d), h: b });
                return (
                  <td key={b} aria-label={label}
                    onMouseEnter={(e) => {
                      const box = e.currentTarget.closest('.relative').getBoundingClientRect();
                      const r = e.currentTarget.getBoundingClientRect();
                      setTip(s ? { x: r.left - box.left + r.width / 2, y: r.top - box.top, title: `${tr(d)} ${b}`, lines: [tr('średnio {v} interakcji', { v: fmtNum(s.avg_interactions) }), tr('{n} publ.', { n: s.publications })] } : null);
                    }}
                    onMouseLeave={() => setTip(null)}
                    className="w-9 h-7 rounded-[4px]"
                    style={{ background: s ? color(s.avg_interactions) : 'transparent', boxShadow: s ? 'none' : 'inset 0 0 0 1px rgba(127,127,127,0.18)' }} />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <Tooltip tip={tip} />
    </div>
  );
}

export const weekLabel = (ymd) => {
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString(appLocale(), { day: 'numeric', month: 'short' });
};

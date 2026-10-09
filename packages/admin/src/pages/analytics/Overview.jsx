// Przegląd: karty KPI z porównaniem do poprzedniego okresu, wykres ruchu,
// "online teraz" odświeżane co 15 s.
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, formatDuration } from '../../lib/api.js';
import { Card, Stat, Loading, ErrorBox, EmptyState } from '../../components/ui.jsx';
import { Delta } from './common.jsx';

// Kolory wykresu z marki; SVG nie czyta zmiennych CSS z atrybutów, więc tryb ciemny wykrywamy w JS.
function useChartColors() {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const on = (e) => setDark(e.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return dark
    ? { main: '#F3F1EC', second: '#FFBE0B', grid: 'rgba(255,255,255,0.08)', axis: '#A8A49D', tipBg: '#252422', tipBorder: 'rgba(255,255,255,0.12)', text: '#F3F1EC' }
    : { main: '#2A2312', second: '#C99300', grid: '#ECE8DE', axis: '#6E685A', tipBg: '#FFFFFF', tipBorder: '#E6E1D5', text: '#2A2312' };
}

export default function Overview({ filters }) {
  const [d, setD] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [hours, setHours] = useState(null);
  const [online, setOnline] = useState(null);
  const [err, setErr] = useState('');
  const c = useChartColors();

  useEffect(() => {
    let alive = true;
    setD(null); setErr('');
    api.analyticsOverview(filters).then((r) => alive && setD(r)).catch((e) => alive && setErr(e.message));
    api.analyticsFunnel(filters).then((r) => alive && setFunnel(r)).catch(() => {});
    api.analyticsHours(filters).then((r) => alive && setHours(r.cells)).catch(() => {});
    return () => { alive = false; };
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  // Licznik "online teraz" żyje własnym, szybszym rytmem.
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.analyticsRealtime(filters).then((r) => alive && setOnline(r.onlineNow)).catch(() => {});
    tick();
    const t = setInterval(tick, 15_000);
    return () => { alive = false; clearInterval(t); };
  }, [filters.site, filters.tenantId]);

  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;

  const { kpi, prev, series } = d;
  const chartData = series.map((s) => ({
    day: String(s.day).slice(5, 10),
    Odwiedzający: s.visitors,
    Sesje: s.sessions,
    Odsłony: s.pageviews,
  }));

  return (
    <div>
      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
        <Stat label="Odwiedzający" value={kpi.visitors} hint={<Delta now={kpi.visitors} prev={prev.visitors} />} />
        <Stat label="Sesje" value={kpi.sessions} hint={<Delta now={kpi.sessions} prev={prev.sessions} />} />
        <Stat label="Odsłony" value={kpi.pageviews} hint={<Delta now={kpi.pageviews} prev={prev.pageviews} />} />
        <Stat label="Śr. czas wizyty" value={formatDuration(kpi.avgDurationS)} hint={<Delta now={kpi.avgDurationS} prev={prev.avgDurationS} />} />
        <Stat label="Odrzucenia" value={`${kpi.bounceRate}%`} hint={<Delta now={kpi.bounceRate} prev={prev.bounceRate} invert />} />
        <Stat label="Online teraz" icon={<span className="livedot" />} value={online ?? kpi.onlineNow} hint="ostatnie 5 minut" />
      </div>

      <Card title="Ruch w czasie" className="mb">
        {chartData.length === 0 && <EmptyState icon="chart">Brak danych w wybranym okresie.</EmptyState>}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="day" stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke={c.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: 12, fontSize: 13, color: c.text, fontFamily: 'Manrope, sans-serif' }}
                labelStyle={{ color: c.axis, fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'Manrope, sans-serif' }} iconType="circle" iconSize={8} />
              <Area type="monotone" dataKey="Odsłony" stroke={c.second} fill={c.second} fillOpacity={0.12} strokeWidth={1.5} />
              <Area type="monotone" dataKey="Odwiedzający" stroke={c.main} fill={c.main} fillOpacity={0.07} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid2">
        {funnel && <Funnel f={funnel} />}
        {hours && hours.length > 0 && <HoursHeatmap cells={hours} />}
      </div>
    </div>
  );
}

// Lejek konwersji landingu: odwiedzający → kliknięcia CTA → zgłoszenia.
function Funnel({ f }) {
  const steps = [
    { label: 'Odwiedzający stronę', n: f.visitors },
    { label: 'Kliknęli „Umów prezentację”', n: f.ctaClicks },
    { label: 'Wysłali zgłoszenie', n: f.leads },
  ];
  const max = Math.max(1, f.visitors);
  return (
    <Card
      title="Lejek konwersji (strona WWW)"
      subtitle={<>Konwersja <b style={{ color: 'var(--text)' }}>{f.conversionRate}%</b>{f.leadsReturning > 0 && <> · {f.leadsReturning} zgłaszających było na stronie więcej niż raz</>}</>}
    >
      {steps.map((s, i) => (
        <div key={i} className="funnel-step">
          <div className="row row--between small" style={{ marginBottom: 5 }}>
            <span>{s.label}</span><b className="tnum">{s.n}</b>
          </div>
          <div className={`meter${i === steps.length - 1 ? ' meter--accent' : ''}`}>
            <span style={{ width: `${(s.n / max) * 100}%`, minWidth: s.n ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

// Heatmapa aktywności: dzień tygodnia × godzina (czas polski).
const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
function HoursHeatmap({ cells }) {
  const grid = new Map(cells.map((x) => [`${x.dow}-${x.hour}`, x.events]));
  const max = Math.max(1, ...cells.map((x) => x.events));
  return (
    <Card title="Godziny aktywności" subtitle="Dzień tygodnia × godzina, czas polski">
      <div className="heatmap">
        {DAYS.map((day, di) => (
          <React.Fragment key={day}>
            <span className="hm-day">{day}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = grid.get(`${di + 1}-${h}`) || 0;
              return (
                <span
                  key={h} className="hm-cell"
                  style={n ? { background: `color-mix(in srgb, var(--accent) ${Math.round(18 + 82 * (n / max))}%, var(--sunken))` } : undefined}
                  title={`${day} ${h}:00 — ${n} zdarzeń`}
                />
              );
            })}
          </React.Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="hm-hour">{h % 3 === 0 ? h : ''}</span>
        ))}
      </div>
    </Card>
  );
}

// Przegląd: karty KPI z porównaniem do poprzedniego okresu, wykres ruchu,
// "online teraz" odświeżane co 15 s.
import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { api, formatDuration } from '../../lib/api.js';
import { Delta } from './common.jsx';

export default function Overview({ filters }) {
  const [d, setD] = useState(null);
  const [online, setOnline] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setD(null);
    api.analyticsOverview(filters).then((r) => alive && setD(r)).catch((e) => alive && setErr(e.message));
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

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const { kpi, prev, series } = d;
  const chartData = series.map((s) => ({
    day: String(s.day).slice(5, 10),
    Odwiedzający: s.visitors,
    Sesje: s.sessions,
    Odsłony: s.pageviews,
  }));

  return (
    <div>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        <Kpi label="Odwiedzający" value={kpi.visitors} delta={<Delta now={kpi.visitors} prev={prev.visitors} />} />
        <Kpi label="Sesje" value={kpi.sessions} delta={<Delta now={kpi.sessions} prev={prev.sessions} />} />
        <Kpi label="Odsłony" value={kpi.pageviews} delta={<Delta now={kpi.pageviews} prev={prev.pageviews} />} />
        <Kpi label="Śr. czas wizyty" value={formatDuration(kpi.avgDurationS)}
             delta={<Delta now={kpi.avgDurationS} prev={prev.avgDurationS} />} />
        <Kpi label="Współczynnik odrzuceń" value={`${kpi.bounceRate}%`}
             delta={<Delta now={kpi.bounceRate} prev={prev.bounceRate} invert />} />
        <Kpi label="Online teraz" value={online ?? kpi.onlineNow} live />
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ruch w czasie</h3>
        {chartData.length === 0 && <div className="muted">Brak danych w wybranym okresie</div>}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gVis" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="gPv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
              <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Odsłony" stroke="#38bdf8" fill="url(#gPv)" strokeWidth={1.5} />
              <Area type="monotone" dataKey="Odwiedzający" stroke="#f59e0b" fill="url(#gVis)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, live }) {
  return (
    <div className="card">
      <div className="label">{live && <span className="livedot" />}{label}</div>
      <div className="value">{value}</div>
      {delta && <div style={{ marginTop: 4 }}>{delta}</div>}
    </div>
  );
}

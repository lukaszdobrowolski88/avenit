// Filtry analityki (zakres dat, WWW/aplikacja, kościół) trzymane w URL —
// widoki można linkować, a przełączanie zakładek zachowuje wybór.
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86_400_000));

export function useAnalyticsFilters() {
  const [params, setParams] = useSearchParams();
  const filters = {
    from: params.get('from') || daysAgo(29),
    to: params.get('to') || iso(new Date()),
    site: params.get('site') || '',
    tenantId: params.get('tenantId') || '',
  };
  const set = (patch) => {
    const next = { ...filters, ...patch };
    const out = {};
    for (const [k, v] of Object.entries(next)) if (v) out[k] = v;
    setParams(out, { replace: true });
  };
  return [filters, set];
}

const PRESETS = [
  { label: 'Dziś', days: 0 },
  { label: '7 dni', days: 6 },
  { label: '30 dni', days: 29 },
  { label: '90 dni', days: 89 },
];

export function FilterBar({ filters, set }) {
  const [tenants, setTenants] = useState([]);
  useEffect(() => {
    api.tenants().then((r) => setTenants(r.tenants || [])).catch(() => {});
  }, []);

  const activePreset = PRESETS.find(
    (p) => filters.from === daysAgo(p.days) && filters.to === iso(new Date())
  );

  return (
    <div className="anafilters">
      <div className="row" style={{ gap: 6 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            className={activePreset?.label === p.label ? '' : 'ghost'}
            onClick={() => set({ from: daysAgo(p.days), to: iso(new Date()) })}
          >
            {p.label}
          </button>
        ))}
        <input
          type="date" value={filters.from} style={{ width: 145 }}
          onChange={(e) => e.target.value && set({ from: e.target.value })}
        />
        <span className="muted">–</span>
        <input
          type="date" value={filters.to} style={{ width: 145 }}
          onChange={(e) => e.target.value && set({ to: e.target.value })}
        />
      </div>
      <div className="row" style={{ gap: 6 }}>
        {[['', 'Wszystko'], ['landing', 'Strona WWW'], ['app', 'Aplikacja']].map(([v, label]) => (
          <button key={v} className={filters.site === v ? '' : 'ghost'} onClick={() => set({ site: v })}>
            {label}
          </button>
        ))}
        <select
          value={filters.tenantId} style={{ width: 200 }}
          onChange={(e) => set({ tenantId: e.target.value })}
        >
          <option value="">Wszystkie kościoły</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.subdomain})</option>
          ))}
        </select>
      </div>
    </div>
  );
}

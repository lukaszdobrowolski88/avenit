// Geografia: kraje i miasta (z rollupów; geo z darmowych baz GeoIP).
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable, flag } from './common.jsx';

export default function Geo({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsGeo(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const cols = [
    { key: 'sessions', label: 'Sesje' },
    { key: 'visitors', label: 'Odwiedzający' },
  ];

  return (
    <div className="grid2">
      <RankTable
        title="Kraje" rows={d.countries} nameLabel="Kraj" columns={cols}
        nameRender={(r) => <>{flag(r.country)} {r.country}</>}
        emptyText="Brak danych geo — bazy GeoIP dogrywają się przy pierwszym starcie workera."
      />
      <RankTable
        title="Miasta" rows={d.cities} nameLabel="Miasto" columns={cols}
        nameRender={(r) => <>{flag(r.country)} {r.city}</>}
        emptyText="Brak danych."
      />
    </div>
  );
}

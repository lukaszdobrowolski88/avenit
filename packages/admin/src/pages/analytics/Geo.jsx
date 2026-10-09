// Geografia: kraje i miasta (z rollupów; geo z darmowych baz GeoIP).
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable, flag, countryName } from './common.jsx';
import { ErrorBox, Loading } from '../../components/ui.jsx';

export default function Geo({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsGeo(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;

  const cols = [
    { key: 'sessions', label: 'Sesje' },
    { key: 'visitors', label: 'Odwiedzający' },
  ];

  return (
    <div className="grid2">
      <RankTable
        title="Kraje" rows={d.countries} nameLabel="Kraj" columns={cols}
        nameRender={(r) => <>{flag(r.country)}{countryName(r.country)}</>}
        emptyText="Brak danych geo — bazy GeoIP dogrywają się przy pierwszym starcie workera."
      />
      <RankTable
        title="Miasta" rows={d.cities} nameLabel="Miasto" columns={cols}
        nameRender={(r) => <>{flag(r.country)}{r.city}</>}
        emptyText="Brak danych."
      />
    </div>
  );
}

// Urządzenia: typ, przeglądarka, system (z rollupów).
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable, deviceIcon } from './common.jsx';

const TYPE_LABELS = { desktop: 'Komputer', mobile: 'Telefon', tablet: 'Tablet' };

export default function Devices({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsDevices(filters).then(setD).catch((e) => setErr(e.message));
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
        title="Typ urządzenia" rows={d.deviceTypes} nameLabel="Typ" columns={cols}
        nameRender={(r) => <>{deviceIcon(r.name)} {TYPE_LABELS[r.name] || r.name}</>}
      />
      <RankTable title="Przeglądarki" rows={d.browsers} nameLabel="Przeglądarka" columns={cols} />
      <RankTable title="Systemy operacyjne" rows={d.os} nameLabel="System" columns={cols} />
    </div>
  );
}

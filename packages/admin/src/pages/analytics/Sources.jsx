// Źródła ruchu: referrery + kampanie UTM (z rollupów dziennych).
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable } from './common.jsx';

export default function Sources({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsSources(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const cols = [
    { key: 'sessions', label: 'Sesje' },
    { key: 'visitors', label: 'Odwiedzający' },
  ];
  const referrers = [
    ...(d.directSessions ? [{ name: 'Bezpośrednie / wpisany adres', sessions: d.directSessions, visitors: null }] : []),
    ...d.referrers,
  ];

  return (
    <div className="grid2">
      <RankTable title="Witryny odsyłające" rows={referrers} nameLabel="Źródło" columns={cols} />
      <RankTable title="Kampanie (utm_source)" rows={d.utmSources} nameLabel="utm_source" columns={cols}
        emptyText="Brak ruchu z kampanii — dodawaj ?utm_source=… do linków w mailingach i socialach." />
      <RankTable title="Medium (utm_medium)" rows={d.utmMediums} nameLabel="utm_medium" columns={cols} />
      <RankTable title="Kampania (utm_campaign)" rows={d.utmCampaigns} nameLabel="utm_campaign" columns={cols} />
    </div>
  );
}

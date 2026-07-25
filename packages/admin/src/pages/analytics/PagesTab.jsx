// Strony: ranking ścieżek z odsłonami, wejściami, wyjściami i śr. czasem.
import React, { useEffect, useState } from 'react';
import { api, formatDuration } from '../../lib/api.js';
import { RankTable } from './common.jsx';

export default function PagesTab({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsPages(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  return (
    <RankTable
      title={null}
      rows={d.pages}
      nameLabel="Ścieżka"
      nameRender={(r) => <code style={{ fontSize: 13 }}>{r.path}</code>}
      columns={[
        { key: 'pageviews', label: 'Odsłony' },
        { key: 'visitors', label: 'Odwiedzający' },
        { key: 'entries', label: 'Wejścia' },
        { key: 'exits', label: 'Wyjścia' },
        { key: 'avgDurationS', label: 'Śr. czas', fmt: formatDuration },
      ]}
      emptyText="Brak odsłon w wybranym okresie."
    />
  );
}

// Źródła ruchu: referrery + kampanie UTM (z rollupów dziennych) + generator linków.
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable } from './common.jsx';

// Generator linków UTM — kampanie z maili/socjali od razu widoczne w statystykach.
function UtmBuilder() {
  const [f, setF] = useState({ url: 'https://avenit.pl/', source: '', medium: '', campaign: '' });
  const [copied, setCopied] = useState(false);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setCopied(false); };
  let link = '';
  try {
    const u = new URL(f.url);
    if (f.source) u.searchParams.set('utm_source', f.source);
    if (f.medium) u.searchParams.set('utm_medium', f.medium);
    if (f.campaign) u.searchParams.set('utm_campaign', f.campaign);
    link = u.toString();
  } catch { link = ''; }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 4 }}>Generator linków UTM</h3>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Użyj tego linku w mailingu, na Facebooku czy w ogłoszeniu — kampania pojawi się w tabelach obok.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input style={{ flex: '2 1 220px' }} placeholder="URL" value={f.url} onChange={set('url')} />
        <input style={{ flex: '1 1 120px' }} placeholder="source (np. facebook)" value={f.source} onChange={set('source')} />
        <input style={{ flex: '1 1 120px' }} placeholder="medium (np. social)" value={f.medium} onChange={set('medium')} />
        <input style={{ flex: '1 1 120px' }} placeholder="campaign (np. wiosna)" value={f.campaign} onChange={set('campaign')} />
      </div>
      {link && (f.source || f.medium || f.campaign) && (
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          <code style={{ flex: 1, overflow: 'auto', whiteSpace: 'nowrap', padding: '8px 10px' }}>{link}</code>
          <button className="ghost" onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>
            {copied ? 'Skopiowano ✓' : 'Kopiuj'}
          </button>
        </div>
      )}
    </div>
  );
}

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
      <UtmBuilder />
      <RankTable title="Kampanie (utm_source)" rows={d.utmSources} nameLabel="utm_source" columns={cols}
        emptyText="Brak ruchu z kampanii — dodawaj ?utm_source=… do linków w mailingach i socialach." />
      <RankTable title="Medium (utm_medium)" rows={d.utmMediums} nameLabel="utm_medium" columns={cols} />
      <RankTable title="Kampania (utm_campaign)" rows={d.utmCampaigns} nameLabel="utm_campaign" columns={cols} />
    </div>
  );
}

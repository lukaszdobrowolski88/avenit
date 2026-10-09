// Źródła ruchu: referrery + kampanie UTM (z rollupów dziennych) + generator linków.
import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { RankTable } from './common.jsx';
import { ErrorBox, Loading, Card, Field, Button } from '../../components/ui.jsx';

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
    <Card title="Generator linków UTM" subtitle="Użyj linku w mailingu, na Facebooku czy w ogłoszeniu — kampania pojawi się w tabelach obok.">
      <div className="field-row">
        <Field label="Adres"><input value={f.url} onChange={set('url')} /></Field>
        <Field label="utm_source"><input placeholder="np. facebook" value={f.source} onChange={set('source')} /></Field>
        <Field label="utm_medium"><input placeholder="np. social" value={f.medium} onChange={set('medium')} /></Field>
        <Field label="utm_campaign"><input placeholder="np. wiosna" value={f.campaign} onChange={set('campaign')} /></Field>
      </div>
      {link && (f.source || f.medium || f.campaign) && (
        <div className="row">
          <code style={{ flex: 1, overflow: 'auto', whiteSpace: 'nowrap', padding: '8px 10px', borderRadius: 10 }}>{link}</code>
          <Button icon={copied ? 'check' : 'copy'} onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); }}>
            {copied ? 'Skopiowano' : 'Kopiuj'}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default function Sources({ filters }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsSources(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;

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

import React, { useEffect, useState } from 'react';
import { api, formatBytes } from '../lib/api.js';
import { PageHeader, Button, Stat, Table, Loading, ErrorBox, Badge } from '../components/ui.jsx';

export default function System() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => { setBusy(true); setErr(''); return api.system().then(setS).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { load(); }, []);

  const header = (
    <PageHeader
      title="System"
      subtitle={s ? `Czas serwera: ${new Date(s.serverTime).toLocaleString('pl-PL')}` : 'Bazy danych i stan serwera.'}
      actions={<Button icon="refresh" onClick={load} loading={busy}>Odśwież</Button>}
    />
  );
  if (err) return <>{header}<ErrorBox error={err} onRetry={load} /></>;
  if (!s) return <>{header}<Loading /></>;

  const maxSize = Math.max(1, ...s.databases.map((d) => d.sizeBytes));

  return (
    <div>
      {header}
      <div className="stats">
        <Stat label="PostgreSQL" value={s.postgresVersion} small />
        <Stat label="Bazy danych" value={s.databases.length} />
        <Stat label="Rozmiar baz" value={formatBytes(s.totalDbBytes)} />
        <Stat label="Kościoły" value={s.tenants} />
        <Stat label="Administratorzy" value={s.admins} />
      </div>

      <Table minWidth={560}>
        <thead><tr><th>Baza</th><th style={{ width: '45%' }}>Udział</th><th className="num">Rozmiar</th></tr></thead>
        <tbody>
          {s.databases.map((db) => (
            <tr key={db.name}>
              <td className="mono" style={{ color: 'var(--text)' }}>{db.name} {db.name === 'avenit_platform' && <Badge size="sm" tone="accent">platforma</Badge>}</td>
              <td>
                <div className={`meter${db.name === 'avenit_platform' ? ' meter--accent' : ''}`} style={{ maxWidth: 320 }}>
                  <span style={{ width: `${(db.sizeBytes / maxSize) * 100}%` }} />
                </div>
              </td>
              <td className="num">{formatBytes(db.sizeBytes)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

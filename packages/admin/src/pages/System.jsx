import React, { useEffect, useState } from 'react';
import { api, formatBytes } from '../lib/api.js';

export default function System() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.system().then(setS).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return <div className="err">{err}</div>;
  if (!s) return <div>Ładowanie…</div>;

  const maxSize = Math.max(1, ...s.databases.map((d) => d.sizeBytes));

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">System</h1>
        <button className="ghost" onClick={load}>Odśwież</button>
      </div>

      <div className="cards">
        <div className="card"><div className="label">PostgreSQL</div><div className="value" style={{ fontSize: 20 }}>{s.postgresVersion}</div></div>
        <div className="card"><div className="label">Bazy danych</div><div className="value">{s.databases.length}</div></div>
        <div className="card"><div className="label">Rozmiar baz (łącznie)</div><div className="value" style={{ fontSize: 20 }}>{formatBytes(s.totalDbBytes)}</div></div>
        <div className="card"><div className="label">Tenanci</div><div className="value">{s.tenants}</div></div>
        <div className="card"><div className="label">Administratorzy</div><div className="value">{s.admins}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Rozmiar baz danych</h3>
        <table>
          <thead><tr><th>Baza</th><th style={{ width: '50%' }}>Rozmiar</th><th style={{ textAlign: 'right' }}></th></tr></thead>
          <tbody>
            {s.databases.map((db) => (
              <tr key={db.name}>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{db.name}</td>
                <td>
                  <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden', maxWidth: 320 }}>
                    <div style={{ width: `${(db.sizeBytes / maxSize) * 100}%`, height: '100%', background: db.name === 'avenit_platform' ? 'var(--accent2)' : 'var(--accent)', borderRadius: 4 }} />
                  </div>
                </td>
                <td style={{ textAlign: 'right' }} className="muted">{formatBytes(db.sizeBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Czas serwera: {new Date(s.serverTime).toLocaleString('pl-PL')}</p>
    </div>
  );
}

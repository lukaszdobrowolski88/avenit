// Kościoły: która wspólnota jak intensywnie używa aplikacji i jakich modułów.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fmtWhen } from './common.jsx';

export default function TenantsActivity({ filters }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsTenants(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Kościół</th><th>Status</th>
          <th style={{ textAlign: 'right' }}>Aktywni użytkownicy</th>
          <th style={{ textAlign: 'right' }}>Sesje</th>
          <th style={{ textAlign: 'right' }}>Odsłony</th>
          <th>Najczęstsze moduły</th><th>Ostatnia aktywność</th>
        </tr>
      </thead>
      <tbody>
        {d.tenants.map((t) => (
          <tr key={t.tenantId} className="clickable" onClick={() => navigate(`/tenants/${t.tenantId}`)}>
            <td><b>{t.name}</b> <span className="muted">({t.subdomain})</span></td>
            <td><span className={`badge ${t.status}`}>{t.status}</span></td>
            <td style={{ textAlign: 'right' }}>{t.activeUsers}</td>
            <td style={{ textAlign: 'right' }}>{t.sessions}</td>
            <td style={{ textAlign: 'right' }}>{t.pageviews}</td>
            <td className="muted">
              {t.topModules.length ? t.topModules.map((m) => `${m.module} (${m.n})`).join(', ') : '—'}
            </td>
            <td className="muted">{fmtWhen(t.lastActivityAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

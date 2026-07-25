// Na żywo: kto jest teraz na stronie/w aplikacji (ostatnie 5 minut, poll 10 s).
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { IdentityBadge, flag, deviceIcon } from './common.jsx';

export default function Live({ filters }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api.analyticsRealtime(filters).then((r) => alive && setD(r)).catch((e) => alive && setErr(e.message));
    tick();
    const t = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [filters.site, filters.tenantId]);

  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="livedot" style={{ width: 10, height: 10 }} />
        <span style={{ fontSize: 22, fontWeight: 700 }}>{d.onlineNow}</span>
        <span className="muted">osób aktywnych w ciągu ostatnich 5 minut (odświeżanie co 10 s)</span>
      </div>
      {d.active.length === 0 && <div className="muted">Nikogo nie ma teraz na stronie ani w aplikacji.</div>}
      {d.active.length > 0 && (
        <table>
          <thead>
            <tr><th>Kto</th><th>Gdzie jest teraz</th><th>Miejsce</th><th>Lokalizacja</th><th>Urządzenie</th><th>Ostatnia aktywność</th></tr>
          </thead>
          <tbody>
            {d.active.map((v) => (
              <tr key={v.visitorId} className="clickable" onClick={() => navigate({ pathname: `../visitors/${v.visitorId}`, search })}>
                <td><IdentityBadge v={v} /></td>
                <td><code style={{ fontSize: 13 }}>{v.path || '—'}</code></td>
                <td>{v.site === 'landing' ? 'Strona WWW' : `Aplikacja${v.tenantName ? ` · ${v.tenantName}` : ''}`}</td>
                <td>{flag(v.country)} {v.city || v.country || '—'}</td>
                <td>{deviceIcon(v.deviceType)}</td>
                <td className="muted">
                  {new Date(v.lastSeenAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

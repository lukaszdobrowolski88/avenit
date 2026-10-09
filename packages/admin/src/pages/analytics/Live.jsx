// Na żywo: kto jest teraz na stronie/w aplikacji (ostatnie 5 minut, poll 10 s).
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Card, Table, TR, ErrorBox, Loading, EmptyState } from '../../components/ui.jsx';
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

  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;

  return (
    <div>
      <Card className="mb">
        <div className="row" style={{ gap: 12 }}>
          <span className="livedot" style={{ width: 10, height: 10 }} />
          <span className="tnum" style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{d.onlineNow}</span>
          <span className="muted">osób aktywnych w ciągu ostatnich 5 minut · odświeżanie co 10 s</span>
        </div>
      </Card>
      {d.active.length === 0 ? (
        <Card><EmptyState icon="globe" title="Cisza">Nikogo nie ma teraz na stronie ani w aplikacji.</EmptyState></Card>
      ) : (
        <Table minWidth={780}>
          <thead>
            <tr><th>Kto</th><th>Gdzie jest teraz</th><th>Miejsce</th><th>Lokalizacja</th><th>Urządzenie</th><th>Ostatnio</th></tr>
          </thead>
          <tbody>
            {d.active.map((v) => (
              <TR key={v.visitorId} onClick={() => navigate({ pathname: `../visitors/${v.visitorId}`, search })}>
                <td><IdentityBadge v={v} /></td>
                <td><code>{v.path || '—'}</code></td>
                <td>{v.site === 'landing' ? 'Strona WWW' : `Aplikacja${v.tenantName ? ` · ${v.tenantName}` : ''}`}</td>
                <td className="nowrap">{flag(v.country)}{v.city || v.country || ''}</td>
                <td>{deviceIcon(v.deviceType)}</td>
                <td className="muted tnum">
                  {new Date(v.lastSeenAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </td>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

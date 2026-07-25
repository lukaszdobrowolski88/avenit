// Odwiedzający — feed w stylu bazo.io: kto (tożsamość/organizacja), skąd,
// na czym, ile sesji, ostatnio widziana strona. Klik → pełna oś czasu.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { IdentityBadge, flag, deviceIcon, fmtWhen } from './common.jsx';

async function exportCsv(what, filters) {
  try {
    const { blob, name } = await api.analyticsExportCsv({ ...filters, what });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`Eksport nieudany: ${e.message}`);
  }
}

export default function Visitors({ filters }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { setPage(1); }, [q, filters.from, filters.to, filters.site, filters.tenantId]);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api.analyticsVisitors({ ...filters, q, page })
        .then((r) => alive && setD(r))
        .catch((e) => alive && setErr(e.message));
    }, q ? 300 : 0); // debounce szukajki
    return () => { alive = false; clearTimeout(t); };
  }, [q, page, filters.from, filters.to, filters.site, filters.tenantId]);

  if (err) return <div className="err">{err}</div>;

  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  return (
    <div>
      <div className="toolbar">
        <input
          placeholder="Szukaj: imię, e-mail, organizacja, miasto…"
          value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }}
        />
        <div className="row">
          <span className="muted">{d ? `${d.total} odwiedzających` : ''}</span>
          <button className="ghost" onClick={() => exportCsv('visitors', filters)}>Eksport CSV</button>
        </div>
      </div>
      {!d && <div>Ładowanie…</div>}
      {d && d.visitors.length === 0 && <div className="muted">Brak odwiedzających w wybranym okresie.</div>}
      {d && d.visitors.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Kto</th><th>Lokalizacja</th><th>Urządzenie</th>
              <th style={{ textAlign: 'right' }}>Sesje</th>
              <th style={{ textAlign: 'right' }}>Odsłony</th>
              <th>Ostatnia strona</th><th>Ostatnio</th>
            </tr>
          </thead>
          <tbody>
            {d.visitors.map((v) => (
              <tr
                key={v.id} className="clickable"
                onClick={() => navigate({ pathname: v.id, search })}
              >
                <td>
                  <IdentityBadge v={v} />
                  {v.hasLead && <span className="leadbadge" title="Wysłał(a) zgłoszenie z formularza">📩 zgłoszenie</span>}
                </td>
                <td>{flag(v.country)} {v.city || v.country || '—'}</td>
                <td>{deviceIcon(v.deviceType)} {v.browser || '—'}{v.os ? ` · ${v.os}` : ''}</td>
                <td style={{ textAlign: 'right' }}>{v.sessionsCount}</td>
                <td style={{ textAlign: 'right' }}>{v.pageviewsCount}</td>
                <td className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.lastPath || '—'}
                </td>
                <td className="muted">{fmtWhen(v.lastSeen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Poprzednia</button>
          <span className="muted">{page} / {pages}</span>
          <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Następna ›</button>
        </div>
      )}
    </div>
  );
}

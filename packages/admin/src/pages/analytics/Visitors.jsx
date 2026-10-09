// Odwiedzający — feed w stylu bazo.io: kto (tożsamość/organizacja), skąd,
// na czym, ile sesji, ostatnio widziana strona. Klik → pełna oś czasu.
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Button, Badge, Table, TR, EmptyRow, SearchInput, ErrorBox, Loading } from '../../components/ui.jsx';
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

  if (err) return <ErrorBox error={err} />;

  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  return (
    <div>
      <div className="toolbar">
        <SearchInput className="grow" value={q} onChange={setQ} placeholder="Szukaj: imię, e-mail, organizacja, miasto…" />
        <div className="row">
          {d && <span className="muted small tnum">{d.total} odwiedzających</span>}
          <Button icon="download" onClick={() => exportCsv('visitors', filters)}>Eksport CSV</Button>
        </div>
      </div>
      {!d ? <Loading /> : (
        <Table minWidth={860}>
          <thead>
            <tr>
              <th>Kto</th><th>Lokalizacja</th><th>Urządzenie</th>
              <th className="num">Sesje</th><th className="num">Odsłony</th>
              <th>Ostatnia strona</th><th>Ostatnio</th>
            </tr>
          </thead>
          <tbody>
            {d.visitors.length === 0 && <EmptyRow colSpan={7}>Brak odwiedzających w wybranym okresie.</EmptyRow>}
            {d.visitors.map((v) => (
              <TR key={v.id} onClick={() => navigate({ pathname: v.id, search })}>
                <td>
                  <IdentityBadge v={v} />
                  {v.hasLead && <> <Badge tone="success" size="sm" title="Wysłał(a) zgłoszenie z formularza">zgłoszenie</Badge></>}
                </td>
                <td className="nowrap">{flag(v.country)}{v.city || v.country || ''}</td>
                <td className="nowrap">{deviceIcon(v.deviceType)}{v.browser || ''}{v.os ? ` · ${v.os}` : ''}</td>
                <td className="num">{v.sessionsCount}</td>
                <td className="num">{v.pageviewsCount}</td>
                <td className="muted mono small" style={{ maxWidth: 220 }}><span className="ellipsis" style={{ display: 'block' }}>{v.lastPath || ''}</span></td>
                <td className="muted tnum nowrap">{fmtWhen(v.lastSeen)}</td>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <Button variant="ghost" icon="chevronLeft" disabled={page <= 1} onClick={() => setPage(page - 1)}>Poprzednia</Button>
          <span className="muted small tnum">{page} / {pages}</span>
          <Button variant="ghost" iconRight="chevronRight" disabled={page >= pages} onClick={() => setPage(page + 1)}>Następna</Button>
        </div>
      )}
    </div>
  );
}

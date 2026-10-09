// Kościoły: która wspólnota jak intensywnie używa aplikacji i jakich modułów.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { Table, TR, EmptyRow, StatusBadge, ErrorBox, Loading } from '../../components/ui.jsx';
import { fmtWhen } from './common.jsx';

export default function TenantsActivity({ filters }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setD(null);
    api.analyticsTenants(filters).then(setD).catch((e) => setErr(e.message));
  }, [filters.from, filters.to]);

  if (err) return <ErrorBox error={err} />;
  if (!d) return <Loading />;

  return (
    <Table minWidth={860}>
      <thead>
        <tr>
          <th>Kościół</th><th>Status</th>
          <th className="num">Aktywni użytkownicy</th><th className="num">Sesje</th><th className="num">Odsłony</th>
          <th>Najczęstsze moduły</th><th>Ostatnio</th>
        </tr>
      </thead>
      <tbody>
        {d.tenants.length === 0 && <EmptyRow colSpan={7}>Brak aktywności w wybranym okresie.</EmptyRow>}
        {d.tenants.map((t) => (
          <TR key={t.tenantId} onClick={() => navigate(`/tenants/${t.tenantId}`)}>
            <td><span className="primary-cell">{t.name}</span><span className="sub">{t.subdomain}</span></td>
            <td><StatusBadge status={t.status} /></td>
            <td className="num">{t.activeUsers}</td>
            <td className="num">{t.sessions}</td>
            <td className="num">{t.pageviews}</td>
            <td className="muted small">{t.topModules.map((m) => `${m.module} (${m.n})`).join(', ')}</td>
            <td className="muted tnum nowrap">{fmtWhen(t.lastActivityAt)}</td>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

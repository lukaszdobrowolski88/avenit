import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { PageHeader, Button, Table, EmptyRow, Loading, ErrorBox } from '../components/ui.jsx';

const EMPTY = { action: '', admin: '', since: '' };

export default function Audit() {
  const [entries, setEntries] = useState(null);
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState(EMPTY);
  const [err, setErr] = useState('');

  const load = (f = filters) => {
    const params = {};
    if (f.action) params.action = f.action;
    if (f.admin) params.admin = f.admin;
    if (f.since) params.since = f.since;
    setErr('');
    api.auditFiltered(params).then((r) => { setEntries(r.entries); if (r.actions) setActions(r.actions); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);
  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const active = filters.action || filters.admin || filters.since;

  return (
    <div>
      <PageHeader title="Log audytu" subtitle="Każda zmiana wykonana w panelu platformy." />
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); load(); }} style={{ justifyContent: 'flex-start' }}>
        <select value={filters.action} onChange={(e) => set('action', e.target.value)} style={{ width: 220 }} aria-label="Akcja">
          <option value="">Wszystkie akcje</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input placeholder="Administrator (e-mail)" value={filters.admin} onChange={(e) => set('admin', e.target.value)} style={{ width: 220 }} aria-label="Administrator" />
        <input type="date" value={filters.since} onChange={(e) => set('since', e.target.value)} style={{ width: 160 }} aria-label="Od dnia" />
        <Button type="submit" variant="primary">Filtruj</Button>
        {active && <Button variant="ghost" onClick={() => { setFilters(EMPTY); load(EMPTY); }}>Wyczyść</Button>}
      </form>
      <ErrorBox error={err} onRetry={() => load()} />
      {!entries && !err ? <Loading /> : (
        <Table tall minWidth={760}>
          <thead><tr><th>Data</th><th>Administrator</th><th>Akcja</th><th>Cel</th><th>Szczegóły</th></tr></thead>
          <tbody>
            {(entries || []).length === 0 && <EmptyRow colSpan={5}>Brak wpisów</EmptyRow>}
            {(entries || []).map((e) => {
              const details = e.details ? JSON.stringify(e.details) : '';
              return (
                <tr key={e.id}>
                  <td className="muted tnum nowrap">{new Date(e.created_at).toLocaleString('pl-PL')}</td>
                  <td>{e.admin_email || ''}</td>
                  <td><span className="code-chip">{e.action}</span></td>
                  <td className="muted mono small">{e.target_type ? `${e.target_type}:${e.target_id?.slice(0, 8) || ''}` : ''}</td>
                  <td className="muted mono small" style={{ maxWidth: 320 }} title={details}><span className="ellipsis" style={{ display: 'block' }}>{details}</span></td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

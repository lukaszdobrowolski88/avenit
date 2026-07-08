import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Audit() {
  const [entries, setEntries] = useState([]);
  const [actions, setActions] = useState([]);
  const [filters, setFilters] = useState({ action: '', admin: '', since: '' });

  const load = () => {
    const params = {};
    if (filters.action) params.action = filters.action;
    if (filters.admin) params.admin = filters.admin;
    if (filters.since) params.since = filters.since;
    api.auditFiltered(params).then((r) => { setEntries(r.entries); if (r.actions) setActions(r.actions); });
  };
  useEffect(() => { load(); }, []);
  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <h1 className="h1">Log audytu</h1>
      <div className="row" style={{ gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filters.action} onChange={(e) => set('action', e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Wszystkie akcje</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input placeholder="Administrator (e-mail)" value={filters.admin} onChange={(e) => set('admin', e.target.value)} style={{ maxWidth: 220 }} />
        <input type="date" value={filters.since} onChange={(e) => set('since', e.target.value)} style={{ maxWidth: 170 }} />
        <button onClick={load}>Filtruj</button>
        {(filters.action || filters.admin || filters.since) && (
          <button className="ghost" onClick={() => { setFilters({ action: '', admin: '', since: '' }); setTimeout(load, 0); }}>Wyczyść</button>
        )}
      </div>
      <table>
        <thead><tr><th>Data</th><th>Administrator</th><th>Akcja</th><th>Cel</th><th>Szczegóły</th></tr></thead>
        <tbody>
          {entries.length === 0 && <tr><td colSpan={5} className="muted">Brak wpisów</td></tr>}
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="muted">{new Date(e.created_at).toLocaleString('pl-PL')}</td>
              <td>{e.admin_email || '—'}</td>
              <td><b>{e.action}</b></td>
              <td className="muted">{e.target_type ? `${e.target_type}:${e.target_id?.slice(0, 8) || ''}` : '—'}</td>
              <td className="muted" style={{ fontSize: 12 }}>{e.details ? JSON.stringify(e.details).slice(0, 60) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

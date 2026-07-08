import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export default function Audit() {
  const [entries, setEntries] = useState([]);
  useEffect(() => { api.audit().then((r) => setEntries(r.entries)); }, []);
  return (
    <div>
      <h1 className="h1">Log audytu</h1>
      <table>
        <thead><tr><th>Data</th><th>Administrator</th><th>Akcja</th><th>Cel</th><th>Szczegóły</th></tr></thead>
        <tbody>
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

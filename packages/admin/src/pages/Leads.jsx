import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Zgłoszenia z formularza na avenit.pl (landing_leads).
export const LEAD_LABELS = {
  new: 'Nowe', contacted: 'W kontakcie', converted: 'Pozyskane', rejected: 'Odrzucone',
};

export default function Leads({ onCountsChange }) {
  const [leads, setLeads] = useState([]);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [err, setErr] = useState('');

  const load = (status = filter) =>
    api.landingLeads(status)
      .then((r) => { setLeads(r.leads); setCounts(r.counts); onCountsChange?.(r.counts); })
      .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [filter]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const act = async (fn) => { setErr(''); try { await fn(); await load(); } catch (e) { setErr(e.message); } };

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Zgłoszenia</h1>
      </div>
      <div className="row" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button className={filter === '' ? '' : 'ghost'} onClick={() => setFilter('')}>Wszystkie ({total})</button>
        {Object.entries(LEAD_LABELS).map(([k, label]) => (
          <button key={k} className={filter === k ? '' : 'ghost'} onClick={() => setFilter(k)}>
            {label} ({counts[k] || 0})
          </button>
        ))}
      </div>
      {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}
      <table>
        <thead><tr><th>Data</th><th>Zgłaszający</th><th>Kościół</th><th>Wiadomość</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('pl-PL')}</td>
              <td>
                <div style={{ fontWeight: 600 }}>{l.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  <a href={`mailto:${l.email}`}>{l.email}</a>{l.phone ? ` · ${l.phone}` : ''}
                </div>
              </td>
              <td>{l.church || <span className="muted">—</span>}</td>
              <td style={{ maxWidth: 340 }}>
                {l.message ? (
                  <span style={{ cursor: 'pointer' }} title="Kliknij, aby rozwinąć" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    {expanded === l.id || l.message.length <= 90 ? l.message : `${l.message.slice(0, 90)}…`}
                  </span>
                ) : <span className="muted">—</span>}
              </td>
              <td><span className={`badge lead-${l.status}`}>{LEAD_LABELS[l.status] || l.status}</span></td>
              <td className="row" style={{ whiteSpace: 'nowrap' }}>
                <select
                  value={l.status}
                  onChange={(e) => act(() => api.updateLead(l.id, { status: e.target.value }))}
                  style={{ width: 'auto' }}
                >
                  {Object.entries(LEAD_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <button
                  className="danger"
                  onClick={() => window.confirm(`Usunąć zgłoszenie od „${l.name}"?`) && act(() => api.deleteLead(l.id))}
                >
                  Usuń
                </button>
              </td>
            </tr>
          ))}
          {!leads.length && (
            <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 28 }}>
              Brak zgłoszeń{filter ? ` o statusie „${LEAD_LABELS[filter]}"` : ''} — pojawią się tu wysłane z formularza na avenit.pl.
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

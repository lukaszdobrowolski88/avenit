// Wspólne drobiazgi sekcji Analityka: badge tożsamości, flagi, tabele rankingowe.
import React from 'react';

// ISO 3166 alpha-2 → emoji flagi (bez bibliotek).
export const flag = (iso) =>
  iso && /^[A-Za-z]{2}$/.test(iso)
    ? String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
    : '🌐';

export const deviceIcon = (t) => (t === 'mobile' ? '📱' : t === 'tablet' ? '📱' : '💻');

export const fmtWhen = (ts) =>
  ts ? new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Drabinka identyfikacji (styl bazo.io): user → kościół → organizacja → rDNS → anonim.
export function IdentityBadge({ v }) {
  if (v.userName || v.userEmail) {
    return (
      <span className="idbadge user" title={v.userEmail || ''}>
        {v.userName || v.userEmail}
        {v.tenantName ? <span className="muted"> — {v.tenantName}</span> : null}
      </span>
    );
  }
  if (v.tenantName) return <span className="idbadge tenant">{v.tenantName}</span>;
  if (v.orgName) return <span className="idbadge org" title="Organizacja z ASN">{v.orgName}</span>;
  if (v.rdnsHost) return <span className="idbadge org" title="Reverse DNS">{v.rdnsHost}</span>;
  return <span className="idbadge anon">Anonimowy</span>;
}

// Tabela rankingowa z proporcjonalnym paskiem (strony, źródła, geo, urządzenia).
export function RankTable({ title, rows, nameLabel, nameRender, columns, emptyText = 'Brak danych' }) {
  const max = Math.max(1, ...rows.map((r) => r[columns[0].key] || 0));
  return (
    <div className="card">
      {title && <h3 style={{ marginTop: 0, marginBottom: 12 }}>{title}</h3>}
      {rows.length === 0 && <div className="muted">{emptyText}</div>}
      {rows.length > 0 && (
        <table className="ranktable">
          <thead>
            <tr>
              <th>{nameLabel}</th>
              {columns.map((c) => <th key={c.key} style={{ textAlign: 'right', width: 90 }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ position: 'relative' }}>
                  <div className="rankbar" style={{ width: `${((r[columns[0].key] || 0) / max) * 100}%` }} />
                  <span style={{ position: 'relative' }}>{nameRender ? nameRender(r) : r.name || '—'}</span>
                </td>
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: 'right' }}>
                    {r[c.key] == null ? '—' : c.fmt ? c.fmt(r[c.key]) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Zmiana vs poprzedni okres przy kartach KPI.
export function Delta({ now, prev, invert = false }) {
  if (!prev) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (!isFinite(pct) || pct === 0) return <span className="delta muted">±0%</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

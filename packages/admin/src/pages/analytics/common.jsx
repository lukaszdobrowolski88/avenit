// Wspólne drobiazgi sekcji Analityka: badge tożsamości, kraj, urządzenie, tabele rankingowe.
import React from 'react';
import Icon from '../../components/Icon.jsx';
import { Card, Table, EmptyState, Loading } from '../../components/ui.jsx';

// Kod kraju ISO 3166 jako mała etykieta (bez emoji).
export const flag = (iso) =>
  iso && /^[A-Za-z]{2}$/.test(iso)
    ? <span className="tag" style={{ height: 18, fontSize: 10.5, padding: '0 5px', marginRight: 4 }} title={iso.toUpperCase()}>{iso.toUpperCase()}</span>
    : <Icon name="globe" size={14} className="faint" style={{ marginRight: 4 }} />;

export const deviceIcon = (t) => (
  <Icon name={t === 'mobile' || t === 'tablet' ? 'smartphone' : 'monitor'} size={15} className="faint"
    title={t === 'mobile' ? 'Telefon' : t === 'tablet' ? 'Tablet' : 'Komputer'} style={{ marginRight: 4 }} />
);

export const fmtWhen = (ts) =>
  ts ? new Date(ts).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Drabinka identyfikacji (styl bazo.io): user → kościół → organizacja → rDNS → anonim.
export function IdentityBadge({ v }) {
  if (v.userName || v.userEmail) {
    return (
      <span className="idbadge user" title={v.userEmail || ''}>
        {v.userName || v.userEmail}
        {v.tenantName ? <span className="muted" style={{ fontWeight: 500 }}> · {v.tenantName}</span> : null}
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
  const body = rows.length === 0 ? <EmptyState icon="chart">{emptyText}</EmptyState> : (
    <Table flush className="ranktable">
      <thead>
        <tr>
          <th>{nameLabel}</th>
          {columns.map((c) => <th key={c.key} className="num" style={{ width: 96 }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ position: 'relative' }}>
              <div className="rankbar" style={{ width: `calc(${((r[columns[0].key] || 0) / max) * 100}% - 12px)` }} />
              <span className="rank-name">{nameRender ? nameRender(r) : r.name || '—'}</span>
            </td>
            {columns.map((c) => (
              <td key={c.key} className="num">
                {r[c.key] == null ? '' : c.fmt ? c.fmt(r[c.key]) : r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
  return title ? <Card title={title}>{body}</Card> : <Card>{body}</Card>;
}

// Zmiana vs poprzedni okres przy kartach KPI.
export function Delta({ now, prev, invert = false }) {
  if (!prev) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (!isFinite(pct) || pct === 0) return <span className="delta muted">±0% vs poprzedni okres</span>;
  const good = invert ? pct < 0 : pct > 0;
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="muted" style={{ fontWeight: 500 }}>vs poprzedni okres</span>
    </span>
  );
}

export { Loading };

// Kod ISO → polska nazwa kraju ("PL" → "Polska").
let regionNames = null;
export const countryName = (iso) => {
  if (!iso || !/^[A-Za-z]{2}$/.test(iso)) return iso || '—';
  try { regionNames = regionNames || new Intl.DisplayNames(['pl'], { type: 'region' }); return regionNames.of(iso.toUpperCase()) || iso; }
  catch { return iso; }
};

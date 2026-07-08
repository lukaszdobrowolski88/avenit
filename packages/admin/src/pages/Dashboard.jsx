import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatPLN } from '../lib/api.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.dashboard().then(setD).catch((e) => setErr(e.message));
    api.growth().then(setGrowth).catch(() => {});
  }, []);
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const byStatus = Object.fromEntries(d.tenantsByStatus.map((r) => [r.status, r.n]));
  const totalTenants = d.tenantsByStatus.reduce((a, r) => a + r.n, 0);
  const unpaid = d.invoices.filter((i) => ['pending', 'overdue'].includes(i.status)).reduce((a, i) => a + i.n, 0);
  const maxPlan = Math.max(1, ...(d.planDistribution || []).map((p) => p.n));

  return (
    <div>
      <h1 className="h1">Dashboard</h1>
      <div className="cards">
        <Card label="Tenanci (łącznie)" value={totalTenants} />
        <Card label="Aktywni" value={byStatus.active || 0} />
        <Card label="Trial" value={byStatus.trial || 0} />
        <Card label="Zawieszeni" value={(byStatus.suspended || 0) + (byStatus.cancelled || 0)} />
        <Card label="MRR" value={formatPLN(d.mrr)} accent />
        <Card label="Przychód (ten miesiąc)" value={formatPLN(d.revenueThisMonth || 0)} />
        <Card label="Nowi (30 dni)" value={`+${d.newTenants30d || 0}`} />
        <Card label="Kończące trial (7 dni)" value={d.trialsEndingSoon} warn={d.trialsEndingSoon > 0} />
        <Card label="Nieopłacone faktury" value={unpaid} warn={unpaid > 0} />
      </div>

      {((d.trialsEndingList || []).length > 0 || (d.unpaidInvoicesList || []).length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <div className="card" style={{ borderColor: (d.trialsEndingList || []).length ? 'var(--amber)' : undefined }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>⏳ Kończące się triale</h3>
            {(d.trialsEndingList || []).length === 0 && <div className="muted">Brak</div>}
            {(d.trialsEndingList || []).map((t) => (
              <div key={t.id} onClick={() => navigate(`/tenants/${t.id}`)} className="search-item row" style={{ justifyContent: 'space-between', padding: '8px 6px', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                <span>{t.name} <span className="muted">({t.subdomain})</span></span>
                <span className="muted">{new Date(t.trial_ends_at).toLocaleDateString('pl-PL')}</span>
              </div>
            ))}
          </div>
          <div className="card" style={{ borderColor: (d.unpaidInvoicesList || []).length ? 'var(--red)' : undefined }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>💰 Nieopłacone faktury</h3>
            {(d.unpaidInvoicesList || []).length === 0 && <div className="muted">Brak</div>}
            {(d.unpaidInvoicesList || []).map((i) => (
              <div key={i.id} onClick={() => navigate(`/tenants/${i.tenant_id}`)} className="search-item row" style={{ justifyContent: 'space-between', padding: '8px 6px', cursor: 'pointer', fontSize: 13, borderRadius: 6 }}>
                <span>{i.tenant_name} <span className="muted">{i.invoice_number}</span></span>
                <span><span className={`badge ${i.status}`} style={{ fontSize: 10 }}>{i.status}</span> {formatPLN(i.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {growth && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <GrowthChart title="Nowi tenanci (12 mies.)" months={growth.months} values={growth.tenants} fmt={(v) => v} />
          <GrowthChart title="Przychód (12 mies.)" months={growth.months} values={growth.revenue.map((v) => Math.round(v / 100))} fmt={(v) => `${v} zł`} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 8 }}>
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Podział planów</h3>
          {(d.planDistribution || []).length === 0 && <div className="muted">Brak aktywnych subskrypcji</div>}
          {(d.planDistribution || []).map((p) => (
            <div key={p.plan} style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                <span>{p.plan}</span><span className="muted">{p.n}</span>
              </div>
              <div style={{ height: 8, background: 'var(--panel2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(p.n / maxPlan) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>Ostatnia aktywność</h3>
          {(d.recentActivity || []).length === 0 && <div className="muted">Brak zdarzeń</div>}
          {(d.recentActivity || []).map((a, i) => (
            <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span><b>{a.action}</b> <span className="muted">{a.target_type || ''}</span></span>
              <span className="muted">{new Date(a.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GrowthChart({ title, months, values, fmt }) {
  const max = Math.max(1, ...values);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>{title}</h3>
      <div className="chart-bars">
        {values.map((v, i) => (
          <div key={i} className="bar" style={{ height: `${(v / max) * 100}%` }} title={`${months[i]}: ${fmt(v)}`} />
        ))}
      </div>
      <div className="chart-x">
        {months.map((m) => <span key={m}>{m.slice(5)}</span>)}
      </div>
    </div>
  );
}

function Card({ label, value, accent, warn }) {
  return (
    <div className="card" style={accent ? { borderColor: 'var(--accent)' } : warn ? { borderColor: 'var(--amber)' } : undefined}>
      <div className="label">{label}</div>
      <div className="value" style={accent ? { color: 'var(--accent2)' } : undefined}>{value}</div>
    </div>
  );
}

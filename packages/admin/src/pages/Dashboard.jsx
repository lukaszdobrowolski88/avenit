import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatPLN } from '../lib/api.js';
import { PageHeader, Stat, Card, StatusBadge, EmptyState, Loading, ErrorBox, Button } from '../components/ui.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [growth, setGrowth] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    setErr('');
    api.dashboard().then(setD).catch((e) => setErr(e.message));
    api.growth().then(setGrowth).catch(() => {});
  };
  useEffect(load, []);
  if (err) return <><PageHeader title="Pulpit" /><ErrorBox error={err} onRetry={load} /></>;
  if (!d) return <><PageHeader title="Pulpit" /><Loading /></>;

  const byStatus = Object.fromEntries(d.tenantsByStatus.map((r) => [r.status, r.n]));
  const totalTenants = d.tenantsByStatus.reduce((a, r) => a + r.n, 0);
  const unpaid = d.invoices.filter((i) => ['pending', 'overdue'].includes(i.status)).reduce((a, i) => a + i.n, 0);
  const maxPlan = Math.max(1, ...(d.planDistribution || []).map((p) => p.n));
  const trials = d.trialsEndingList || [];
  const unpaidList = d.unpaidInvoicesList || [];

  return (
    <div>
      <PageHeader
        title="Pulpit"
        subtitle="Stan platformy: kościoły, przychód i sprawy do załatwienia."
        actions={<Button icon="church" onClick={() => navigate('/tenants')}>Kościoły</Button>}
      />
      <div className="stats">
        <Stat label="MRR" value={formatPLN(d.mrr)} tone="accent" hint="Miesięczny przychód cykliczny" />
        <Stat label="Przychód w tym miesiącu" value={formatPLN(d.revenueThisMonth || 0)} />
        <Stat label="Kościoły" value={totalTenants} hint={`+${d.newTenants30d || 0} w ostatnich 30 dniach`} />
        <Stat label="Aktywne" value={byStatus.active || 0} />
        <Stat label="Na triale" value={byStatus.trial || 0} />
        <Stat label="Zawieszone / anulowane" value={(byStatus.suspended || 0) + (byStatus.cancelled || 0)} />
        <Stat label="Trial kończy się w 7 dni" value={d.trialsEndingSoon} tone={d.trialsEndingSoon > 0 ? 'warn' : undefined} />
        <Stat label="Nieopłacone faktury" value={unpaid} tone={unpaid > 0 ? 'warn' : undefined} />
      </div>

      {(trials.length > 0 || unpaidList.length > 0) && (
        <div className="grid2 mb">
          <Card title="Kończące się triale" subtitle="Najbliższe 7 dni">
            {trials.length === 0 ? <div className="muted">Brak</div> : (
              <div className="list">
                {trials.map((t) => (
                  <button key={t.id} className="list-row" onClick={() => navigate(`/tenants/${t.id}`)}>
                    <span className="ellipsis"><b>{t.name}</b> <span className="muted">{t.subdomain}</span></span>
                    <span className="muted tnum nowrap">{new Date(t.trial_ends_at).toLocaleDateString('pl-PL')}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
          <Card title="Nieopłacone faktury" subtitle="Oczekujące i po terminie">
            {unpaidList.length === 0 ? <div className="muted">Brak</div> : (
              <div className="list">
                {unpaidList.map((i) => (
                  <button key={i.id} className="list-row" onClick={() => navigate(`/tenants/${i.tenant_id}`)}>
                    <span className="ellipsis"><b>{i.tenant_name}</b> <span className="muted">{i.invoice_number}</span></span>
                    <span className="row nowrap"><StatusBadge status={i.status} kind="invoice" size="sm" /><span className="tnum">{formatPLN(i.total)}</span></span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {growth && (
        <div className="grid2 mb">
          <GrowthChart title="Nowe kościoły" months={growth.months} values={growth.tenants} fmt={(v) => v} />
          <GrowthChart title="Przychód" months={growth.months} values={growth.revenue.map((v) => Math.round(v / 100))} fmt={(v) => `${v.toLocaleString('pl-PL')} zł`} />
        </div>
      )}

      <div className="grid2">
        <Card title="Podział planów" subtitle="Aktywne subskrypcje i triale">
          {(d.planDistribution || []).length === 0 && <EmptyState icon="layers" title="Brak aktywnych subskrypcji" />}
          {(d.planDistribution || []).map((p) => (
            <div key={p.plan} style={{ marginBottom: 12 }}>
              <div className="row row--between small" style={{ marginBottom: 5 }}>
                <span className="strong">{p.plan}</span><span className="muted tnum">{p.n}</span>
              </div>
              <div className="meter"><span style={{ width: `${(p.n / maxPlan) * 100}%` }} /></div>
            </div>
          ))}
        </Card>

        <Card title="Ostatnia aktywność" actions={<Button size="sm" variant="ghost" iconRight="chevronRight" onClick={() => navigate('/audit')}>Log audytu</Button>}>
          {(d.recentActivity || []).length === 0 && <EmptyState icon="history" title="Brak zdarzeń" />}
          <div className="list">
            {(d.recentActivity || []).map((a, i) => (
              <div key={i} className="list-row">
                <span className="ellipsis"><b>{a.action}</b> <span className="muted">{a.target_type || ''}{a.admin_email ? ` · ${a.admin_email}` : ''}</span></span>
                <span className="muted small tnum nowrap">{new Date(a.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function GrowthChart({ title, months, values, fmt }) {
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <Card title={title} subtitle={`Ostatnie 12 miesięcy · razem ${fmt(total)}`}>
      <div className="bars" role="img" aria-label={`${title}: ${months.map((m, i) => `${m} ${fmt(values[i])}`).join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className={`bar${v ? ' has' : ''}`} style={{ height: `${(v / max) * 100}%` }} title={`${months[i]}: ${fmt(v)}`} />
        ))}
      </div>
      <div className="bars-x" aria-hidden="true">
        {months.map((m) => <span key={m}>{m.slice(5)}</span>)}
      </div>
    </Card>
  );
}

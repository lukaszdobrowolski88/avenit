import React, { useEffect, useState } from 'react';
import { api, formatPLN } from '../lib/api.js';

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.dashboard().then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div>Ładowanie…</div>;

  const byStatus = Object.fromEntries(d.tenantsByStatus.map((r) => [r.status, r.n]));
  const totalTenants = d.tenantsByStatus.reduce((a, r) => a + r.n, 0);
  const unpaid = d.invoices.filter((i) => ['pending', 'overdue'].includes(i.status)).reduce((a, i) => a + i.n, 0);

  return (
    <div>
      <h1 className="h1">Dashboard</h1>
      <div className="cards">
        <Card label="Tenanci (łącznie)" value={totalTenants} />
        <Card label="Aktywni" value={byStatus.active || 0} />
        <Card label="Trial" value={byStatus.trial || 0} />
        <Card label="Zawieszeni" value={(byStatus.suspended || 0) + (byStatus.cancelled || 0)} />
        <Card label="MRR" value={formatPLN(d.mrr)} />
        <Card label="Kończące się triale (7 dni)" value={d.trialsEndingSoon} />
        <Card label="Nieopłacone faktury" value={unpaid} />
      </div>
    </div>
  );
}

function Card({ label, value }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

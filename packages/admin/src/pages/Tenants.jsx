import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  const load = () => api.tenants().then((r) => setTenants(r.tenants)).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.plans().then((r) => setPlans(r.plans)); }, []);

  const filtered = tenants.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.includes(search.toLowerCase()));

  return (
    <div>
      <h1 className="h1">Tenanci</h1>
      <div className="toolbar">
        <input placeholder="Szukaj…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 260 }} />
        <button onClick={() => setShowNew(true)}>+ Nowy tenant</button>
      </div>
      {err && <div className="err">{err}</div>}
      <table>
        <thead><tr><th>Nazwa</th><th>Subdomena</th><th>Status</th><th>Plan</th><th>Trial do</th><th></th></tr></thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td className="muted">{t.subdomain}</td>
              <td><span className={`badge ${t.status}`}>{t.status}</span></td>
              <td>{t.plan_name || '—'}</td>
              <td className="muted">{t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString('pl-PL') : '—'}</td>
              <td><button className="ghost" onClick={() => navigate(`/tenants/${t.id}`)}>Szczegóły</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewTenant plans={plans} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewTenant({ plans, onClose, onCreated }) {
  const [f, setF] = useState({ name: '', slug: '', adminEmail: '', adminName: '', adminPassword: '', planKey: 'starter' });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const create = async () => {
    setErr(''); setLoading(true);
    try {
      const res = await api.createTenant(f);
      setResult(res);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  if (result) {
    return (
      <Modal onClose={onCreated} title="Tenant utworzony">
        <p>Kościół <b>{result.tenant.name}</b> działa na <b>{result.tenant.subdomain}</b>.</p>
        {result.adminPassword && <p className="muted">Hasło administratora (zapisz): <code>{result.adminPassword}</code></p>}
        <button onClick={onCreated} style={{ marginTop: 12 }}>OK</button>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Nowy tenant">
      <label>Nazwa kościoła</label>
      <input value={f.name} onChange={(e) => set('name', e.target.value)} />
      <label>Subdomena (slug)</label>
      <input value={f.slug} onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="np. schwro" />
      <label>E-mail administratora kościoła</label>
      <input value={f.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
      <label>Imię i nazwisko administratora</label>
      <input value={f.adminName} onChange={(e) => set('adminName', e.target.value)} />
      <label>Hasło administratora (puste = wygeneruj)</label>
      <input value={f.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} />
      <label>Plan</label>
      <select value={f.planKey} onChange={(e) => set('planKey', e.target.value)}>
        {plans.map((p) => <option key={p.id} value={p.key || p.slug}>{p.name}</option>)}
      </select>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={create} disabled={loading || !f.name || !f.slug || !f.adminEmail}>
          {loading ? 'Tworzenie…' : 'Utwórz'}
        </button>
      </div>
    </Modal>
  );
}

export function Modal({ title, children, onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

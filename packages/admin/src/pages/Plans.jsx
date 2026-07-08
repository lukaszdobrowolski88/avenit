import React, { useEffect, useState } from 'react';
import { api, formatPLN } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.plans().then((r) => setPlans(r.plans));
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Plany subskrypcji</h1>
        <button onClick={() => setEdit({})}>+ Nowy plan</button>
      </div>
      <table>
        <thead><tr><th>Nazwa</th><th>Cena/mc</th><th>Cena/rok</th><th>Limity (człon./użytk.)</th><th>Trial</th><th>Aktywny</th><th></th></tr></thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{formatPLN(p.price_monthly)}</td><td>{p.price_yearly ? formatPLN(p.price_yearly) : '—'}</td>
              <td className="muted">{lim(p.max_members)} / {lim(p.max_users)}</td>
              <td>{p.trial_days} dni</td>
              <td>{p.is_active ? '✓' : '—'}</td>
              <td><button className="ghost" onClick={() => setEdit(p)}>Edytuj</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <PlanForm plan={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}
const lim = (n) => (n === -1 ? '∞' : n);

function PlanForm({ plan, onClose, onSaved }) {
  const [f, setF] = useState({
    name: plan.name || '', slug: plan.slug || '', description: plan.description || '',
    price_monthly: (plan.price_monthly ?? 0) / 100, price_yearly: (plan.price_yearly ?? 0) / 100,
    max_members: plan.max_members ?? -1, max_users: plan.max_users ?? -1, max_storage_mb: plan.max_storage_mb ?? 100,
    trial_days: plan.trial_days ?? 14, is_active: plan.is_active !== false, is_public: plan.is_public !== false,
    sort_order: plan.sort_order ?? 0,
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setErr('');
    const body = {
      ...f, price_monthly: Math.round(f.price_monthly * 100), price_yearly: Math.round(f.price_yearly * 100),
      max_members: Number(f.max_members), max_users: Number(f.max_users),
      max_storage_mb: Number(f.max_storage_mb), trial_days: Number(f.trial_days), sort_order: Number(f.sort_order),
    };
    try {
      if (plan.id) await api.updatePlan(plan.id, body); else await api.createPlan(body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={plan.id ? 'Edytuj plan' : 'Nowy plan'} onClose={onClose}>
      <label>Nazwa</label><input value={f.name} onChange={(e) => set('name', e.target.value)} />
      {!plan.id && <><label>Slug</label><input value={f.slug} onChange={(e) => set('slug', e.target.value)} /></>}
      <div className="row">
        <div style={{ flex: 1 }}><label>Cena/mc (PLN)</label><input type="number" value={f.price_monthly} onChange={(e) => set('price_monthly', e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Cena/rok (PLN)</label><input type="number" value={f.price_yearly} onChange={(e) => set('price_yearly', e.target.value)} /></div>
      </div>
      <div className="row">
        <div style={{ flex: 1 }}><label>Max członków (-1=∞)</label><input type="number" value={f.max_members} onChange={(e) => set('max_members', e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Max użytkowników</label><input type="number" value={f.max_users} onChange={(e) => set('max_users', e.target.value)} /></div>
      </div>
      <div className="row">
        <div style={{ flex: 1 }}><label>Storage (MB)</label><input type="number" value={f.max_storage_mb} onChange={(e) => set('max_storage_mb', e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Trial (dni)</label><input type="number" value={f.trial_days} onChange={(e) => set('trial_days', e.target.value)} /></div>
      </div>
      <label className="row" style={{ marginTop: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Aktywny
      </label>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save}>Zapisz</button>
      </div>
    </Modal>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const load = () => api.coupons().then((r) => setCoupons(r.coupons));
  useEffect(() => { load(); }, []);
  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Kupony</h1>
        <button onClick={() => setShowNew(true)}>+ Nowy kupon</button>
      </div>
      <table>
        <thead><tr><th>Kod</th><th>Nazwa</th><th>Rabat</th><th>Użycia</th><th>Ważny do</th><th>Aktywny</th></tr></thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id}>
              <td><b>{c.code}</b></td><td>{c.name}</td>
              <td>{c.discount_type === 'percent' ? `${c.discount_value}%` : c.discount_type === 'fixed_amount' ? `${(c.discount_value / 100).toFixed(2)} zł` : `${c.discount_value} mc`}</td>
              <td className="muted">{c.current_uses}{c.max_uses ? `/${c.max_uses}` : ''}</td>
              <td className="muted">{c.valid_until ? new Date(c.valid_until).toLocaleDateString('pl-PL') : '∞'}</td>
              <td>{c.is_active ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewCoupon onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewCoupon({ onClose, onCreated }) {
  const [f, setF] = useState({ code: '', name: '', discount_type: 'percent', discount_value: 10, valid_until: '', max_uses: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const create = async () => {
    setErr('');
    try {
      await api.createCoupon({
        ...f, discount_value: f.discount_type === 'fixed_amount' ? Math.round(Number(f.discount_value) * 100) : Number(f.discount_value),
        valid_until: f.valid_until || null, max_uses: f.max_uses ? Number(f.max_uses) : null,
      });
      onCreated();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Nowy kupon" onClose={onClose}>
      <label>Kod</label><input value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="WELCOME20" />
      <label>Nazwa</label><input value={f.name} onChange={(e) => set('name', e.target.value)} />
      <label>Typ rabatu</label>
      <select value={f.discount_type} onChange={(e) => set('discount_type', e.target.value)}>
        <option value="percent">Procentowy (%)</option>
        <option value="fixed_amount">Kwotowy (PLN)</option>
        <option value="free_months">Darmowe miesiące</option>
      </select>
      <label>Wartość</label><input type="number" value={f.discount_value} onChange={(e) => set('discount_value', e.target.value)} />
      <label>Ważny do (puste = bezterminowo)</label><input type="date" value={f.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
      <label>Limit użyć (puste = bez limitu)</label><input type="number" value={f.max_uses} onChange={(e) => set('max_uses', e.target.value)} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={create} disabled={!f.code || !f.name}>Utwórz</button>
      </div>
    </Modal>
  );
}

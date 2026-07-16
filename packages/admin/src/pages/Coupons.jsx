import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.coupons().then((r) => setCoupons(r.coupons));
  useEffect(() => { load(); }, []);

  const toggleActive = async (c) => {
    setErr('');
    try { await api.updateCoupon(c.id, { ...c, is_active: !c.is_active }); load(); }
    catch (e) { setErr(e.message); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Usunąć kupon ${c.code}?`)) return;
    setErr('');
    try { await api.deleteCoupon(c.id); load(); }
    catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Kupony</h1>
        <button onClick={() => setEdit({})}>+ Nowy kupon</button>
      </div>
      {err && <div className="err" style={{ marginBottom: 12 }}>{err}</div>}
      <table>
        <thead><tr><th>Kod</th><th>Nazwa</th><th>Rabat</th><th>Użycia</th><th>Ważny do</th><th>Aktywny</th><th></th></tr></thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id}>
              <td><b>{c.code}</b></td><td>{c.name}</td>
              <td>{c.discount_type === 'percent' ? `${c.discount_value}%` : c.discount_type === 'fixed_amount' ? `${(c.discount_value / 100).toFixed(2)} zł` : `${c.discount_value} mc`}</td>
              <td className="muted">{c.current_uses}{c.max_uses ? `/${c.max_uses}` : ''}</td>
              <td className="muted">{c.valid_until ? new Date(c.valid_until).toLocaleDateString('pl-PL') : '∞'}</td>
              <td>
                <button className="ghost" title={c.is_active ? 'Kliknij, aby dezaktywować' : 'Kliknij, aby aktywować'}
                  onClick={() => toggleActive(c)} style={{ padding: '2px 8px' }}>{c.is_active ? '✓' : '—'}</button>
              </td>
              <td className="row" style={{ gap: 6 }}>
                <button className="ghost" onClick={() => setEdit(c)}>Edytuj</button>
                <button className="ghost danger" onClick={() => remove(c)}>Usuń</button>
              </td>
            </tr>
          ))}
          {coupons.length === 0 && <tr><td colSpan={7} className="muted">Brak kuponów</td></tr>}
        </tbody>
      </table>
      {edit && <CouponForm coupon={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function CouponForm({ coupon, onClose, onSaved }) {
  const [f, setF] = useState({
    code: coupon.code || '',
    name: coupon.name || '',
    discount_type: coupon.discount_type || 'percent',
    discount_value: coupon.id
      ? (coupon.discount_type === 'fixed_amount' ? coupon.discount_value / 100 : coupon.discount_value)
      : 10,
    valid_until: coupon.valid_until ? String(coupon.valid_until).slice(0, 10) : '',
    max_uses: coupon.max_uses ?? '',
    is_active: coupon.is_active !== false,
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setErr('');
    const body = {
      ...f,
      discount_value: f.discount_type === 'fixed_amount' ? Math.round(Number(f.discount_value) * 100) : Number(f.discount_value),
      valid_until: f.valid_until || null,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
    };
    try {
      if (coupon.id) await api.updateCoupon(coupon.id, body); else await api.createCoupon(body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={coupon.id ? 'Edytuj kupon' : 'Nowy kupon'} onClose={onClose}>
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
      <label className="row" style={{ marginTop: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Aktywny
      </label>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save} disabled={!f.code || !f.name}>{coupon.id ? 'Zapisz' : 'Utwórz'}</button>
      </div>
    </Modal>
  );
}

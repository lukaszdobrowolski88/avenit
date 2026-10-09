import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  PageHeader, Button, Badge, Table, EmptyRow, Modal, Field, Toggle, Loading, ErrorBox, useToast, AffixInput,
} from '../components/ui.jsx';

const discountLabel = (c) =>
  c.discount_type === 'percent' ? `${c.discount_value}%`
    : c.discount_type === 'fixed_amount' ? `${(c.discount_value / 100).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`
      : `${c.discount_value} mies. gratis`;

export default function Coupons() {
  const [coupons, setCoupons] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  const load = () => api.coupons().then((r) => setCoupons(r.coupons)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const toggleActive = async (c) => {
    try { await api.updateCoupon(c.id, { ...c, is_active: !c.is_active }); load(); showToast(c.is_active ? 'Kupon wyłączony' : 'Kupon włączony'); }
    catch (e) { showToast(e.message, 'error'); }
  };
  const remove = async (c) => {
    if (!window.confirm(`Usunąć kupon ${c.code}?`)) return;
    try { await api.deleteCoupon(c.id); load(); showToast('Kupon usunięty'); }
    catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div>
      <PageHeader
        title="Kupony"
        subtitle="Kody rabatowe na subskrypcję."
        actions={<Button variant="primary" icon="plus" onClick={() => setEdit({})}>Nowy kupon</Button>}
      />
      <ErrorBox error={err} onRetry={load} />
      {!coupons && !err ? <Loading /> : (
        <Table minWidth={720}>
          <thead><tr><th>Kod</th><th>Nazwa</th><th>Rabat</th><th className="num">Użycia</th><th>Ważny do</th><th>Aktywny</th><th></th></tr></thead>
          <tbody>
            {(coupons || []).length === 0 && <EmptyRow colSpan={7}>Brak kuponów</EmptyRow>}
            {(coupons || []).map((c) => {
              const expired = c.valid_until && new Date(c.valid_until) < new Date();
              const used = c.max_uses && c.current_uses >= c.max_uses;
              return (
                <tr key={c.id}>
                  <td><span className="code-chip strong">{c.code}</span></td>
                  <td className="primary-cell">{c.name}</td>
                  <td>{discountLabel(c)}</td>
                  <td className="num">{c.current_uses}{c.max_uses ? ` / ${c.max_uses}` : ''}</td>
                  <td className="muted tnum">
                    {c.valid_until ? new Date(c.valid_until).toLocaleDateString('pl-PL') : 'bezterminowo'}
                    {expired && <> <Badge tone="neutral" size="sm">wygasł</Badge></>}
                    {used && <> <Badge tone="neutral" size="sm">wykorzystany</Badge></>}
                  </td>
                  <td><Toggle checked={c.is_active} onChange={() => toggleActive(c)} title={c.is_active ? `Wyłącz ${c.code}` : `Włącz ${c.code}`} /></td>
                  <td className="actions">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(c)}>Edytuj</Button>
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(c)} aria-label={`Usuń ${c.code}`} title="Usuń" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {edit && <CouponForm coupon={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); showToast('Zapisano kupon'); }} />}
      {toast}
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
      discount_value: f.discount_type === 'fixed_amount' ? Math.round(Number(String(f.discount_value).replace(',', '.')) * 100) : Number(f.discount_value),
      valid_until: f.valid_until || null,
      max_uses: f.max_uses ? Number(f.max_uses) : null,
    };
    try {
      if (coupon.id) await api.updateCoupon(coupon.id, body); else await api.createCoupon(body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  const affix = f.discount_type === 'percent' ? '%' : f.discount_type === 'fixed_amount' ? 'zł' : 'mies.';
  return (
    <Modal title={coupon.id ? 'Edytuj kupon' : 'Nowy kupon'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button variant="primary" onClick={save} disabled={!f.code || !f.name}>{coupon.id ? 'Zapisz' : 'Utwórz'}</Button>
    </>}>
      <div className="field-row">
        <Field label="Kod"><input className="mono" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="WELCOME20" /></Field>
        <Field label="Nazwa"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Typ rabatu">
          <select value={f.discount_type} onChange={(e) => set('discount_type', e.target.value)}>
            <option value="percent">Procentowy</option>
            <option value="fixed_amount">Kwotowy (zł)</option>
            <option value="free_months">Darmowe miesiące</option>
          </select>
        </Field>
        <Field label="Wartość"><AffixInput affix={affix} inputMode="decimal" value={f.discount_value} onChange={(e) => set('discount_value', e.target.value)} /></Field>
      </div>
      <div className="field-row">
        <Field label="Ważny do" hint="Puste = bezterminowo."><input type="date" value={f.valid_until} onChange={(e) => set('valid_until', e.target.value)} /></Field>
        <Field label="Limit użyć" hint="Puste = bez limitu."><input type="number" min={1} value={f.max_uses} onChange={(e) => set('max_uses', e.target.value)} /></Field>
      </div>
      <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label="Aktywny" />
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

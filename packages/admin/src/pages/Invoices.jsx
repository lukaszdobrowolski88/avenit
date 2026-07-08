import React, { useEffect, useState } from 'react';
import { api, formatPLN } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const load = () => api.invoices().then((r) => setInvoices(r.invoices));
  useEffect(() => { load(); api.tenants().then((r) => setTenants(r.tenants)); }, []);

  const act = async (fn) => { await fn(); load(); };

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Faktury</h1>
        <button onClick={() => setShowNew(true)}>+ Wystaw fakturę</button>
      </div>
      <table>
        <thead><tr><th>Numer</th><th>Tenant</th><th>Kwota (brutto)</th><th>Status</th><th>Termin</th><th></th></tr></thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td>{i.invoice_number}</td><td>{i.tenant_name}</td><td>{formatPLN(i.total)}</td>
              <td><span className={`badge ${i.status}`}>{i.status}</span></td>
              <td className="muted">{i.due_date}</td>
              <td className="row">
                {i.status !== 'paid' && <button className="ghost" onClick={() => act(() => api.markPaid(i.id))}>Opłacona</button>}
                {i.status !== 'cancelled' && i.status !== 'paid' && <button className="danger" onClick={() => act(() => api.cancelInvoice(i.id))}>Anuluj</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewInvoice tenants={tenants} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewInvoice({ tenants, onClose, onCreated }) {
  const [f, setF] = useState({ tenant_id: '', buyer_name: '', buyer_email: '', subtotal: 0, due_date: '', description: 'Subskrypcja Avenit' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const create = async () => {
    setErr('');
    try {
      await api.createInvoice({
        tenant_id: f.tenant_id, buyer_name: f.buyer_name, buyer_email: f.buyer_email,
        subtotal: Math.round(Number(f.subtotal) * 100), due_date: f.due_date,
        items: [{ description: f.description, quantity: 1, unit_price: Math.round(Number(f.subtotal) * 100) }],
      });
      onCreated();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Wystaw fakturę" onClose={onClose}>
      <label>Tenant</label>
      <select value={f.tenant_id} onChange={(e) => { const t = tenants.find(x => x.id === e.target.value); set('tenant_id', e.target.value); if (t) { set('buyer_name', t.company_name || t.name); set('buyer_email', t.email); } }}>
        <option value="">— wybierz —</option>
        {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label>Nabywca</label><input value={f.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} />
      <label>E-mail nabywcy</label><input value={f.buyer_email} onChange={(e) => set('buyer_email', e.target.value)} />
      <label>Kwota netto (PLN)</label><input type="number" value={f.subtotal} onChange={(e) => set('subtotal', e.target.value)} />
      <label>Opis pozycji</label><input value={f.description} onChange={(e) => set('description', e.target.value)} />
      <label>Termin płatności</label><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} />
      <p className="muted" style={{ fontSize: 13 }}>VAT 23% doliczany automatycznie.</p>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={create} disabled={!f.tenant_id || !f.due_date}>Wystaw</button>
      </div>
    </Modal>
  );
}

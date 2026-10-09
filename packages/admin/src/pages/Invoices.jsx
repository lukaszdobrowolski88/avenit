import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatPLN } from '../lib/api.js';
import {
  PageHeader, Button, Table, TR, EmptyRow, StatusBadge, Segmented, SearchInput, Modal, Field, AffixInput,
  Loading, ErrorBox, useToast, stop, Notice,
} from '../components/ui.jsx';

export default function Invoices() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  const load = () => api.invoices().then((r) => setInvoices(r.invoices)).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.tenants().then((r) => setTenants(r.tenants)).catch(() => {}); }, []);

  const act = async (fn, ok) => { try { await fn(); showToast(ok); load(); } catch (e) { showToast(e.message, 'error'); } };

  const list = invoices || [];
  const count = (s) => list.filter((i) => (s === 'unpaid' ? ['pending', 'overdue'].includes(i.status) : i.status === s)).length;
  const needle = q.trim().toLowerCase();
  const filtered = list.filter((i) => {
    if (status === 'unpaid' && !['pending', 'overdue'].includes(i.status)) return false;
    if (status && status !== 'unpaid' && i.status !== status) return false;
    if (needle && !`${i.invoice_number} ${i.tenant_name}`.toLowerCase().includes(needle)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Faktury"
        subtitle="Faktury za subskrypcje. Kwoty brutto."
        actions={<Button variant="primary" icon="plus" onClick={() => setShowNew(true)}>Wystaw fakturę</Button>}
      />
      <ErrorBox error={err} onRetry={load} />
      <div className="toolbar">
        <SearchInput className="grow" value={q} onChange={setQ} placeholder="Numer lub kościół…" />
        <Segmented label="Status" value={status} onChange={setStatus} items={[
          { value: '', label: 'Wszystkie', count: list.length },
          { value: 'unpaid', label: 'Nieopłacone', count: count('unpaid') },
          { value: 'paid', label: 'Opłacone', count: count('paid') },
          { value: 'cancelled', label: 'Anulowane', count: count('cancelled') },
        ]} />
      </div>
      {!invoices && !err ? <Loading /> : (
        <Table tall minWidth={720}>
          <thead><tr><th>Numer</th><th>Kościół</th><th className="num">Kwota brutto</th><th>Status</th><th>Termin</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 && <EmptyRow colSpan={6}>{list.length ? 'Brak faktur dla tych filtrów.' : 'Nie wystawiono jeszcze żadnej faktury.'}</EmptyRow>}
            {filtered.map((i) => (
              <TR key={i.id} onClick={i.tenant_id ? () => navigate(`/tenants/${i.tenant_id}`) : undefined}>
                <td className="primary-cell mono">{i.invoice_number}</td>
                <td>{i.tenant_name}</td>
                <td className="num" style={{ color: 'var(--text)', fontWeight: 650 }}>{formatPLN(i.total)}</td>
                <td><StatusBadge status={i.status} kind="invoice" /></td>
                <td className="muted tnum">{i.due_date ? new Date(i.due_date).toLocaleDateString('pl-PL') : ''}</td>
                <td className="actions" onClick={stop}>
                  {i.status !== 'paid' && i.status !== 'cancelled' && <Button size="sm" icon="check" onClick={() => act(() => api.markPaid(i.id), 'Oznaczono jako opłaconą')}>Opłacona</Button>}
                  {i.status !== 'cancelled' && i.status !== 'paid' && (
                    <Button size="sm" variant="danger" onClick={() => confirm(`Anulować fakturę ${i.invoice_number}?`) && act(() => api.cancelInvoice(i.id), 'Faktura anulowana')}>Anuluj</Button>
                  )}
                </td>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {showNew && <NewInvoice tenants={tenants} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); showToast('Faktura wystawiona'); }} />}
      {toast}
    </div>
  );
}

// Kwota: z subskrypcji (cena planu / indywidualna wg cyklu — liczy API), brutto (ceny Avenit są brutto)
// albo netto (+VAT 23%, tryb dawny).
const fmtZl = (n) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function NewInvoice({ tenants, onClose, onCreated }) {
  const [f, setF] = useState({ tenant_id: '', buyer_name: '', buyer_email: '', amount: '', due_date: '', description: 'Subskrypcja Avenit' });
  const [mode, setMode] = useState('subscription');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const amount = Number(String(f.amount).replace(/\s/g, '').replace(',', '.')) || 0;
  const grosze = Math.round(amount * 100);
  const create = async () => {
    setErr(''); setSaving(true);
    const base = { tenant_id: f.tenant_id, buyer_name: f.buyer_name, buyer_email: f.buyer_email, due_date: f.due_date };
    const body = mode === 'subscription'
      ? { ...base, from_subscription: true }
      : mode === 'gross'
        ? { ...base, total: grosze, items: [{ description: f.description, quantity: 1, unit_price: grosze, total: grosze }] }
        : { ...base, subtotal: grosze, items: [{ description: f.description, quantity: 1, unit_price: grosze }] };
    try {
      await api.createInvoice(body);
      onCreated();
    } catch (e) { setErr(e.message); setSaving(false); }
  };
  const amountHint = mode === 'gross'
    ? (amount ? `Netto ${fmtZl(amount / 1.23)} zł + VAT 23%` : 'Kwota z VAT — tak jak w cenniku.')
    : (amount ? `Brutto z VAT 23%: ${fmtZl(amount * 1.23)} zł` : 'VAT 23% zostanie doliczony.');
  return (
    <Modal title="Wystaw fakturę" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button variant="primary" onClick={create} loading={saving} disabled={!f.tenant_id || !f.due_date || (mode !== 'subscription' && !grosze)}>Wystaw</Button>
    </>}>
      <Field label="Kościół">
        <select value={f.tenant_id} onChange={(e) => {
          const t = tenants.find((x) => x.id === e.target.value);
          set('tenant_id', e.target.value);
          if (t) { set('buyer_name', t.company_name || t.name); set('buyer_email', t.email || ''); }
        }}>
          <option value="">— wybierz —</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}{t.plan_name ? ` · ${t.plan_name}` : ''}</option>)}
        </select>
      </Field>
      <div className="field-row">
        <Field label="Nabywca"><input value={f.buyer_name} onChange={(e) => set('buyer_name', e.target.value)} /></Field>
        <Field label="E-mail nabywcy"><input type="email" value={f.buyer_email} onChange={(e) => set('buyer_email', e.target.value)} /></Field>
      </div>
      <Field label="Kwota">
        <Segmented label="Sposób wyliczenia kwoty" value={mode} onChange={setMode} items={[
          { value: 'subscription', label: 'Z subskrypcji' },
          { value: 'gross', label: 'Kwota brutto' },
          { value: 'net', label: 'Kwota netto' },
        ]} />
      </Field>
      {mode === 'subscription' ? (
        <Notice tone="info">Kwota i pozycja z aktywnej subskrypcji kościoła: cena indywidualna, a jeśli jej nie ma — cena planu dla cyklu (miesięcznego lub rocznego). Dla planu z wyceną indywidualną bez ustalonej ceny API odmówi.</Notice>
      ) : (
        <div className="field-row">
          <Field label={mode === 'gross' ? 'Kwota brutto' : 'Kwota netto'} hint={amountHint}>
            <AffixInput affix="zł" inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} />
          </Field>
          <Field label="Opis pozycji"><input value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        </div>
      )}
      <Field label="Termin płatności"><input type="date" value={f.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

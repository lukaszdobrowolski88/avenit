import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, formatPLN } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

// Klucze modułów systemowych (do przełączania per tenant).
const MODULE_KEYS = [
  'dashboard', 'programs', 'calendar', 'members', 'worship', 'media', 'atmosfera',
  'kids', 'homegroups', 'finance', 'teaching', 'prayer', 'komunikator',
  'mlodziezowka', 'mailing', 'mail', 'forms', 'push_campaigns', 'sms_campaigns', 'settings',
];

export default function TenantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [plans, setPlans] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.tenant(id).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.plans().then((r) => setPlans(r.plans)); }, [id]);

  if (err) return <div className="err">{err}</div>;
  if (!data) return <div>Ładowanie…</div>;
  const { tenant, subscription, invoices, modules, usage } = data;
  const disabled = new Set(modules.filter((m) => !m.is_enabled).map((m) => m.module_key));

  const act = async (fn, okMsg) => {
    try { await fn(); setMsg(okMsg); load(); setTimeout(() => setMsg(''), 2500); }
    catch (e) { setErr(e.message); }
  };

  const toggleModule = async (key) => {
    const nowEnabled = disabled.has(key); // był wyłączony → włączamy
    await act(() => api.toggleModule(id, key, nowEnabled), 'Zapisano moduł');
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="h1">{tenant.name} <span className={`badge ${tenant.status}`}>{tenant.status}</span></h1>
        <button className="ghost" onClick={() => navigate('/tenants')}>← Wróć</button>
      </div>
      {msg && <div style={{ color: 'var(--green)', marginBottom: 12 }}>{msg}</div>}

      <div className="cards">
        <div className="card"><div className="label">Subdomena</div><div className="value" style={{ fontSize: 18 }}>{tenant.subdomain}</div></div>
        <div className="card"><div className="label">Baza</div><div className="value" style={{ fontSize: 14 }}>{tenant.db_name}</div></div>
        <div className="card"><div className="label">Plan</div><div className="value" style={{ fontSize: 18 }}>{subscription?.plan_name || '—'}</div></div>
        {usage && <>
          <div className="card"><div className="label">Członkowie</div><div className="value">{usage.members}</div></div>
          <div className="card"><div className="label">Użytkownicy</div><div className="value">{usage.users}</div></div>
          <div className="card"><div className="label">Grupy</div><div className="value">{usage.groups}</div></div>
        </>}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {tenant.status === 'suspended'
          ? <button onClick={() => act(() => api.resumeTenant(id), 'Wznowiono')}>Wznów</button>
          : <button className="danger" onClick={() => act(() => api.suspendTenant(id), 'Zawieszono')}>Zawieś</button>}
        <button className="ghost" onClick={() => act(() => api.extendTrial(id, 14), 'Trial przedłużony o 14 dni')}>+14 dni trial</button>
        <ChangePlan tenantId={id} plans={plans} onDone={() => act(async () => {}, 'Zmieniono plan')} />
        <Impersonate tenantId={id} subdomain={tenant.subdomain} onError={setErr} />
        <TenantEmail tenantId={id} tenantName={tenant.name} onDone={() => setMsg('E-mail wysłany')} onError={setErr} />
      </div>

      <h3>Moduły (per tenant)</h3>
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {MODULE_KEYS.map((key) => {
          const on = !disabled.has(key);
          return (
            <div key={key} className="card toggle" onClick={() => toggleModule(key)}
                 style={{ cursor: 'pointer', borderColor: on ? 'var(--green)' : 'var(--red)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span>{key}</span>
                <span className={`badge ${on ? 'active' : 'suspended'}`}>{on ? 'ON' : 'OFF'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 28 }}>Faktury</h3>
      <table>
        <thead><tr><th>Numer</th><th>Kwota</th><th>Status</th><th>Termin</th></tr></thead>
        <tbody>
          {invoices.length === 0 && <tr><td colSpan={4} className="muted">Brak faktur</td></tr>}
          {invoices.map((i) => (
            <tr key={i.id}>
              <td>{i.invoice_number}</td><td>{formatPLN(i.total)}</td>
              <td><span className={`badge ${i.status}`}>{i.status}</span></td>
              <td className="muted">{i.due_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Impersonate({ tenantId, subdomain, onError }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const openPicker = async () => {
    setOpen(true);
    try { const r = await api.tenantUsers(tenantId); setUsers(r.users || []); }
    catch (e) { onError(e.message); setOpen(false); }
  };

  const go = async (userId) => {
    setLoading(true);
    try {
      const r = await api.impersonate(tenantId, userId);
      if (r.redirect) window.open(r.redirect, '_blank');
      setOpen(false);
    } catch (e) { onError(e.message); } finally { setLoading(false); }
  };

  const [resetInfo, setResetInfo] = useState(null);
  const resetPass = async (userId) => {
    if (!confirm('Zresetować hasło tego konta? Zostanie wygenerowane nowe.')) return;
    try { const r = await api.resetUserPassword(tenantId, userId); setResetInfo(r); }
    catch (e) { onError(e.message); }
  };

  return (
    <>
      <button className="ghost" onClick={openPicker}>Zaloguj się jako →</button>
      {open && (
        <Modal title="Konta użytkowników" onClose={() => { setOpen(false); setResetInfo(null); }}>
          {resetInfo ? (
            <div>
              <p>Nowe hasło dla <b>{resetInfo.email}</b>:</p>
              <div style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, fontFamily: 'monospace', fontSize: 16, margin: '10px 0', userSelect: 'all' }}>{resetInfo.password}</div>
              <p className="muted" style={{ fontSize: 13 }}>Przekaż je użytkownikowi bezpiecznym kanałem — nie pokażemy go ponownie.</p>
              <button onClick={() => setResetInfo(null)} style={{ marginTop: 10 }}>OK</button>
            </div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                „Wejdź" otworzy nową kartę zalogowaną jako to konto w <b>{subdomain}.avenit.pl</b> (bilet jednorazowy 60 s).
              </p>
              {users.length === 0 && <div className="muted">Ładowanie / brak kont…</div>}
              <div style={{ maxHeight: 340, overflow: 'auto' }}>
                {users.map((u) => (
                  <div key={u.id} className="row" style={{ justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, opacity: u.is_active ? 1 : 0.5 }}>
                    <div>
                      <div>{u.full_name || u.email} {u.is_super_admin && <span className="badge active" style={{ marginLeft: 6 }}>admin</span>}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{u.email} · {u.role}</div>
                    </div>
                    <div className="row">
                      <button className="ghost" onClick={() => resetPass(u.id)} title="Reset hasła">🔑</button>
                      <button disabled={loading || !u.is_active} onClick={() => go(u.id)}>Wejdź</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function TenantEmail({ tenantId, tenantName, onDone, onError }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const send = async () => {
    setSending(true);
    try { await api.emailTenant(tenantId, f); setOpen(false); setF({ subject: '', body: '' }); onDone(); }
    catch (e) { onError(e.message); } finally { setSending(false); }
  };
  return (
    <>
      <button className="ghost" onClick={() => setOpen(true)}>Wyślij e-mail</button>
      {open && (
        <Modal title={`E-mail do: ${tenantName}`} onClose={() => setOpen(false)}>
          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Trafi do administratorów tego kościoła.</p>
          <label>Temat</label>
          <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          <label>Treść</label>
          <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={5}
            style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }} />
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="ghost" onClick={() => setOpen(false)}>Anuluj</button>
            <button onClick={send} disabled={sending || !f.subject || !f.body}>{sending ? 'Wysyłanie…' : 'Wyślij'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ChangePlan({ tenantId, plans, onDone }) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const save = async () => { await api.changePlan(tenantId, planId, cycle); setOpen(false); onDone(); };
  return (
    <>
      <button className="ghost" onClick={() => setOpen(true)}>Zmień plan</button>
      {open && (
        <Modal title="Zmień plan" onClose={() => setOpen(false)}>
          <label>Plan</label>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">— wybierz —</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPLN(p.price_monthly)}/mc)</option>)}
          </select>
          <label>Cykl</label>
          <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
            <option value="monthly">Miesięczny</option>
            <option value="yearly">Roczny</option>
          </select>
          <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="ghost" onClick={() => setOpen(false)}>Anuluj</button>
            <button onClick={save} disabled={!planId}>Zapisz</button>
          </div>
        </Modal>
      )}
    </>
  );
}

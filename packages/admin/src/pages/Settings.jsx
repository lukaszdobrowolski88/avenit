import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Settings() {
  const [admins, setAdmins] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api.admins().then((r) => setAdmins(r.admins));
  useEffect(() => {
    load();
    api.integrationsStatus().then((r) => setIntegrations(r.integrations)).catch(() => {});
  }, []);

  const runDunning = async () => {
    setMsg('Uruchamiam windykację…');
    try { const r = await api.runDunning(); setMsg(`Windykacja: ${r.results.emailsSent} maili, ${r.results.accountsSuspended} zawieszeń.`); }
    catch (e) { setMsg('Błąd: ' + e.message); }
  };

  const exportCsv = async () => {
    const { tenants } = await api.tenants();
    const rows = [['Nazwa', 'Subdomena', 'Status', 'Plan', 'E-mail', 'Utworzono']];
    tenants.forEach((t) => rows.push([t.name, t.subdomain, t.status, t.plan_name || '', t.email, t.created_at?.slice(0, 10) || '']));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'avenit-tenanci.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h1 className="h1">Ustawienia platformy</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Integracje usług</h3>
        <p className="muted" style={{ marginBottom: 12 }}>Status konfiguracji usług zewnętrznych (z pliku .env na serwerze).</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {integrations.map((i) => (
            <div key={i.key} className="row" style={{ justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>{i.label}</span>
              <span className={`badge ${i.configured ? 'active' : 'suspended'}`}>{i.configured ? 'skonfigurowane' : 'brak'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Komunikacja i dane</h3>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowBroadcast(true)}>Wyślij e-mail do wszystkich</button>
          <button className="ghost" onClick={exportCsv}>Eksport tenantów (CSV)</button>
          <button className="ghost" onClick={runDunning}>Uruchom windykację</button>
        </div>
        {msg && <div style={{ marginTop: 10, color: 'var(--green)' }}>{msg}</div>}
      </div>

      <div className="toolbar">
        <h3>Administratorzy platformy</h3>
        <button onClick={() => setShowNew(true)}>+ Nowy administrator</button>
      </div>
      <table>
        <thead><tr><th>E-mail</th><th>Imię</th><th>2FA</th><th>Aktywny</th><th>Ostatnie logowanie</th></tr></thead>
        <tbody>
          {admins.map((a) => (
            <tr key={a.id}>
              <td>{a.email}</td><td>{a.full_name || '—'}</td>
              <td>{a.totp_enabled ? '✓' : '—'}</td><td>{a.is_active ? '✓' : '—'}</td>
              <td className="muted">{a.last_login_at ? new Date(a.last_login_at).toLocaleString('pl-PL') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {showNew && <NewAdmin onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); }} />}
      {showBroadcast && <Broadcast onClose={() => setShowBroadcast(false)} onSent={(n) => { setShowBroadcast(false); setMsg(`Wysłano do ${n} odbiorców.`); }} />}
    </div>
  );
}

function Broadcast({ onClose, onSent }) {
  const [f, setF] = useState({ subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const send = async () => {
    setSending(true); setErr('');
    try { const r = await api.broadcastEmail(f); onSent(r.sent); }
    catch (e) { setErr(e.message); setSending(false); }
  };
  return (
    <Modal title="E-mail do wszystkich kościołów" onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Trafi do administratorów wszystkich aktywnych kościołów.</p>
      <label>Temat</label>
      <input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
      <label>Treść</label>
      <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={6}
        style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={send} disabled={sending || !f.subject || !f.body}>{sending ? 'Wysyłanie…' : 'Wyślij do wszystkich'}</button>
      </div>
    </Modal>
  );
}

function NewAdmin({ onClose, onCreated }) {
  const [f, setF] = useState({ email: '', full_name: '', password: '' });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const create = async () => {
    setErr('');
    try { await api.createAdmin(f); onCreated(); } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title="Nowy administrator platformy" onClose={onClose}>
      <label>E-mail</label><input value={f.email} onChange={(e) => set('email', e.target.value)} />
      <label>Imię i nazwisko</label><input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
      <label>Hasło (min. 8 znaków)</label><input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={create} disabled={!f.email || f.password.length < 8}>Utwórz</button>
      </div>
    </Modal>
  );
}

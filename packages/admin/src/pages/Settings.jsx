import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

export default function Settings() {
  const [admins, setAdmins] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState('');
  const load = () => api.admins().then((r) => setAdmins(r.admins));
  useEffect(() => { load(); }, []);

  const runDunning = async () => {
    setMsg('Uruchamiam windykację…');
    try { const r = await api.runDunning(); setMsg(`Windykacja: ${r.results.emailsSent} maili, ${r.results.accountsSuspended} zawieszeń.`); }
    catch (e) { setMsg('Błąd: ' + e.message); }
  };

  return (
    <div>
      <h1 className="h1">Ustawienia platformy</h1>

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Windykacja</h3>
        <p className="muted">Ręczne uruchomienie procesu windykacji zaległych faktur (normalnie codziennie przez workera).</p>
        <button onClick={runDunning}>Uruchom teraz</button>
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
    </div>
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

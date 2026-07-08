import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

const LEVELS = {
  info: { label: 'Informacja', badge: 'trial' },
  success: { label: 'Sukces', badge: 'active' },
  warning: { label: 'Ostrzeżenie', badge: 'pending' },
  critical: { label: 'Krytyczne', badge: 'suspended' },
};

export default function Announcements() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = () => api.announcements().then((r) => setItems(r.announcements));
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!confirm('Usunąć ogłoszenie?')) return;
    await api.deleteAnnouncement(id); load();
  };

  return (
    <div>
      <div className="toolbar">
        <h1 className="h1">Ogłoszenia systemowe</h1>
        <button onClick={() => setEdit({})}>+ Nowe ogłoszenie</button>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>Aktywne ogłoszenia wyświetlają się jako baner we wszystkich kościołach.</p>
      <table>
        <thead><tr><th>Tytuł</th><th>Typ</th><th>Aktywne</th><th>Okres</th><th></th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={5} className="muted">Brak ogłoszeń</td></tr>}
          {items.map((a) => (
            <tr key={a.id}>
              <td><b>{a.title}</b>{a.body && <div className="muted" style={{ fontSize: 12 }}>{a.body.slice(0, 60)}</div>}</td>
              <td><span className={`badge ${LEVELS[a.level]?.badge || 'trial'}`}>{LEVELS[a.level]?.label || a.level}</span></td>
              <td>{a.is_active ? '✓' : '—'}</td>
              <td className="muted" style={{ fontSize: 12 }}>
                {a.starts_at ? new Date(a.starts_at).toLocaleDateString('pl-PL') : '—'} → {a.ends_at ? new Date(a.ends_at).toLocaleDateString('pl-PL') : '∞'}
              </td>
              <td className="row">
                <button className="ghost" onClick={() => setEdit(a)}>Edytuj</button>
                <button className="danger" onClick={() => remove(a.id)}>Usuń</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && <Form item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

function Form({ item, onClose, onSaved }) {
  const [f, setF] = useState({
    title: item.title || '', body: item.body || '', level: item.level || 'info',
    is_active: item.is_active !== false,
    starts_at: item.starts_at ? item.starts_at.slice(0, 10) : '',
    ends_at: item.ends_at ? item.ends_at.slice(0, 10) : '',
  });
  const [err, setErr] = useState('');
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    setErr('');
    const body = { ...f, starts_at: f.starts_at || null, ends_at: f.ends_at || null };
    try {
      if (item.id) await api.updateAnnouncement(item.id, body); else await api.createAnnouncement(body);
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={item.id ? 'Edytuj ogłoszenie' : 'Nowe ogłoszenie'} onClose={onClose}>
      <label>Tytuł</label><input value={f.title} onChange={(e) => set('title', e.target.value)} />
      <label>Treść</label>
      <textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={3}
        style={{ width: '100%', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }} />
      <label>Typ</label>
      <select value={f.level} onChange={(e) => set('level', e.target.value)}>
        {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <div className="row">
        <div style={{ flex: 1 }}><label>Od (opcjonalnie)</label><input type="date" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></div>
        <div style={{ flex: 1 }}><label>Do (opcjonalnie)</label><input type="date" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></div>
      </div>
      <label className="row" style={{ marginTop: 12 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Aktywne
      </label>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save} disabled={!f.title}>Zapisz</button>
      </div>
    </Modal>
  );
}

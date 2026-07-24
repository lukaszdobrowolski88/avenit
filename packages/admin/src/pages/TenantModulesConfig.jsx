import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { Modal } from './Tenants.jsx';

// Zdalne zarządzanie modułami/zakładkami/rolami tenanta z panelu admina.
export default function TenantModulesConfig({ tenantId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [editMod, setEditMod] = useState(null);   // {} = nowy, obiekt = edycja
  const [editTab, setEditTab] = useState(null);    // { module_id } dla nowej
  const [cfgMod, setCfgMod] = useState(null);      // moduł do edycji configu
  const [expanded, setExpanded] = useState(() => new Set());

  const load = () => api.tenantConfig(tenantId).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tenantId]);
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2000); };
  const act = async (fn, ok) => { setErr(''); try { await fn(); await load(); if (ok) flash(ok); } catch (e) { setErr(e.message); } };

  if (!data) return <div className="muted">Ładowanie konfiguracji…</div>;
  const { tenantModules, modules, tabs, roles } = data;
  const tmByKey = Object.fromEntries((tenantModules || []).map((t) => [t.module_key, t]));
  const platformEnabled = (m) => tmByKey[m.key]?.is_enabled !== false; // domyślnie włączony

  return (
    <div style={{ marginTop: 24 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Moduły i zakładki tenanta</h3>
        <div className="row" style={{ gap: 8 }}>
          <button className="ghost" onClick={() => act(() => api.applyPreset(tenantId), 'Przywrócono role i uprawnienia')
            }>Przywróć domyślne role/uprawnienia</button>
          <button onClick={() => setEditMod({})}>+ Moduł</button>
        </div>
      </div>
      {msg && <div style={{ color: 'var(--green)', margin: '8px 0' }}>{msg}</div>}
      {err && <div className="err" style={{ margin: '8px 0' }}>{err}</div>}

      <table style={{ marginTop: 8 }}>
        <thead><tr><th>Moduł</th><th>Klucz</th><th>Systemowy</th><th>Włączony (platforma)</th><th></th></tr></thead>
        <tbody>
          {modules.map((m) => {
            const open = expanded.has(m.id);
            const mTabs = tabs.filter((t) => t.module_id === m.id);
            return (
              <React.Fragment key={m.id}>
                <tr>
                  <td>
                    <button className="ghost" style={{ padding: '2px 6px', marginRight: 4 }}
                      onClick={() => setExpanded((p) => { const n = new Set(p); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n; })}>
                      {open ? '▾' : '▸'}
                    </button>
                    <b>{m.label}</b>
                  </td>
                  <td className="muted" style={{ fontFamily: 'monospace' }}>{m.key}</td>
                  <td>{m.is_system ? '✓' : '—'}</td>
                  <td>
                    <button className="ghost" style={{ padding: '2px 8px' }}
                      onClick={() => act(() => api.toggleModule(tenantId, m.key, !platformEnabled(m)), 'Zapisano')}>
                      {platformEnabled(m) ? '✓' : '—'}
                    </button>
                  </td>
                  <td className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <button className="ghost" onClick={() => setCfgMod(m)}>Config</button>
                    <button className="ghost" onClick={() => setEditMod(m)}>Edytuj</button>
                    {!m.is_system && <button className="ghost danger" onClick={() => act(() => api.deleteAppModule(tenantId, m.id), 'Usunięto')}>Usuń</button>}
                  </td>
                </tr>
                {open && (
                  <tr><td colSpan={5} style={{ background: 'var(--bg)', padding: '8px 16px' }}>
                    <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="muted">Zakładki</span>
                      <button className="ghost" onClick={() => setEditTab({ module_id: m.id })}>+ Zakładka</button>
                    </div>
                    {mTabs.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Brak zakładek</div>}
                    {mTabs.map((t) => (
                      <div key={t.id} className="row" style={{ justifyContent: 'space-between', padding: '3px 0' }}>
                        <span>{t.label} <span className="muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.key}</span>{t.is_system && ' ·sys'}</span>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="ghost" onClick={() => setEditTab(t)}>Edytuj</button>
                          {!t.is_system && <button className="ghost danger" onClick={() => act(() => api.deleteAppTab(tenantId, t.id), 'Usunięto')}>Usuń</button>}
                        </div>
                      </div>
                    ))}
                  </td></tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Role tenanta: {roles.map((r) => r.label).join(', ') || '—'}</div>

      {editMod && <ModuleForm tenantId={tenantId} module={editMod} onClose={() => setEditMod(null)} onSaved={() => { setEditMod(null); load(); }} />}
      {editTab && <TabForm tenantId={tenantId} tab={editTab} onClose={() => setEditTab(null)} onSaved={() => { setEditTab(null); load(); }} />}
      {cfgMod && <ConfigForm tenantId={tenantId} module={cfgMod} value={tmByKey[cfgMod.key]?.config} enabled={platformEnabled(cfgMod)} onClose={() => setCfgMod(null)} onSaved={() => { setCfgMod(null); load(); }} />}
    </div>
  );
}

function ModuleForm({ tenantId, module, onClose, onSaved }) {
  const [f, setF] = useState({ key: module.key || '', label: module.label || '', icon: module.icon || 'Square', display_order: module.display_order ?? 0 });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      if (module.id) await api.updateAppModule(tenantId, module.id, { label: f.label, icon: f.icon, display_order: Number(f.display_order) });
      else await api.createAppModule(tenantId, { key: f.key, label: f.label, icon: f.icon, display_order: Number(f.display_order) });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={module.id ? 'Edytuj moduł' : 'Nowy moduł'} onClose={onClose}>
      {!module.id && (<><label>Klucz</label><input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="np. wolontariat" /></>)}
      <label>Nazwa</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
      <label>Ikona (lucide)</label><input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} />
      <label>Kolejność</label><input type="number" value={f.display_order} onChange={(e) => setF({ ...f, display_order: e.target.value })} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save} disabled={!f.label || (!module.id && !f.key)}>Zapisz</button>
      </div>
    </Modal>
  );
}

function TabForm({ tenantId, tab, onClose, onSaved }) {
  const [f, setF] = useState({ key: tab.key || '', label: tab.label || '', icon: tab.icon || 'Square', display_order: tab.display_order ?? 0 });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      if (tab.id) await api.updateAppTab(tenantId, tab.id, { label: f.label, icon: f.icon, display_order: Number(f.display_order) });
      else await api.createAppTab(tenantId, { module_id: tab.module_id, key: f.key, label: f.label, icon: f.icon, display_order: Number(f.display_order) });
      onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={tab.id ? 'Edytuj zakładkę' : 'Nowa zakładka'} onClose={onClose}>
      {!tab.id && (<><label>Klucz</label><input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} /></>)}
      <label>Nazwa</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
      <label>Ikona</label><input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} />
      <label>Kolejność</label><input type="number" value={f.display_order} onChange={(e) => setF({ ...f, display_order: e.target.value })} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save} disabled={!f.label || (!tab.id && !f.key)}>Zapisz</button>
      </div>
    </Modal>
  );
}

function ConfigForm({ tenantId, module, value, enabled, onClose, onSaved }) {
  const [text, setText] = useState(JSON.stringify(value || {}, null, 2));
  const [en, setEn] = useState(enabled);
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    let cfg;
    try { cfg = text.trim() ? JSON.parse(text) : {}; } catch { setErr('Nieprawidłowy JSON'); return; }
    try { await api.saveModuleConfig(tenantId, module.key, { is_enabled: en, config: cfg }); onSaved(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <Modal title={`Konfiguracja: ${module.label}`} onClose={onClose}>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={en} onChange={(e) => setEn(e.target.checked)} /> Włączony (platforma)</label>
      <label style={{ marginTop: 10 }}>Config (JSON — limity/ustawienia modułu)</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} style={{ fontFamily: 'monospace', width: '100%' }} />
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button className="ghost" onClick={onClose}>Anuluj</button>
        <button onClick={save}>Zapisz</button>
      </div>
    </Modal>
  );
}

import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Button, Modal, Field, Table, Toggle, Badge, SectionHead, Loading, Notice, useToast, EmptyRow } from '../components/ui.jsx';

// Zdalne zarządzanie modułami/zakładkami/rolami tenanta z panelu admina.
export default function TenantModulesConfig({ tenantId }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [editMod, setEditMod] = useState(null);   // {} = nowy, obiekt = edycja
  const [editTab, setEditTab] = useState(null);    // { module_id } dla nowej
  const [cfgMod, setCfgMod] = useState(null);      // moduł do edycji configu
  const [expanded, setExpanded] = useState(() => new Set());
  const [toast, showToast] = useToast();

  const load = () => api.tenantConfig(tenantId).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [tenantId]);
  const act = async (fn, ok) => { setErr(''); try { await fn(); await load(); if (ok) showToast(ok); } catch (e) { setErr(e.message); } };
  const toggleOpen = (mid) => setExpanded((p) => { const n = new Set(p); n.has(mid) ? n.delete(mid) : n.add(mid); return n; });

  const head = (
    <SectionHead
      title="Moduły i zakładki aplikacji"
      subtitle="Konfiguracja nawigacji tenanta: moduły, zakładki, limity w configu."
      actions={data && <>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => confirm('Przywrócić domyślne role i uprawnienia tego kościoła?') && act(() => api.applyPreset(tenantId), 'Przywrócono role i uprawnienia')}>
          Domyślne role/uprawnienia
        </Button>
        <Button size="sm" icon="plus" onClick={() => setEditMod({})}>Moduł</Button>
      </>}
    />
  );

  if (!data) return <>{head}{err ? <Notice tone="danger">{err}</Notice> : <Loading>Ładowanie konfiguracji…</Loading>}</>;
  const { tenantModules, modules, tabs, roles } = data;
  const tmByKey = Object.fromEntries((tenantModules || []).map((t) => [t.module_key, t]));
  const platformEnabled = (m) => tmByKey[m.key]?.is_enabled !== false; // domyślnie włączony

  return (
    <div>
      {head}
      {err && <Notice tone="danger">{err}</Notice>}

      <Table minWidth={640}>
        <thead><tr><th>Moduł</th><th>Klucz</th><th>Włączony</th><th></th></tr></thead>
        <tbody>
          {modules.length === 0 && <EmptyRow colSpan={4}>Brak modułów</EmptyRow>}
          {modules.map((m) => {
            const open = expanded.has(m.id);
            const mTabs = tabs.filter((t) => t.module_id === m.id);
            return (
              <React.Fragment key={m.id}>
                <tr>
                  <td>
                    <button className="back-link" style={{ margin: 0, color: 'var(--text)' }} onClick={() => toggleOpen(m.id)} aria-expanded={open}>
                      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={16} />
                      <span className="strong">{m.label}</span>
                      <span className="muted small">&nbsp;{mTabs.length} zakł.</span>
                    </button>
                    {m.is_system && <> <Badge size="sm">systemowy</Badge></>}
                  </td>
                  <td className="mono muted">{m.key}</td>
                  <td>
                    <Toggle checked={platformEnabled(m)} title={`${m.label}: ${platformEnabled(m) ? 'wyłącz' : 'włącz'}`}
                      onChange={(v) => act(() => api.toggleModule(tenantId, m.key, v), 'Zapisano')} />
                  </td>
                  <td className="actions">
                    <Button size="sm" variant="ghost" onClick={() => setCfgMod(m)}>Config</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditMod(m)}>Edytuj</Button>
                    {!m.is_system && <Button size="sm" variant="danger" onClick={() => confirm(`Usunąć moduł „${m.label}”?`) && act(() => api.deleteAppModule(tenantId, m.id), 'Usunięto')}>Usuń</Button>}
                  </td>
                </tr>
                {open && (
                  <tr className="row-sub"><td colSpan={4} style={{ padding: '10px 14px 12px 40px' }}>
                    <div className="row row--between" style={{ marginBottom: 6 }}>
                      <span className="small strong muted">Zakładki</span>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => setEditTab({ module_id: m.id })}>Zakładka</Button>
                    </div>
                    {mTabs.length === 0 && <div className="muted small">Brak zakładek</div>}
                    <div className="list">
                      {mTabs.map((t) => (
                        <div key={t.id} className="list-row" style={{ padding: '6px 10px' }}>
                          <span>{t.label} <span className="mono muted small">{t.key}</span>{t.is_system && <> <Badge size="sm">sys</Badge></>}</span>
                          <span className="row">
                            <Button size="sm" variant="ghost" onClick={() => setEditTab(t)}>Edytuj</Button>
                            {!t.is_system && <Button size="sm" variant="danger" onClick={() => confirm(`Usunąć zakładkę „${t.label}”?`) && act(() => api.deleteAppTab(tenantId, t.id), 'Usunięto')}>Usuń</Button>}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>

      <div className="muted small" style={{ marginTop: 10 }}>Role tenanta: {roles.map((r) => r.label).join(', ') || '—'}</div>

      {editMod && <ModuleForm tenantId={tenantId} module={editMod} onClose={() => setEditMod(null)} onSaved={() => { setEditMod(null); load(); showToast('Zapisano moduł'); }} />}
      {editTab && <TabForm tenantId={tenantId} tab={editTab} onClose={() => setEditTab(null)} onSaved={() => { setEditTab(null); load(); showToast('Zapisano zakładkę'); }} />}
      {cfgMod && <ConfigForm tenantId={tenantId} module={cfgMod} value={tmByKey[cfgMod.key]?.config} enabled={platformEnabled(cfgMod)} onClose={() => setCfgMod(null)} onSaved={() => { setCfgMod(null); load(); showToast('Zapisano konfigurację'); }} />}
      {toast}
    </div>
  );
}

function FormFooter({ onClose, onSave, disabled }) {
  return <>
    <Button variant="ghost" onClick={onClose}>Anuluj</Button>
    <Button variant="primary" onClick={onSave} disabled={disabled}>Zapisz</Button>
  </>;
}

const keyClean = (v) => v.toLowerCase().replace(/[^a-z0-9_]/g, '');

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
    <Modal title={module.id ? 'Edytuj moduł' : 'Nowy moduł'} onClose={onClose}
      footer={<FormFooter onClose={onClose} onSave={save} disabled={!f.label || (!module.id && !f.key)} />}>
      {!module.id && <Field label="Klucz"><input value={f.key} onChange={(e) => setF({ ...f, key: keyClean(e.target.value) })} placeholder="np. wolontariat" /></Field>}
      <Field label="Nazwa"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="field-row">
        <Field label="Ikona" hint="Nazwa ikony lucide, np. Users"><input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /></Field>
        <Field label="Kolejność"><input type="number" value={f.display_order} onChange={(e) => setF({ ...f, display_order: e.target.value })} /></Field>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
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
    <Modal title={tab.id ? 'Edytuj zakładkę' : 'Nowa zakładka'} onClose={onClose}
      footer={<FormFooter onClose={onClose} onSave={save} disabled={!f.label || (!tab.id && !f.key)} />}>
      {!tab.id && <Field label="Klucz"><input value={f.key} onChange={(e) => setF({ ...f, key: keyClean(e.target.value) })} /></Field>}
      <Field label="Nazwa"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
      <div className="field-row">
        <Field label="Ikona"><input value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /></Field>
        <Field label="Kolejność"><input type="number" value={f.display_order} onChange={(e) => setF({ ...f, display_order: e.target.value })} /></Field>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
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
    <Modal title={`Konfiguracja: ${module.label}`} onClose={onClose} footer={<FormFooter onClose={onClose} onSave={save} />}>
      <Toggle checked={en} onChange={setEn} label="Moduł włączony" />
      <Field label="Config (JSON)" hint="Limity i ustawienia modułu.">
        <textarea className="mono" value={text} onChange={(e) => setText(e.target.value)} rows={10} spellCheck={false} />
      </Field>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

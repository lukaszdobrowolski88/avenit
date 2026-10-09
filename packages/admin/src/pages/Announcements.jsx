import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  PageHeader, Button, Badge, Table, EmptyRow, Modal, Field, Toggle, Segmented, Loading, ErrorBox, useToast,
} from '../components/ui.jsx';

const LEVELS = {
  info: { label: 'Informacja', tone: 'info' },
  success: { label: 'Sukces', tone: 'success' },
  warning: { label: 'Ostrzeżenie', tone: 'warning' },
  critical: { label: 'Krytyczne', tone: 'danger' },
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString('pl-PL') : '');

export default function Announcements() {
  const [items, setItems] = useState(null);
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState('');
  const [toast, showToast] = useToast();
  const load = () => api.announcements().then((r) => setItems(r.announcements)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!confirm(`Usunąć ogłoszenie „${a.title}”?`)) return;
    try { await api.deleteAnnouncement(a.id); load(); showToast('Ogłoszenie usunięte'); } catch (e) { showToast(e.message, 'error'); }
  };
  const toggle = async (a) => {
    try { await api.updateAnnouncement(a.id, { ...a, is_active: !a.is_active }); load(); } catch (e) { showToast(e.message, 'error'); }
  };

  return (
    <div>
      <PageHeader
        title="Ogłoszenia"
        subtitle="Aktywne ogłoszenia wyświetlają się jako baner we wszystkich kościołach."
        actions={<Button variant="primary" icon="plus" onClick={() => setEdit({})}>Nowe ogłoszenie</Button>}
      />
      <ErrorBox error={err} onRetry={load} />
      {!items && !err ? <Loading /> : (
        <Table minWidth={680}>
          <thead><tr><th>Ogłoszenie</th><th>Typ</th><th>Okres</th><th>Aktywne</th><th></th></tr></thead>
          <tbody>
            {(items || []).length === 0 && <EmptyRow colSpan={5}>Brak ogłoszeń</EmptyRow>}
            {(items || []).map((a) => (
              <tr key={a.id}>
                <td style={{ maxWidth: 420 }}>
                  <span className="primary-cell">{a.title}</span>
                  {a.body && <span className="sub ellipsis">{a.body}</span>}
                </td>
                <td><Badge tone={LEVELS[a.level]?.tone || 'neutral'}>{LEVELS[a.level]?.label || a.level}</Badge></td>
                <td className="muted tnum nowrap">{a.starts_at || a.ends_at ? `${fmt(a.starts_at) || 'od teraz'} → ${fmt(a.ends_at) || 'bez końca'}` : 'zawsze'}</td>
                <td><Toggle checked={a.is_active} onChange={() => toggle(a)} title={a.is_active ? 'Wyłącz' : 'Włącz'} /></td>
                <td className="actions">
                  <Button size="sm" variant="ghost" onClick={() => setEdit(a)}>Edytuj</Button>
                  <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(a)} aria-label="Usuń" title="Usuń" />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {edit && <Form item={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); showToast('Zapisano ogłoszenie'); }} />}
      {toast}
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
    <Modal title={item.id ? 'Edytuj ogłoszenie' : 'Nowe ogłoszenie'} onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button variant="primary" onClick={save} disabled={!f.title}>Zapisz</Button>
    </>}>
      <Field label="Tytuł"><input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Treść"><textarea value={f.body} onChange={(e) => set('body', e.target.value)} rows={3} /></Field>
      <Field label="Typ">
        <Segmented label="Typ" value={f.level} onChange={(v) => set('level', v)}
          items={Object.entries(LEVELS).map(([k, v]) => ({ value: k, label: v.label }))} />
      </Field>
      <div className="field-row">
        <Field label="Od" hint="Opcjonalnie"><input type="date" value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></Field>
        <Field label="Do" hint="Opcjonalnie"><input type="date" value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
      </div>
      <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label="Aktywne" />
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

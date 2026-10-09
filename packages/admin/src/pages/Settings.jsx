import React, { useEffect, useMemo, useState } from 'react';
import qrcode from 'qrcode-generator';
import { api } from '../lib/api.js';
import {
  PageHeader, Button, Badge, Card, Table, EmptyRow, Modal, Field, Notice, SectionHead, Loading, useToast,
} from '../components/ui.jsx';

// Generuje QR (data-URL GIF) po stronie klienta — sekret 2FA nie opuszcza przeglądarki.
function otpauthQr(url) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return qr.createDataURL(5, 12);
  } catch { return null; }
}

const yes = (v, on = 'tak', off = 'nie') => (v ? <Badge tone="success" size="sm">{on}</Badge> : <Badge size="sm">{off}</Badge>);

export default function Settings() {
  const [admins, setAdmins] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [busy, setBusy] = useState('');
  const [toast, showToast] = useToast();
  const load = () => api.admins().then((r) => setAdmins(r.admins)).catch((e) => showToast(e.message, 'error'));
  useEffect(() => {
    load();
    api.integrationsStatus().then((r) => setIntegrations(r.integrations)).catch(() => setIntegrations([]));
  }, []);

  const runDunning = async () => {
    if (!confirm('Uruchomić windykację teraz? Wyśle przypomnienia o zaległych fakturach i może zawiesić konta.')) return;
    setBusy('dunning');
    try { const r = await api.runDunning(); showToast(`Windykacja: ${r.results.emailsSent} maili, ${r.results.accountsSuspended} zawieszeń`); }
    catch (e) { showToast(e.message, 'error'); } finally { setBusy(''); }
  };

  const exportCsv = async () => {
    setBusy('csv');
    try {
      const { tenants } = await api.tenants();
      const rows = [['Nazwa', 'Subdomena', 'Status', 'Plan', 'E-mail', 'Utworzono']];
      tenants.forEach((t) => rows.push([t.name, t.subdomain, t.status, t.plan_name || '', t.email, t.created_at?.slice(0, 10) || '']));
      const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = 'avenit-tenanci.csv'; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { showToast(e.message, 'error'); } finally { setBusy(''); }
  };

  return (
    <div>
      <PageHeader title="Ustawienia" subtitle="Bezpieczeństwo konta, integracje i administratorzy platformy." />

      <div className="grid2 mb">
        <TwoFactor />
        <Card title="Komunikacja i dane">
          <div className="stack" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Button variant="primary" icon="mail" onClick={() => setShowBroadcast(true)}>Wyślij e-mail do wszystkich kościołów</Button>
            <Button icon="download" onClick={exportCsv} loading={busy === 'csv'}>Eksport kościołów (CSV)</Button>
            <Button icon="receipt" onClick={runDunning} loading={busy === 'dunning'}>Uruchom windykację</Button>
          </div>
        </Card>
      </div>

      <Card title="Integracje usług" subtitle="Konfiguracja usług zewnętrznych z pliku .env na serwerze." className="mb">
        {integrations === null && <Loading />}
        {integrations && integrations.length === 0 && <div className="muted small">Brak danych.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {(integrations || []).map((i) => (
            <div key={i.key} className="module-tile" style={{ cursor: 'default' }}>
              <span>{i.label}</span>
              {i.configured ? <Badge tone="success" size="sm">skonfigurowane</Badge> : <Badge tone="warning" size="sm">brak</Badge>}
            </div>
          ))}
        </div>
      </Card>

      <SectionHead
        title="Administratorzy platformy"
        actions={<Button size="sm" icon="plus" onClick={() => setShowNew(true)}>Nowy administrator</Button>}
      />
      {!admins ? <Loading /> : (
        <Table minWidth={620}>
          <thead><tr><th>Administrator</th><th>2FA</th><th>Aktywny</th><th>Ostatnie logowanie</th></tr></thead>
          <tbody>
            {admins.length === 0 && <EmptyRow colSpan={4}>Brak</EmptyRow>}
            {admins.map((a) => (
              <tr key={a.id}>
                <td><span className="primary-cell">{a.full_name || a.email}</span>{a.full_name && <span className="sub">{a.email}</span>}</td>
                <td>{yes(a.totp_enabled, 'włączone', 'wyłączone')}</td>
                <td>{yes(a.is_active)}</td>
                <td className="muted tnum">{a.last_login_at ? new Date(a.last_login_at).toLocaleString('pl-PL') : ''}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {showNew && <NewAdmin onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load(); showToast('Administrator dodany'); }} />}
      {showBroadcast && <Broadcast onClose={() => setShowBroadcast(false)} onSent={(n) => { setShowBroadcast(false); showToast(`Wysłano do ${n} odbiorców`); }} />}
      {toast}
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
    <Modal title="E-mail do wszystkich kościołów" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button variant="primary" onClick={send} loading={sending} disabled={!f.subject || !f.body}>Wyślij do wszystkich</Button>
    </>}>
      <Notice tone="warning">Trafi do administratorów wszystkich aktywnych kościołów.</Notice>
      <Field label="Temat"><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
      <Field label="Treść"><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={7} /></Field>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

function TwoFactor() {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, otpauthUrl, backupCodes }
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const qrUrl = useMemo(() => (setup?.otpauthUrl ? otpauthQr(setup.otpauthUrl) : null), [setup]);

  useEffect(() => { api.me().then((r) => setEnabled(!!r.admin?.totp_enabled)).catch(() => {}); }, []);

  const startSetup = async () => {
    setErr(''); setMsg('');
    try { setSetup(await api.twofaSetup()); } catch (e) { setErr(e.message); }
  };
  const enable = async () => {
    setErr('');
    try {
      await api.twofaEnable({ secret: setup.secret, code, backupCodes: setup.backupCodes });
      setEnabled(true); setSetup(null); setCode(''); setMsg('2FA włączone');
    } catch (e) { setErr(e.message); }
  };
  const disable = async () => {
    setErr('');
    try { await api.twofaDisable(code); setEnabled(false); setCode(''); setMsg('2FA wyłączone'); }
    catch (e) { setErr(e.message); }
  };

  return (
    <Card
      title="Weryfikacja dwuetapowa (2FA)"
      actions={enabled === true && !setup ? <Badge tone="success">włączona</Badge> : enabled === false && !setup ? <Badge tone="warning">wyłączona</Badge> : null}
    >
      {enabled === null && <Loading />}

      {enabled === true && !setup && (
        <>
          <p className="muted small">Aby wyłączyć 2FA, wpisz aktualny kod z aplikacji.</p>
          <div className="row">
            <input placeholder="Kod z aplikacji" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 170 }} aria-label="Kod 2FA" />
            <Button variant="danger" onClick={disable} disabled={code.length < 6}>Wyłącz 2FA</Button>
          </div>
        </>
      )}

      {enabled === false && !setup && (
        <>
          <p className="muted small">Zabezpiecz konto kodem z aplikacji Authenticator.</p>
          <Button variant="primary" icon="shield" onClick={startSetup}>Włącz 2FA</Button>
        </>
      )}

      {setup && (
        <div>
          <p className="small strong">1. Zeskanuj kod QR aplikacją Authenticator albo wpisz klucz ręcznie</p>
          {qrUrl && <img src={qrUrl} alt="Kod QR do konfiguracji 2FA" width={170} height={170} className="qr" />}
          <div className="secret">{setup.secret}</div>
          <p className="muted small">Link otpauth: <a href={setup.otpauthUrl} style={{ wordBreak: 'break-all' }}>{setup.otpauthUrl}</a></p>
          <p className="small strong" style={{ marginTop: 12 }}>2. Zapisz kody zapasowe</p>
          <div className="row row--wrap" style={{ gap: 6, marginBottom: 12 }}>
            {setup.backupCodes.map((c) => <span key={c} className="code-chip">{c}</span>)}
          </div>
          <p className="small strong">3. Wpisz kod z aplikacji, aby włączyć</p>
          <div className="row row--wrap">
            <input placeholder="123456" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} style={{ maxWidth: 170 }} aria-label="Kod 2FA" />
            <Button variant="primary" onClick={enable} disabled={code.length < 6}>Włącz</Button>
            <Button variant="ghost" onClick={() => { setSetup(null); setCode(''); }}>Anuluj</Button>
          </div>
        </div>
      )}

      {msg && <Notice tone="success">{msg}</Notice>}
      {err && <div className="err" role="alert">{err}</div>}
    </Card>
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
    <Modal title="Nowy administrator platformy" onClose={onClose} footer={<>
      <Button variant="ghost" onClick={onClose}>Anuluj</Button>
      <Button variant="primary" onClick={create} disabled={!f.email || f.password.length < 8}>Utwórz</Button>
    </>}>
      <Field label="E-mail"><input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
      <Field label="Imię i nazwisko"><input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
      <Field label="Hasło" hint="Co najmniej 8 znaków."><input type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>
      {err && <div className="err" role="alert">{err}</div>}
    </Modal>
  );
}

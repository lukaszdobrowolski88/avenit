import React, { useState } from 'react';
import { api, setToken } from '../lib/api.js';
import { Button, Field } from '../components/ui.jsx';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const res = await api.login(email, password, totpCode || undefined);
      if (res.requires2fa) { setNeeds2fa(true); setLoading(false); return; }
      setToken(res.access_token);
      onLogin(res.admin);
    } catch (e) {
      setErr(e.message); setLoading(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-name">Avenit<span className="brand-sub">Panel platformy</span></span>
        </div>
        <h1 className="login-title">Zaloguj się</h1>
        <p className="muted" style={{ marginBottom: 20 }}>Dostęp tylko dla administratorów platformy.</p>
        <form onSubmit={submit}>
          <Field label="E-mail">
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
          </Field>
          <Field label="Hasło">
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {needs2fa && (
            <Field label="Kod 2FA" hint="Sześć cyfr z aplikacji Authenticator albo kod zapasowy.">
              <input inputMode="numeric" autoComplete="one-time-code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" autoFocus />
            </Field>
          )}
          {err && <div className="err" role="alert">{err}</div>}
          <Button type="submit" variant="primary" block loading={loading} style={{ marginTop: 10, height: 42 }}>
            {loading ? 'Logowanie…' : 'Zaloguj się'}
          </Button>
        </form>
      </div>
    </div>
  );
}

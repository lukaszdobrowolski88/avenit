import React, { useState } from 'react';
import { api, setToken } from '../lib/api.js';

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
    <div className="login">
      <div className="card">
        <div className="brand" style={{ padding: 0, marginBottom: 16 }}>Avenit — panel</div>
        <form onSubmit={submit}>
          <label>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <label>Hasło</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {needs2fa && (
            <>
              <label>Kod 2FA</label>
              <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" autoFocus />
            </>
          )}
          {err && <div className="err">{err}</div>}
          <button style={{ marginTop: 16, width: '100%' }} disabled={loading}>
            {loading ? 'Logowanie…' : 'Zaloguj się'}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

// Globalna wyszukiwarka: kościoły (nazwa/subdomena) + konta (e-mail/imię)
// w poprzek wszystkich tenantów. Kliknięcie przenosi do szczegółów tenanta.
export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const box = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onChange = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes(null); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setRes(await api.search(v)); setOpen(true); } catch { setRes(null); } finally { setLoading(false); }
    }, 300);
  };

  const goTenant = (id) => { setOpen(false); setQ(''); setRes(null); navigate(`/tenants/${id}`); };

  return (
    <div ref={box} style={{ position: 'relative', padding: '0 14px 12px' }}>
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => res && setOpen(true)}
        placeholder="Szukaj kościoła / konta…"
        style={{ fontSize: 13, padding: '8px 11px' }}
      />
      {open && res && (
        <div style={{
          position: 'absolute', top: '100%', left: 14, right: 14, zIndex: 30,
          background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 10px 30px rgba(0,0,0,.4)', maxHeight: 360, overflow: 'auto', marginTop: 2,
        }}>
          {loading && <div className="muted" style={{ padding: 10, fontSize: 13 }}>Szukam…</div>}
          {!loading && res.tenants.length === 0 && res.users.length === 0 && (
            <div className="muted" style={{ padding: 10, fontSize: 13 }}>Brak wyników</div>
          )}
          {res.tenants.length > 0 && (
            <div>
              <div style={{ padding: '8px 10px 4px', fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Kościoły</div>
              {res.tenants.map((t) => (
                <div key={t.id} onClick={() => goTenant(t.id)} className="search-item"
                     style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}>
                  <div>{t.name} <span className={`badge ${t.status}`} style={{ marginLeft: 4, fontSize: 10 }}>{t.status}</span></div>
                  <div className="muted" style={{ fontSize: 11 }}>{t.subdomain}.avenit.pl</div>
                </div>
              ))}
            </div>
          )}
          {res.users.length > 0 && (
            <div>
              <div style={{ padding: '8px 10px 4px', fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>Konta</div>
              {res.users.map((u, i) => (
                <div key={i} onClick={() => goTenant(u.tenant.id)} className="search-item"
                     style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}>
                  <div>{u.full_name || u.email}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{u.email} · {u.tenant.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

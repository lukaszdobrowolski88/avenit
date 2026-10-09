import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { SearchInput, StatusBadge } from './ui.jsx';

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
    return () => { document.removeEventListener('mousedown', onClick); clearTimeout(timer.current); };
  }, []);

  const onChange = (v) => {
    setQ(v);
    clearTimeout(timer.current);
    if (v.trim().length < 2) { setRes(null); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { setRes(await api.search(v)); setOpen(true); } catch { setRes(null); } finally { setLoading(false); }
    }, 300);
  };

  const goTenant = (id) => { setOpen(false); setQ(''); setRes(null); navigate(`/tenants/${id}`); };
  const empty = res && res.tenants.length === 0 && res.users.length === 0;

  return (
    <div ref={box} className="gsearch" onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      <SearchInput
        value={q}
        onChange={onChange}
        onFocus={() => res && setOpen(true)}
        placeholder="Szukaj kościoła lub konta…"
      />
      {open && res && (
        <div className="gsearch-pop" aria-label="Wyniki wyszukiwania">
          {loading && <div className="gsearch-empty">Szukam…</div>}
          {!loading && empty && <div className="gsearch-empty">Brak wyników dla „{q}”</div>}
          {res.tenants.length > 0 && (
            <div>
              <div className="gsearch-section">Kościoły</div>
              {res.tenants.map((t) => (
                <button key={t.id} type="button" className="gsearch-item" onClick={() => goTenant(t.id)}>
                  <span className="row" style={{ gap: 6 }}>{t.name} <StatusBadge status={t.status} size="sm" /></span>
                  <span className="sub">{t.subdomain}.avenit.pl</span>
                </button>
              ))}
            </div>
          )}
          {res.users.length > 0 && (
            <div>
              <div className="gsearch-section">Konta</div>
              {res.users.map((u, i) => (
                <button key={i} type="button" className="gsearch-item" onClick={() => goTenant(u.tenant.id)}>
                  <span>{u.full_name || u.email}</span>
                  <span className="sub">{u.email} · {u.tenant.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

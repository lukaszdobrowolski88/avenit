import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, setToken, getToken } from './lib/api.js';
import Icon from './components/Icon.jsx';
import { Button, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Tenants from './pages/Tenants.jsx';
import TenantDetail from './pages/TenantDetail.jsx';
import Plans from './pages/Plans.jsx';
import Invoices from './pages/Invoices.jsx';
import Coupons from './pages/Coupons.jsx';
import Audit from './pages/Audit.jsx';
import Settings from './pages/Settings.jsx';
import System from './pages/System.jsx';
import Announcements from './pages/Announcements.jsx';
import Leads from './pages/Leads.jsx';
import AnalyticsLayout from './pages/analytics/AnalyticsLayout.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then((r) => setAdmin(r.admin)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="login-wrap"><Loading /></div>;
  if (!admin) return <Login onLogin={setAdmin} />;

  return <Shell admin={admin} onLogout={() => { api.logout().catch(() => {}); setToken(null); setAdmin(null); }} />;
}

const NAV = [
  { section: 'Przegląd' },
  { to: '/', end: true, label: 'Pulpit', icon: 'dashboard' },
  { to: '/analytics', label: 'Analityka', icon: 'chart' },
  { section: 'Klienci' },
  { to: '/tenants', label: 'Kościoły', icon: 'church' },
  { to: '/leads', label: 'Zgłoszenia', icon: 'inbox', badge: 'leads' },
  { section: 'Rozliczenia' },
  { to: '/plans', label: 'Plany', icon: 'layers' },
  { to: '/invoices', label: 'Faktury', icon: 'receipt' },
  { to: '/coupons', label: 'Kupony', icon: 'ticket' },
  { section: 'Platforma' },
  { to: '/announcements', label: 'Ogłoszenia', icon: 'megaphone' },
  { to: '/system', label: 'System', icon: 'server' },
  { to: '/audit', label: 'Log audytu', icon: 'history' },
  { to: '/settings', label: 'Ustawienia', icon: 'settings' },
];

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Avenit — pulpit">
      <span className="brand-mark" aria-hidden="true">A</span>
      <span className="brand-name">Avenit<span className="brand-sub">Panel platformy</span></span>
    </Link>
  );
}

function Shell({ admin, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Licznik nowych zgłoszeń ze strony (badge w nawigacji), odświeżany co minutę.
  const [newLeads, setNewLeads] = useState(0);
  useEffect(() => {
    const refresh = () => api.landingLeads('new').then((r) => setNewLeads(r.counts.new || 0)).catch(() => {});
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);
  // Na telefonie/tablecie menu zamyka się po przejściu na inną stronę.
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const initials = (admin.full_name || admin.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

  return (
    <div className={`layout${navOpen ? ' nav-open' : ''}`}>
      <div className="topbar">
        <Button variant="ghost" icon="menu" onClick={() => setNavOpen(true)} aria-label="Otwórz menu" aria-expanded={navOpen} />
        <Brand />
      </div>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />
      <aside className="sidebar" aria-label="Nawigacja">
        <div className="row">
          <Brand />
          <Button variant="ghost" icon="x" className="nav-close" onClick={() => setNavOpen(false)} aria-label="Zamknij menu" />
        </div>
        <GlobalSearch />
        <nav className="nav">
          {NAV.map((n, i) => n.section
            ? <div key={`s${i}`} className="nav-section">{n.section}</div>
            : (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <Icon name={n.icon} size={18} />
                <span>{n.label}</span>
                {n.badge === 'leads' && newLeads > 0 && <span className="navbadge" aria-label={`${newLeads} nowych`}>{newLeads}</span>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <span className="avatar" aria-hidden="true">{initials}</span>
          <div className="who ellipsis" title={admin.email}>{admin.full_name || admin.email}</div>
          <Button variant="ghost" icon="logout" size="sm" onClick={() => { onLogout(); navigate('/'); }} aria-label="Wyloguj" title="Wyloguj" />
        </div>
      </aside>
      <main className="main">
        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/analytics/*" element={<AnalyticsLayout />} />
            <Route path="/tenants" element={<Tenants />} />
            <Route path="/tenants/:id" element={<TenantDetail />} />
            <Route path="/leads" element={<Leads onCountsChange={(c) => setNewLeads(c.new || 0)} />} />
            <Route path="/plans" element={<Plans />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/system" element={<System />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

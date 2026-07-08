import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom';
import { api, setToken, getToken } from './lib/api.js';
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
import GlobalSearch from './components/GlobalSearch.jsx';

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    api.me().then((r) => setAdmin(r.admin)).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="main">Ładowanie…</div>;
  if (!admin) return <Login onLogin={setAdmin} />;

  return <Shell admin={admin} onLogout={() => { api.logout().catch(() => {}); setToken(null); setAdmin(null); }} />;
}

function Shell({ admin, onLogout }) {
  const navigate = useNavigate();
  // Licznik nowych zgłoszeń ze strony (badge w nawigacji), odświeżany co minutę.
  const [newLeads, setNewLeads] = useState(0);
  useEffect(() => {
    const refresh = () => api.landingLeads('new').then((r) => setNewLeads(r.counts.new || 0)).catch(() => {});
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Avenit</div>
        <GlobalSearch />
        <nav className="nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/tenants">Tenanci</NavLink>
          <NavLink to="/leads">Zgłoszenia{newLeads > 0 && <span className="navbadge">{newLeads}</span>}</NavLink>
          <NavLink to="/plans">Plany</NavLink>
          <NavLink to="/invoices">Faktury</NavLink>
          <NavLink to="/coupons">Kupony</NavLink>
          <NavLink to="/announcements">Ogłoszenia</NavLink>
          <NavLink to="/system">System</NavLink>
          <NavLink to="/audit">Log audytu</NavLink>
          <NavLink to="/settings">Ustawienia</NavLink>
        </nav>
        <div style={{ padding: '20px', marginTop: 'auto', position: 'absolute', bottom: 0, width: 220 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{admin.email}</div>
          <button className="ghost" onClick={() => { onLogout(); navigate('/'); }}>Wyloguj</button>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
      </main>
    </div>
  );
}

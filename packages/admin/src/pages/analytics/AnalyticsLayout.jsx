// Sekcja Analityka: zakładki + wspólny pasek filtrów (stan w URL).
import React from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useAnalyticsFilters, FilterBar } from './filters.jsx';
import Overview from './Overview.jsx';
import Visitors from './Visitors.jsx';
import VisitorDetail from './VisitorDetail.jsx';
import Sources from './Sources.jsx';
import PagesTab from './PagesTab.jsx';
import Geo from './Geo.jsx';
import Devices from './Devices.jsx';
import TenantsActivity from './TenantsActivity.jsx';

const TABS = [
  { to: '', end: true, label: 'Przegląd' },
  { to: 'visitors', label: 'Odwiedzający' },
  { to: 'sources', label: 'Źródła' },
  { to: 'pages', label: 'Strony' },
  { to: 'geo', label: 'Geografia' },
  { to: 'devices', label: 'Urządzenia' },
  { to: 'tenants', label: 'Kościoły' },
];

export default function AnalyticsLayout() {
  const [filters, set] = useAnalyticsFilters();
  const { search } = useLocation();

  return (
    <div>
      <h1 className="h1">Analityka</h1>
      <div className="anatabs">
        {TABS.map((t) => (
          <NavLink key={t.label} to={{ pathname: t.to || '.', search }} end={t.end}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <FilterBar filters={filters} set={set} />
      <Routes>
        <Route index element={<Overview filters={filters} />} />
        <Route path="visitors" element={<Visitors filters={filters} />} />
        <Route path="visitors/:id" element={<VisitorDetail />} />
        <Route path="sources" element={<Sources filters={filters} />} />
        <Route path="pages" element={<PagesTab filters={filters} />} />
        <Route path="geo" element={<Geo filters={filters} />} />
        <Route path="devices" element={<Devices filters={filters} />} />
        <Route path="tenants" element={<TenantsActivity filters={filters} />} />
        <Route path="*" element={<Navigate to="." />} />
      </Routes>
    </div>
  );
}

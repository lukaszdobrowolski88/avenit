import React, { useState, useEffect } from 'react';
import { isSuperAdmin } from '../../lib/tenantContext';
import Dashboard from './components/Dashboard';
import TenantsList from './components/TenantsList';
import PlansManager from './components/PlansManager';
import AdminInvoicesList from './components/AdminInvoicesList';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Package,
  Settings,
  Tag,
  Shield,
  Loader2
} from 'lucide-react';
import { tr } from '../../i18n';

const TABS = {
  DASHBOARD: 'dashboard',
  TENANTS: 'tenants',
  INVOICES: 'invoices',
  PLANS: 'plans',
  COUPONS: 'coupons',
  SETTINGS: 'settings'
};

export default function SuperAdminModule() {
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);
  const [isAdmin, setIsAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      const admin = await isSuperAdmin();
      setIsAdmin(admin);
      setLoading(false);
    };
    checkAccess();
  }, []);

  const navItems = [
    { id: TABS.DASHBOARD, icon: LayoutDashboard, label: 'Dashboard' },
    { id: TABS.TENANTS, icon: Building2, label: 'Klienci' },
    { id: TABS.INVOICES, icon: CreditCard, label: 'Faktury' },
    { id: TABS.PLANS, icon: Package, label: 'Plany' },
    { id: TABS.COUPONS, icon: Tag, label: 'Kupony' },
    { id: TABS.SETTINGS, icon: Settings, label: tr('Ustawienia') }
  ];

  const handleSelectTenant = (tenant) => {
    // TODO: Navigate to tenant detail view
    console.log('Selected tenant:', tenant);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-10">
        <Loader2 size={32} className="animate-spin text-accent-primary-light" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-10 text-center">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
          <Shield size={32} className="text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Brak dostępu
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Ta sekcja jest dostępna tylko dla administratorów systemu.
        </p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case TABS.DASHBOARD:
        return <Dashboard />;
      case TABS.TENANTS:
        return <TenantsList onSelectTenant={handleSelectTenant} />;
      case TABS.INVOICES:
        return <AdminInvoicesList />;
      case TABS.PLANS:
        return <PlansManager />;
      case TABS.COUPONS:
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Kupony rabatowe
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Zarządzaj kuponami i promocjami.
            </p>
            {/* TODO: CouponsManager component */}
          </div>
        );
      case TABS.SETTINGS:
        return (
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Ustawienia systemu
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Konfiguracja globalna aplikacji.
            </p>
            {/* TODO: SystemSettings component */}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-accent-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield size={24} className="text-white" />
          <div>
            <h1 className="text-lg font-bold text-white">
              Panel Super Administratora
            </h1>
            <p className="text-sm text-white/80">
              Avenit - Zarządzanie systemem
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-2 p-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-gradient-to-r from-purple-600 to-accent-primary text-white shadow-lg shadow-purple-500/25'
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}

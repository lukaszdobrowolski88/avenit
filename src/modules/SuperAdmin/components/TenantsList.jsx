import React, { useEffect, useState } from 'react';
import { useTenants } from '../hooks/useTenants';
import { formatPrice } from '../../../lib/subscriptions';
import {
  Search,
  Filter,
  Building2,
  Mail,
  Calendar,
  MoreVertical,
  Play,
  Pause,
  Clock,
  Eye,
  Edit
} from 'lucide-react';

export default function TenantsList({ onSelectTenant }) {
  const { getTenants, suspendTenant, resumeTenant, extendTrial, loading } = useTenants();
  const [tenants, setTenants] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showActions, setShowActions] = useState(null);

  const loadTenants = async () => {
    const data = await getTenants({
      search: searchQuery,
      status: statusFilter || undefined
    });
    setTenants(data);
  };

  useEffect(() => {
    loadTenants();
  }, [searchQuery, statusFilter]);

  const handleSuspend = async (tenantId) => {
    if (confirm('Czy na pewno chcesz zawiesić tego klienta?')) {
      await suspendTenant(tenantId);
      loadTenants();
    }
    setShowActions(null);
  };

  const handleResume = async (tenantId) => {
    await resumeTenant(tenantId);
    loadTenants();
    setShowActions(null);
  };

  const handleExtendTrial = async (tenantId) => {
    const days = prompt('O ile dni przedłużyć trial?', '7');
    if (days) {
      await extendTrial(tenantId, parseInt(days));
      loadTenants();
    }
    setShowActions(null);
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      trial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      suspended: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      cancelled: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
    };

    const statusLabels = {
      trial: 'Trial',
      active: 'Aktywny',
      suspended: 'Zawieszony',
      cancelled: 'Anulowany'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyles[status] || statusStyles.cancelled}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const getSubscriptionInfo = (tenant) => {
    const subscription = tenant.tenant_subscriptions?.find(
      s => ['trialing', 'active', 'past_due'].includes(s.status)
    );

    if (!subscription) return { plan: '-', price: '-' };

    const plan = subscription.subscription_plans;
    const price = subscription.billing_cycle === 'yearly'
      ? plan?.price_yearly
      : plan?.price_monthly;

    return {
      plan: plan?.name || '-',
      price: price ? formatPrice(price) : '-',
      cycle: subscription.billing_cycle === 'yearly' ? '/rok' : '/mies.'
    };
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Klienci
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Zarządzaj klientami i ich subskrypcjami
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Szukaj po nazwie lub emailu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light"
        >
          <option value="">Wszystkie statusy</option>
          <option value="trial">Trial</option>
          <option value="active">Aktywny</option>
          <option value="suspended">Zawieszony</option>
          <option value="cancelled">Anulowany</option>
        </select>
      </div>

      {/* Tenants List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">
            Ładowanie...
          </div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Brak klientów spełniających kryteria
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                  <th className="px-4 py-3 font-medium">Klient</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Cena</th>
                  <th className="px-4 py-3 font-medium">Data rejestracji</th>
                  <th className="px-4 py-3 font-medium text-right">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((tenant) => {
                  const subInfo = getSubscriptionInfo(tenant);
                  return (
                    <tr
                      key={tenant.id}
                      className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-accent-primary-lighter dark:bg-accent-primary-darkest/30 flex items-center justify-center">
                            <Building2 size={18} className="text-accent-primary dark:text-accent-primary-light" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                              {tenant.name}
                            </div>
                            <div className="text-sm text-gray-500 flex items-center gap-1">
                              <Mail size={12} />
                              {tenant.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(tenant.status)}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {subInfo.plan}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {subInfo.price}{subInfo.cycle && subInfo.price !== '-' && (
                          <span className="text-gray-500 text-sm">{subInfo.cycle}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(tenant.created_at).toLocaleDateString('pl-PL')}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setShowActions(showActions === tenant.id ? null : tenant.id)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                          >
                            <MoreVertical size={18} className="text-gray-500" />
                          </button>

                          {showActions === tenant.id && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-10">
                              <button
                                onClick={() => {
                                  onSelectTenant?.(tenant);
                                  setShowActions(null);
                                }}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 first:rounded-t-xl"
                              >
                                <Eye size={16} />
                                Szczegóły
                              </button>

                              {tenant.status === 'trial' && (
                                <button
                                  onClick={() => handleExtendTrial(tenant.id)}
                                  className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <Clock size={16} />
                                  Przedłuż trial
                                </button>
                              )}

                              {tenant.status === 'suspended' ? (
                                <button
                                  onClick={() => handleResume(tenant.id)}
                                  className="w-full px-4 py-2.5 text-left text-sm text-green-600 dark:text-green-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2"
                                >
                                  <Play size={16} />
                                  Przywróć
                                </button>
                              ) : tenant.status !== 'cancelled' && (
                                <button
                                  onClick={() => handleSuspend(tenant.id)}
                                  className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 last:rounded-b-xl"
                                >
                                  <Pause size={16} />
                                  Zawieś
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Close dropdown when clicking outside */}
      {showActions && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowActions(null)}
        />
      )}
    </div>
  );
}

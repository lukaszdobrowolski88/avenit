import React, { useEffect, useState } from 'react';
import { getCurrentTenant, getTenantSubscription, getResourceCounts } from '../../../lib/tenantContext';
import { formatPrice } from '../../../lib/subscriptions';
import {
  Package,
  Calendar,
  Users,
  UserPlus,
  Layers,
  Baby,
  CalendarDays,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap
} from 'lucide-react';
import { tr } from '../../../i18n';

export default function CurrentPlan({ onUpgrade }) {
  const [tenant, setTenant] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [tenantData, subData] = await Promise.all([
          getCurrentTenant(),
          getTenantSubscription()
        ]);

        setTenant(tenantData);
        setSubscription(subData);

        if (tenantData?.id) {
          const counts = await getResourceCounts(tenantData.id);
          setUsage(counts);
        }
      } catch (err) {
        console.error('Error loading plan data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const getStatusBadge = (status) => {
    const config = {
      trialing: { label: 'Trial', icon: Clock, color: 'blue' },
      active: { label: 'Aktywna', icon: CheckCircle, color: 'green' },
      past_due: { label: tr('Zaległa płatność'), icon: AlertTriangle, color: 'red' },
      suspended: { label: 'Zawieszona', icon: AlertTriangle, color: 'red' },
      cancelled: { label: 'Anulowana', icon: AlertTriangle, color: 'gray' }
    };

    const { label, icon: Icon, color } = config[status] || config.cancelled;

    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium
        bg-${color}-100 text-${color}-700 dark:bg-${color}-900/30 dark:text-${color}-400`}>
        <Icon size={14} />
        {label}
      </span>
    );
  };

  const UsageBar = ({ label, icon: Icon, current, limit }) => {
    const isUnlimited = limit === -1;
    const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
    const isNearLimit = !isUnlimited && percentage >= 80;
    const isAtLimit = !isUnlimited && current >= limit;

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Icon size={16} />
            {label}
          </div>
          <span className={`text-sm font-medium ${isAtLimit ? 'text-red-600' : isNearLimit ? 'text-yellow-600' : 'text-gray-900 dark:text-white'}`}>
            {current} / {isUnlimited ? '∞' : limit}
          </span>
        </div>
        {!isUnlimited && (
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-6"></div>
        <div className="space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 text-center">
        <Package size={48} className="mx-auto mb-4 text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Brak aktywnej subskrypcji
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Wybierz plan, aby korzystać z pełnych możliwości aplikacji.
        </p>
        <button
          onClick={onUpgrade}
          className="px-6 py-2.5 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-medium hover:shadow-lg transition"
        >
          Wybierz plan
        </button>
      </div>
    );
  }

  const daysLeft = subscription.current_period_end
    ? Math.ceil((new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Package size={24} className="text-accent-primary" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {subscription.plan_name}
              </h2>
              {getStatusBadge(subscription.status)}
            </div>
            <p className="text-gray-600 dark:text-gray-400">
              {subscription.billing_cycle === 'yearly' ? 'Plan roczny' : 'Plan miesięczny'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatPrice(
                subscription.billing_cycle === 'yearly'
                  ? subscription.price_yearly || subscription.price_monthly * 12
                  : subscription.price_monthly
              )}
            </div>
            <div className="text-sm text-gray-500">
              /{subscription.billing_cycle === 'yearly' ? 'rok' : 'miesiąc'}
            </div>
          </div>
        </div>
      </div>

      {/* Period info */}
      {subscription.current_period_end && (
        <div className={`px-6 py-3 flex items-center gap-2 text-sm ${
          subscription.status === 'trialing'
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
            : daysLeft <= 7
              ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400'
              : 'bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400'
        }`}>
          <Calendar size={16} />
          {subscription.status === 'trialing' ? (
            <span>Trial kończy się za <strong>{daysLeft}</strong> dni ({new Date(subscription.current_period_end).toLocaleDateString('pl-PL')})</span>
          ) : (
            <span>Następne odnowienie: <strong>{new Date(subscription.current_period_end).toLocaleDateString('pl-PL')}</strong></span>
          )}
        </div>
      )}

      {/* Usage */}
      {usage && (
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Wykorzystanie zasobów
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UsageBar
              label="Członkowie"
              icon={Users}
              current={usage.members}
              limit={subscription.max_members}
            />
            <UsageBar
              label="Użytkownicy"
              icon={UserPlus}
              current={usage.users}
              limit={subscription.max_users}
            />
            <UsageBar
              label="Grupy"
              icon={Layers}
              current={usage.groups}
              limit={subscription.max_groups}
            />
            <UsageBar
              label="Dzieci"
              icon={Baby}
              current={usage.kids}
              limit={subscription.max_kids}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900/50 flex flex-wrap gap-3">
        <button
          onClick={onUpgrade}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-lg font-medium hover:shadow-lg transition"
        >
          <Zap size={16} />
          {subscription.plan_slug === 'enterprise' ? 'Zarządzaj planem' : 'Ulepsz plan'}
        </button>
        {subscription.status === 'trialing' && (
          <button
            onClick={onUpgrade}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
          >
            Aktywuj teraz
          </button>
        )}
      </div>
    </div>
  );
}

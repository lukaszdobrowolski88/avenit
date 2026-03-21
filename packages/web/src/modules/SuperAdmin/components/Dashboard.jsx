import React, { useEffect, useState } from 'react';
import { useTenants } from '../hooks/useTenants';
import { useInvoices } from '../hooks/useInvoices';
import { usePlans } from '../hooks/usePlans';
import { formatPrice } from '../../../lib/subscriptions';
import {
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';

export default function Dashboard() {
  const { getTenants } = useTenants();
  const { getInvoiceStats, getMRR } = useInvoices();
  const { getPlanStats } = usePlans();

  const [stats, setStats] = useState({
    totalTenants: 0,
    activeTenants: 0,
    trialTenants: 0,
    suspendedTenants: 0,
    mrr: 0,
    invoiceStats: null,
    planStats: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true);
      try {
        const [tenants, mrr, invoiceStats, planStats] = await Promise.all([
          getTenants(),
          getMRR(),
          getInvoiceStats('month'),
          getPlanStats()
        ]);

        const totalTenants = tenants.length;
        const activeTenants = tenants.filter(t => t.status === 'active').length;
        const trialTenants = tenants.filter(t => t.status === 'trial').length;
        const suspendedTenants = tenants.filter(t => t.status === 'suspended').length;

        setStats({
          totalTenants,
          activeTenants,
          trialTenants,
          suspendedTenants,
          mrr,
          invoiceStats,
          planStats
        });
      } catch (err) {
        console.error('Error loading dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const StatCard = ({ icon: Icon, label, value, subValue, color = 'blue' }) => (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center`}>
          <Icon size={20} className={`text-${color}-600 dark:text-${color}-400`} />
        </div>
        <span className="text-sm text-gray-600 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">
        {value}
      </div>
      {subValue && (
        <div className="text-sm text-gray-500 dark:text-gray-500 mt-1">
          {subValue}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Przegląd systemu AppSchtomy
        </p>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Building2}
          label="Wszystkich klientów"
          value={stats.totalTenants}
          color="blue"
        />
        <StatCard
          icon={CheckCircle}
          label="Aktywnych"
          value={stats.activeTenants}
          subValue={`${stats.trialTenants} w trialu`}
          color="green"
        />
        <StatCard
          icon={AlertCircle}
          label="Zawieszonych"
          value={stats.suspendedTenants}
          color="red"
        />
        <StatCard
          icon={TrendingUp}
          label="MRR"
          value={formatPrice(stats.mrr)}
          subValue="Monthly Recurring Revenue"
          color="purple"
        />
      </div>

      {/* Invoice Stats */}
      {stats.invoiceStats && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Faktury (ostatnie 30 dni)
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.invoiceStats.total}
              </div>
              <div className="text-sm text-gray-500">Wszystkich</div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.invoiceStats.paid}
              </div>
              <div className="text-sm text-gray-500">Opłaconych</div>
              <div className="text-xs text-green-600 dark:text-green-400">
                {formatPrice(stats.invoiceStats.totalRevenue)}
              </div>
            </div>
            <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {stats.invoiceStats.pending}
              </div>
              <div className="text-sm text-gray-500">Oczekujących</div>
              <div className="text-xs text-yellow-600 dark:text-yellow-400">
                {formatPrice(stats.invoiceStats.pendingRevenue)}
              </div>
            </div>
            <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.invoiceStats.overdue}
              </div>
              <div className="text-sm text-gray-500">Zaległych</div>
              <div className="text-xs text-red-600 dark:text-red-400">
                {formatPrice(stats.invoiceStats.overdueRevenue)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Stats */}
      {stats.planStats.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Plany subskrypcji
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="pb-3 font-medium">Plan</th>
                  <th className="pb-3 font-medium text-center">Aktywnych</th>
                  <th className="pb-3 font-medium text-center">W trialu</th>
                  <th className="pb-3 font-medium text-center">Miesięcznych</th>
                  <th className="pb-3 font-medium text-center">Rocznych</th>
                  <th className="pb-3 font-medium text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {stats.planStats.map(plan => (
                  <tr
                    key={plan.id}
                    className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                  >
                    <td className="py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {plan.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatPrice(plan.price_monthly)}/mies.
                      </div>
                    </td>
                    <td className="py-3 text-center font-medium text-gray-900 dark:text-white">
                      {plan.activeCount}
                    </td>
                    <td className="py-3 text-center text-gray-600 dark:text-gray-400">
                      {plan.trialCount}
                    </td>
                    <td className="py-3 text-center text-gray-600 dark:text-gray-400">
                      {plan.monthlyCount}
                    </td>
                    <td className="py-3 text-center text-gray-600 dark:text-gray-400">
                      {plan.yearlyCount}
                    </td>
                    <td className="py-3 text-right font-medium text-green-600 dark:text-green-400">
                      {formatPrice(plan.mrr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

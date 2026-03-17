import React, { useEffect, useState } from 'react';
import { getAvailablePlans, formatPrice, validateCoupon, calculateDiscountedPrice } from '../../../lib/subscriptions';
import { getTenantSubscription } from '../../../lib/tenantContext';
import {
  Check,
  X,
  Sparkles,
  Tag,
  Loader2
} from 'lucide-react';

export default function PlansSelection({ onSelectPlan, onCancel }) {
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPlanId, setSelectedPlanId] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [plansData, subscription] = await Promise.all([
          getAvailablePlans(),
          getTenantSubscription()
        ]);
        setPlans(plansData);
        setCurrentPlan(subscription);
      } catch (err) {
        console.error('Error loading plans:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) return;

    setValidatingCoupon(true);
    try {
      const result = await validateCoupon(couponCode, selectedPlanId, billingCycle);
      setCouponResult(result);
    } catch (err) {
      setCouponResult({ is_valid: false, error_message: 'Błąd walidacji kuponu' });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSelectPlan = (plan) => {
    const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
    const discountedPrice = couponResult?.is_valid
      ? calculateDiscountedPrice(price, couponResult)
      : price;

    onSelectPlan?.({
      plan,
      billingCycle,
      originalPrice: price,
      finalPrice: discountedPrice,
      coupon: couponResult?.is_valid ? couponResult : null
    });
  };

  const getYearlySavings = (plan) => {
    const monthlyTotal = plan.price_monthly * 12;
    const yearlyPrice = plan.price_yearly;
    const savings = monthlyTotal - yearlyPrice;
    const percent = Math.round((savings / monthlyTotal) * 100);
    return { savings, percent };
  };

  const FeatureItem = ({ included, label }) => (
    <div className={`flex items-center gap-2 text-sm ${included ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
      {included ? (
        <Check size={16} className="text-green-500 flex-shrink-0" />
      ) : (
        <X size={16} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
      )}
      {label}
    </div>
  );

  const featureLabels = {
    calendar: 'Kalendarz',
    members: 'Zarządzanie członkami',
    groups: 'Grupy domowe',
    kids_checkin: 'Check-in dzieci',
    events: 'Wydarzenia',
    email: 'Wysyłka emaili',
    finance: 'Moduł finansowy',
    forms: 'Formularze',
    basic_reports: 'Podstawowe raporty',
    advanced_reports: 'Zaawansowane raporty',
    api: 'Dostęp do API',
    white_label: 'White label',
    priority_support: 'Priorytetowe wsparcie',
    custom_domain: 'Własna domena'
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 size={32} className="animate-spin mx-auto text-pink-500 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Ładowanie planów...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Wybierz plan dla swojego kościoła
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Wszystkie plany zawierają 14-dniowy okres próbny
        </p>
      </div>

      {/* Billing cycle toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition ${
              billingCycle === 'monthly'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Miesięcznie
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              billingCycle === 'yearly'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            Rocznie
            <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs px-2 py-0.5 rounded-full">
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlan?.plan_slug === plan.slug;
          const isPopular = plan.slug === 'standard';
          const price = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly;
          const { savings, percent } = getYearlySavings(plan);

          return (
            <div
              key={plan.id}
              className={`relative bg-white dark:bg-gray-800 rounded-2xl border-2 transition-all ${
                isPopular
                  ? 'border-pink-500 shadow-lg shadow-pink-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-pink-300 dark:hover:border-pink-600'
              }`}
            >
              {/* Popular badge */}
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-pink-600 to-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    <Sparkles size={12} />
                    NAJPOPULARNIEJSZY
                  </span>
                </div>
              )}

              <div className="p-6">
                {/* Plan name */}
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 min-h-[40px]">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {formatPrice(price)}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      /{billingCycle === 'yearly' ? 'rok' : 'mies.'}
                    </span>
                  </div>
                  {billingCycle === 'yearly' && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                      Oszczędzasz {formatPrice(savings)} rocznie ({percent}%)
                    </p>
                  )}
                </div>

                {/* Limits */}
                <div className="space-y-2 mb-6 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Członkowie:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {plan.max_members === -1 ? 'Bez limitu' : plan.max_members}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Użytkownicy:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {plan.max_users === -1 ? 'Bez limitu' : plan.max_users}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Grupy:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {plan.max_groups === -1 ? 'Bez limitu' : plan.max_groups}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-2 mb-6">
                  {Object.entries(featureLabels).map(([key, label]) => (
                    <FeatureItem
                      key={key}
                      included={plan.features?.[key] === true}
                      label={label}
                    />
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCurrentPlan}
                  className={`w-full py-3 rounded-xl font-medium transition ${
                    isCurrentPlan
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                      : isPopular
                        ? 'bg-gradient-to-r from-pink-600 to-orange-600 text-white hover:shadow-lg'
                        : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100'
                  }`}
                >
                  {isCurrentPlan ? 'Aktualny plan' : 'Wybierz plan'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Coupon code */}
      <div className="max-w-md mx-auto">
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Tag size={16} />
            Masz kod rabatowy?
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => {
                setCouponCode(e.target.value.toUpperCase());
                setCouponResult(null);
              }}
              placeholder="Wpisz kod"
              className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500"
            />
            <button
              onClick={handleValidateCoupon}
              disabled={!couponCode.trim() || validatingCoupon}
              className="px-4 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition disabled:opacity-50"
            >
              {validatingCoupon ? <Loader2 size={18} className="animate-spin" /> : 'Zastosuj'}
            </button>
          </div>
          {couponResult && (
            <p className={`mt-2 text-sm ${couponResult.is_valid ? 'text-green-600' : 'text-red-600'}`}>
              {couponResult.is_valid
                ? `Kupon aktywny! Rabat: ${couponResult.discount_type === 'percent' ? `${couponResult.discount_value}%` : formatPrice(couponResult.discount_value)}`
                : couponResult.error_message
              }
            </p>
          )}
        </div>
      </div>

      {/* Cancel button */}
      {onCancel && (
        <div className="text-center mt-6">
          <button
            onClick={onCancel}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
          >
            Anuluj
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import CurrentPlan from './components/CurrentPlan';
import PlansSelection from './components/PlansSelection';
import InvoicesList from './components/InvoicesList';
import { createInvoice, redirectToPayment } from '../../lib/payments';
import { getCurrentTenant, getTenantSubscription } from '../../lib/tenantContext';
import {
  CreditCard,
  Package,
  FileText,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { tr } from '../../i18n';

const VIEWS = {
  OVERVIEW: 'overview',
  PLANS: 'plans',
  CHECKOUT: 'checkout'
};

export default function BillingModule() {
  const [view, setView] = useState(VIEWS.OVERVIEW);
  const [selectedPlanData, setSelectedPlanData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectPlan = (planData) => {
    setSelectedPlanData(planData);
    setView(VIEWS.CHECKOUT);
  };

  const handleProceedToPayment = async () => {
    if (!selectedPlanData) return;

    setProcessing(true);
    setError(null);

    try {
      const tenant = await getCurrentTenant();
      const subscription = await getTenantSubscription();

      if (!tenant || !subscription) {
        throw new Error(tr('Nie można pobrać danych konta'));
      }

      // Utwórz fakturę
      const invoice = await createInvoice(
        tenant.id,
        subscription.subscription_id,
        selectedPlanData.originalPrice,
        selectedPlanData.billingCycle,
        selectedPlanData.originalPrice - selectedPlanData.finalPrice
      );

      // Przekieruj do płatności
      await redirectToPayment(invoice.id);
    } catch (err) {
      console.error('Error processing payment:', err);
      setError(err.message || 'Wystąpił błąd podczas przetwarzania płatności');
    } finally {
      setProcessing(false);
    }
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <CurrentPlan onUpgrade={() => setView(VIEWS.PLANS)} />
      <InvoicesList />
    </div>
  );

  const renderPlans = () => (
    <PlansSelection
      onSelectPlan={handleSelectPlan}
      onCancel={() => setView(VIEWS.OVERVIEW)}
    />
  );

  const renderCheckout = () => {
    if (!selectedPlanData) {
      setView(VIEWS.PLANS);
      return null;
    }

    const { plan, billingCycle, originalPrice, finalPrice, coupon } = selectedPlanData;
    const hasDiscount = finalPrice < originalPrice;

    return (
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => setView(VIEWS.PLANS)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
        >
          <ArrowLeft size={18} />
          {tr('Wróć do planów')}
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              {tr('Podsumowanie zamówienia')}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              {tr('Sprawdź szczegóły przed płatnością')}
            </p>
          </div>

          <div className="p-6 space-y-4">
            {/* Plan details */}
            <div className="flex justify-between items-center">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">
                  Plan {plan.name}
                </div>
                <div className="text-sm text-gray-500">
                  {billingCycle === 'yearly' ? 'Rozliczenie roczne' : 'Rozliczenie miesięczne'}
                </div>
              </div>
              <div className="text-right">
                {hasDiscount && (
                  <div className="text-sm text-gray-400 line-through">
                    {formatPrice(originalPrice)}
                  </div>
                )}
                <div className="font-semibold text-gray-900 dark:text-white">
                  {formatPrice(finalPrice)}
                </div>
              </div>
            </div>

            {/* Coupon */}
            {coupon && (
              <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                <div className="text-sm">
                  Kupon: {coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : formatPrice(coupon.discount_value)} rabatu
                </div>
                <div className="text-sm font-medium">
                  -{formatPrice(originalPrice - finalPrice)}
                </div>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900 dark:text-white">
                  {tr('Do zapłaty')}
                </span>
                <span className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatPrice(finalPrice)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Zawiera 23% VAT
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleProceedToPayment}
              disabled={processing}
              className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-accent-primary to-accent-secondary text-white rounded-xl font-semibold text-lg hover:shadow-lg transition disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Przetwarzanie...
                </>
              ) : (
                <>
                  <CreditCard size={20} />
                  {tr('Przejdź do płatności')}
                </>
              )}
            </button>

            <p className="text-xs text-center text-gray-500">
              {tr('Płatność obsługiwana przez Przelewy24. Bezpieczne połączenie SSL.')}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Import formatPrice locally if needed
  const formatPrice = (priceInGrosze) => {
    const amount = priceInGrosze / 100;
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN'
    }).format(amount);
  };

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-900">
      {/* Header - only show on overview */}
      {view === VIEWS.OVERVIEW && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <CreditCard size={24} className="text-accent-primary" />
            {tr('Subskrypcja i płatności')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {tr('Zarządzaj swoim planem i przeglądaj historię płatności')}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        {view === VIEWS.OVERVIEW && renderOverview()}
        {view === VIEWS.PLANS && renderPlans()}
        {view === VIEWS.CHECKOUT && renderCheckout()}
      </div>
    </div>
  );
}

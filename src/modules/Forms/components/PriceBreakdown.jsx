import { DollarSign } from 'lucide-react';
import { formatPrice } from '../utils/fieldTypes';
import { tr } from '../../../i18n';

export default function PriceBreakdown({ breakdown, currency = 'PLN', isWaitlist = false }) {
  if (!breakdown || breakdown.grandTotal === 0) return null;

  const {
    baseUnitPrice,
    participantCount,
    pricingType,
    baseTotal,
    addonsBreakdown,
    addonsTotal,
    subtotal,
    appliedDiscounts,
    discountTotal,
    grandTotal,
    activeDateTier
  } = breakdown;

  const hasDetails = (pricingType === 'per_person' && participantCount > 1) ||
    addonsBreakdown.length > 0 ||
    appliedDiscounts.length > 0 ||
    activeDateTier;

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-200 dark:border-green-800 p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
          <DollarSign size={20} className="text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Podsumowanie rejestracji
        </h3>
      </div>

      {hasDetails && (
        <div className="space-y-2 mb-4">
          {/* Aktywny próg cenowy */}
          {activeDateTier && activeDateTier.label && (
            <div className="flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full font-medium">
                {activeDateTier.label}
                {activeDateTier.until && (
                  <span className="font-normal text-blue-500"> — do {new Date(activeDateTier.until).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}</span>
                )}
              </span>
            </div>
          )}

          {/* Cena bazowa */}
          {baseTotal > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {pricingType === 'per_person' && participantCount > 1
                  ? `Cena bazowa (${formatPrice(baseUnitPrice, currency)} × ${participantCount} os.)`
                  : 'Cena bazowa'
                }
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {formatPrice(baseTotal, currency)}
              </span>
            </div>
          )}

          {/* Dodatki */}
          {addonsBreakdown.map((addon) => (
            <div key={addon.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {addon.name}
                {addon.quantity > 1 && ` (${formatPrice(addon.unitPrice, currency)} × ${addon.quantity})`}
              </span>
              <span className="text-gray-900 dark:text-white font-medium">
                {formatPrice(addon.total, currency)}
              </span>
            </div>
          ))}

          {/* Linia oddzielająca jeśli są rabaty */}
          {appliedDiscounts.length > 0 && (
            <>
              <div className="border-t border-green-200 dark:border-green-700 pt-2 flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{tr('Suma częściowa')}</span>
                <span className="text-gray-900 dark:text-white font-medium">
                  {formatPrice(subtotal, currency)}
                </span>
              </div>

              {appliedDiscounts.map((discount, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-green-600 dark:text-green-400">
                    {discount.label || 'Rabat'}
                  </span>
                  <span className="text-green-600 dark:text-green-400 font-medium">
                    -{formatPrice(discount.amount, currency)}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Suma końcowa */}
      <div className={`flex items-center justify-between ${hasDetails ? 'pt-3 border-t border-green-200 dark:border-green-700' : ''}`}>
        <span className="text-base font-semibold text-gray-900 dark:text-white">
          {isWaitlist ? tr('Wartość') : tr('Do zapłaty')}
        </span>
        <div className="text-right">
          {isWaitlist && (
            <span className="block text-xs text-orange-500 line-through mb-0.5">
              {formatPrice(grandTotal, currency)}
            </span>
          )}
          <span className={`text-2xl font-bold ${isWaitlist ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}`}>
            {isWaitlist ? 'Lista rezerwowa' : formatPrice(grandTotal, currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

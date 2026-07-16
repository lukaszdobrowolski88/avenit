import { formatPrice } from '../utils/fieldTypes';
import { tr } from '../../../i18n';

export default function AddonSelector({ addons, selectedAddons, onChange, currency = 'PLN' }) {
  if (!addons || addons.length === 0) return null;

  return (
    <div className="space-y-2">
      {addons.map((addon) => {
        const isSelected = (selectedAddons[addon.id] || 0) > 0;
        return (
          <label
            key={addon.id}
            className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
              isSelected
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                : 'border-gray-200 dark:border-gray-600 hover:border-purple-300'
            }`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onChange(addon.id, e.target.checked ? 1 : 0)}
              className="mt-0.5 w-4 h-4 text-purple-500 border-gray-300 rounded focus:ring-purple-500"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {addon.name}
                </span>
                <span className="text-sm font-semibold text-purple-600 dark:text-purple-400 ml-2 flex-shrink-0">
                  {addon.price > 0 ? formatPrice(addon.price, currency) : tr('Bezpłatne')}
                  {addon.scope === 'per_person' && addon.price > 0 && (
                    <span className="text-xs font-normal text-gray-500"> /os.</span>
                  )}
                </span>
              </div>
              {addon.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {addon.description}
                </p>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}

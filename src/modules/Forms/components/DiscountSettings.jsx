import { Plus, Trash2, Percent } from 'lucide-react';
import { tr } from '../../../i18n';

export default function DiscountSettings({ settings, onChange }) {
  const discounts = settings?.discounts || {};
  const rules = discounts.rules || [];
  const currency = settings?.pricing?.currency || 'PLN';

  const handleChange = (key, value) => {
    onChange({
      ...(settings?.discounts || {}),
      [key]: value
    });
  };

  const addRule = () => {
    const newRule = {
      id: `disc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      type: 'quantity',
      minQuantity: 3,
      discountType: 'percentage',
      value: 10,
      label: '',
      stackable: false
    };
    handleChange('rules', [...rules, newRule]);
  };

  const updateRule = (index, key, value) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], [key]: value };
    // Auto-generate label if empty
    if (key !== 'label') {
      const rule = updated[index];
      if (!rule.label) {
        const discountText = rule.discountType === 'percentage'
          ? `${rule.value}% rabatu`
          : rule.discountType === 'fixed_per_person'
            ? `${rule.value} ${currency}/os. rabatu`
            : `${rule.value} ${currency} rabatu`;
        updated[index].label = `${discountText} dla ${rule.minQuantity}+ osób`;
      }
    }
    handleChange('rules', updated);
  };

  const removeRule = (index) => {
    handleChange('rules', rules.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            Włącz rabaty ilościowe
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Zniżki zależne od liczby osób
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={discounts.enabled || false}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-orange-500"></div>
        </label>
      </div>

      {discounts.enabled && (
        <>
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Percent size={16} className="text-orange-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Reguła {index + 1}
                  </span>
                </div>
                <button
                  onClick={() => removeRule(index)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Od (osób)
                  </label>
                  <input
                    type="number"
                    min="2"
                    value={rule.minQuantity}
                    onChange={(e) => updateRule(index, 'minQuantity', parseInt(e.target.value) || 2)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Typ rabatu
                  </label>
                  <select
                    value={rule.discountType}
                    onChange={(e) => updateRule(index, 'discountType', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                  >
                    <option value="percentage">Procentowo</option>
                    <option value="fixed_per_person">Kwota/os.</option>
                    <option value="fixed_total">{tr('Kwota łącznie')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Wartość {rule.discountType === 'percentage' ? '(%)' : `(${currency})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step={rule.discountType === 'percentage' ? '1' : '0.01'}
                    value={rule.value}
                    onChange={(e) => updateRule(index, 'value', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Etykieta (wyświetlana użytkownikowi)
                </label>
                <input
                  type="text"
                  value={rule.label}
                  onChange={(e) => updateRule(index, 'label', e.target.value)}
                  placeholder={`np. ${rule.value}${rule.discountType === 'percentage' ? '%' : ' ' + currency} rabatu dla ${rule.minQuantity}+ osób`}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                />
              </div>
            </div>
          ))}

          <button
            onClick={addRule}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
          >
            <Plus size={18} />
            Dodaj regułę rabatową
          </button>

          {rules.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tryb łączenia rabatów
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'best', label: 'Najlepszy rabat' },
                  { id: 'all', label: 'Sumuj wszystkie' }
                ].map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => handleChange('stackingMode', mode.id)}
                    className={`px-4 py-2 rounded-xl text-sm border transition-colors ${
                      (discounts.stackingMode || 'best') === mode.id
                        ? 'bg-orange-50 dark:bg-orange-900/30 border-orange-500 text-orange-700 dark:text-orange-400'
                        : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

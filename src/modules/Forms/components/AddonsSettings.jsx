import { Plus, Trash2, Package } from 'lucide-react';

export default function AddonsSettings({ settings, onChange }) {
  const addons = settings?.addons || {};
  const items = addons.items || [];
  const currency = settings?.pricing?.currency || 'PLN';

  const handleChange = (key, value) => {
    onChange({
      ...(settings?.addons || {}),
      [key]: value
    });
  };

  const addItem = () => {
    const newItem = {
      id: `addon-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      name: '',
      description: '',
      price: 0,
      scope: 'per_person',
      required: false,
      maxQuantity: 1,
      available: true
    };
    handleChange('items', [...items, newItem]);
  };

  const updateItem = (index, key, value) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [key]: value };
    handleChange('items', updated);
  };

  const removeItem = (index) => {
    handleChange('items', items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
        <div>
          <p className="font-medium text-gray-900 dark:text-white">
            Włącz dodatki
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Opcjonalne płatne elementy (np. posiłki, koszulki)
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={addons.enabled || false}
            onChange={(e) => handleChange('enabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-purple-500"></div>
        </label>
      </div>

      {addons.enabled && (
        <>
          {items.map((item, index) => (
            <div
              key={item.id}
              className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-purple-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Dodatek {index + 1}
                  </span>
                </div>
                <button
                  onClick={() => removeItem(index)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Nazwa
                </label>
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => updateItem(index, 'name', e.target.value)}
                  placeholder="np. Pakiet lunchowy"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Opis (opcjonalnie)
                </label>
                <input
                  type="text"
                  value={item.description || ''}
                  onChange={(e) => updateItem(index, 'description', e.target.value)}
                  placeholder="Krótki opis dodatku"
                  className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Cena ({currency})
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Zakres
                  </label>
                  <select
                    value={item.scope}
                    onChange={(e) => updateItem(index, 'scope', e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light"
                  >
                    <option value="per_person">Za osobę</option>
                    <option value="per_registration">Za rejestrację</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.required || false}
                    onChange={(e) => updateItem(index, 'required', e.target.checked)}
                    className="w-4 h-4 text-purple-500 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Wymagany</span>
                </label>
              </div>
            </div>
          ))}

          <button
            onClick={addItem}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors"
          >
            <Plus size={18} />
            Dodaj dodatek
          </button>
        </>
      )}
    </div>
  );
}

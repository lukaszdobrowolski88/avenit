import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { FIELD_TYPES } from '../../utils/fieldTypes';

export default function FieldEditor({ field, onUpdate }) {
  const [newOption, setNewOption] = useState('');

  if (!field) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-3">
          <span className="text-2xl">👆</span>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Wybierz pole z formularza, aby edytować jego ustawienia
        </p>
      </div>
    );
  }

  const fieldType = FIELD_TYPES[field.type];
  const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);

  const handleChange = (key, value) => {
    onUpdate({ [key]: value });
  };

  const handleValidationChange = (key, value) => {
    onUpdate({
      validation: {
        ...(field.validation || {}),
        [key]: value
      }
    });
  };

  const handleAddOption = () => {
    if (!newOption.trim()) return;

    const options = field.options || [];
    const newOpt = {
      id: `opt-${Date.now()}`,
      label: newOption.trim(),
      value: newOption.trim().toLowerCase().replace(/\s+/g, '_')
    };

    onUpdate({ options: [...options, newOpt] });
    setNewOption('');
  };

  const handleRemoveOption = (optionId) => {
    const options = (field.options || []).filter(opt => opt.id !== optionId);
    onUpdate({ options });
  };

  const handleUpdateOption = (optionId, label) => {
    const options = (field.options || []).map(opt =>
      opt.id === optionId
        ? { ...opt, label, value: label.toLowerCase().replace(/\s+/g, '_') }
        : opt
    );
    onUpdate({ options });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-4">
          {fieldType?.icon && (
            <div className="w-8 h-8 bg-accent-primary-lightest dark:bg-accent-primary-darkest/30 rounded-lg flex items-center justify-center">
              <fieldType.icon size={18} className="text-accent-primary dark:text-accent-primary-light" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {fieldType?.label || field.type}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {fieldType?.description}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Etykieta pola
          </label>
          <input
            type="text"
            value={field.label || ''}
            onChange={(e) => handleChange('label', e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            placeholder="Np. Imię i nazwisko"
          />
        </div>

        {['text', 'textarea', 'email', 'phone', 'number', 'select'].includes(field.type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Placeholder
            </label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={(e) => handleChange('placeholder', e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
              placeholder="Np. Wpisz swoje imię..."
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Opis / Pomoc
          </label>
          <input
            type="text"
            value={field.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            placeholder="Dodatkowe informacje dla użytkownika"
          />
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Pole wymagane
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Użytkownik musi wypełnić to pole
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={field.required || false}
              onChange={(e) => handleChange('required', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
          </label>
        </div>
      </div>

      {hasOptions && (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Opcje
          </label>

          <div className="space-y-2">
            {(field.options || []).map((option, index) => (
              <div key={option.id} className="flex items-center gap-2">
                <GripVertical size={16} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => handleUpdateOption(option.id, e.target.value)}
                  className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
                />
                <button
                  onClick={() => handleRemoveOption(option.id)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newOption}
              onChange={(e) => setNewOption(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
              placeholder="Dodaj opcję..."
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            />
            <button
              onClick={handleAddOption}
              disabled={!newOption.trim()}
              className="p-2 bg-accent-primary-light text-white rounded-lg hover:bg-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      )}

      {['text', 'textarea', 'email', 'phone'].includes(field.type) && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Walidacja
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Min. znaków
              </label>
              <input
                type="number"
                min="0"
                value={field.validation?.minLength || ''}
                onChange={(e) => handleValidationChange('minLength', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Max. znaków
              </label>
              <input
                type="number"
                min="0"
                value={field.validation?.maxLength || ''}
                onChange={(e) => handleValidationChange('maxLength', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
                placeholder="255"
              />
            </div>
          </div>
        </div>
      )}

      {field.type === 'number' && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Walidacja
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Minimum
              </label>
              <input
                type="number"
                value={field.validation?.min ?? ''}
                onChange={(e) => handleValidationChange('min', e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Maksimum
              </label>
              <input
                type="number"
                value={field.validation?.max ?? ''}
                onChange={(e) => handleValidationChange('max', e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
                placeholder="100"
              />
            </div>
          </div>
        </div>
      )}

      {field.type === 'file' && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Ustawienia pliku
          </h4>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Maksymalny rozmiar (MB)
            </label>
            <input
              type="number"
              min="1"
              max="50"
              value={field.fileConfig?.maxSize || 10}
              onChange={(e) => onUpdate({
                fileConfig: {
                  ...(field.fileConfig || {}),
                  maxSize: parseInt(e.target.value) || 10
                }
              })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Wiele plików
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pozwól na upload wielu plików
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.fileConfig?.multiple || false}
                onChange={(e) => onUpdate({
                  fileConfig: {
                    ...(field.fileConfig || {}),
                    multiple: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
            </label>
          </div>
        </div>
      )}

      {field.type === 'image' && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Ustawienia obrazu
          </h4>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Maksymalny rozmiar (MB)
            </label>
            <input
              type="number"
              min="1"
              max="20"
              value={field.imageConfig?.maxSize || 5}
              onChange={(e) => onUpdate({
                imageConfig: {
                  ...(field.imageConfig || {}),
                  maxSize: parseInt(e.target.value) || 5
                }
              })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Max. szerokość (px)
              </label>
              <input
                type="number"
                min="100"
                max="4096"
                value={field.imageConfig?.maxWidth || 1920}
                onChange={(e) => onUpdate({
                  imageConfig: {
                    ...(field.imageConfig || {}),
                    maxWidth: parseInt(e.target.value) || 1920
                  }
                })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Max. wysokość (px)
              </label>
              <input
                type="number"
                min="100"
                max="4096"
                value={field.imageConfig?.maxHeight || 1080}
                onChange={(e) => onUpdate({
                  imageConfig: {
                    ...(field.imageConfig || {}),
                    maxHeight: parseInt(e.target.value) || 1080
                  }
                })}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Wiele zdjęć
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pozwól na upload wielu zdjęć
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.imageConfig?.multiple || false}
                onChange={(e) => onUpdate({
                  imageConfig: {
                    ...(field.imageConfig || {}),
                    multiple: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pokaż podgląd
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Wyświetl miniaturę po uploadzię
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.imageConfig?.showPreview !== false}
                onChange={(e) => onUpdate({
                  imageConfig: {
                    ...(field.imageConfig || {}),
                    showPreview: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Kompresja
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Automatycznie zmniejszaj rozmiar
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.imageConfig?.compress !== false}
                onChange={(e) => onUpdate({
                  imageConfig: {
                    ...(field.imageConfig || {}),
                    compress: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
            </label>
          </div>
        </div>
      )}

      {/* === POLA WYDARZENIOWE === */}

      {field.type === 'price' && (
        <div className="space-y-4 pt-4 border-t border-green-200 dark:border-green-800">
          <h4 className="text-sm font-medium text-green-700 dark:text-green-400">
            Ustawienia cennika
          </h4>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Cena bazowa
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={field.priceConfig?.basePrice || 0}
                onChange={(e) => onUpdate({
                  priceConfig: {
                    ...(field.priceConfig || {}),
                    basePrice: parseFloat(e.target.value) || 0
                  }
                })}
                className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 dark:text-white"
              />
              <select
                value={field.priceConfig?.currency || 'PLN'}
                onChange={(e) => onUpdate({
                  priceConfig: {
                    ...(field.priceConfig || {}),
                    currency: e.target.value
                  }
                })}
                className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm dark:text-white"
              >
                <option value="PLN">PLN</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Typ cennika
            </label>
            <select
              value={field.priceConfig?.pricingType || 'fixed'}
              onChange={(e) => onUpdate({
                priceConfig: {
                  ...(field.priceConfig || {}),
                  pricingType: e.target.value
                }
              })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-green-500/20 focus:border-green-500 dark:text-white"
            >
              <option value="fixed">Stała cena</option>
              <option value="per_person">Cena za osobę</option>
              <option value="tiered">Cena progowa (rabaty)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {field.priceConfig?.pricingType === 'per_person' && 'Cena zostanie pomnożona przez liczbę osób'}
              {field.priceConfig?.pricingType === 'tiered' && 'Różne ceny w zależności od ilości osób'}
              {field.priceConfig?.pricingType === 'fixed' && 'Taka sama cena niezależnie od ilości'}
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pokaż w podsumowaniu
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Wyświetl cenę w podsumowaniu formularza
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.priceConfig?.showInSummary !== false}
                onChange={(e) => onUpdate({
                  priceConfig: {
                    ...(field.priceConfig || {}),
                    showInSummary: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
            </label>
          </div>
        </div>
      )}

      {field.type === 'seat_limit' && (
        <div className="space-y-4 pt-4 border-t border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400">
            Ustawienia limitu miejsc
          </h4>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Maksymalna liczba miejsc
            </label>
            <input
              type="number"
              min="0"
              value={field.seatConfig?.maxSeats || ''}
              onChange={(e) => onUpdate({
                seatConfig: {
                  ...(field.seatConfig || {}),
                  maxSeats: e.target.value ? parseInt(e.target.value) : null
                }
              })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white"
              placeholder="Bez limitu"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Pokaż pozostałe miejsca
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Wyświetl ile miejsc zostało
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.seatConfig?.showRemaining !== false}
                onChange={(e) => onUpdate({
                  seatConfig: {
                    ...(field.seatConfig || {}),
                    showRemaining: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Lista oczekujących
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pozwól na zapisy gdy brak miejsc
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.seatConfig?.allowWaitlist || false}
                onChange={(e) => onUpdate({
                  seatConfig: {
                    ...(field.seatConfig || {}),
                    allowWaitlist: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500"></div>
            </label>
          </div>
        </div>
      )}

      {field.type === 'quantity' && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Ustawienia ilości
          </h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Minimum
              </label>
              <input
                type="number"
                min="1"
                value={field.validation?.min || 1}
                onChange={(e) => handleValidationChange('min', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Maksimum
              </label>
              <input
                type="number"
                min="1"
                value={field.validation?.max || 10}
                onChange={(e) => handleValidationChange('max', parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Domyślna wartość
            </label>
            <input
              type="number"
              min="1"
              value={field.quantityConfig?.defaultValue || 1}
              onChange={(e) => onUpdate({
                quantityConfig: {
                  ...(field.quantityConfig || {}),
                  defaultValue: parseInt(e.target.value) || 1
                }
              })}
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-accent-primary-light/20 focus:border-accent-primary-light dark:text-white"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Wpływa na cenę
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ilość osób mnoży cenę
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={field.quantityConfig?.affectsPrice !== false}
                onChange={(e) => onUpdate({
                  quantityConfig: {
                    ...(field.quantityConfig || {}),
                    affectsPrice: e.target.checked
                  }
                })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-primary-light dark:peer-focus:ring-accent-primary-dark rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-primary-light"></div>
            </label>
          </div>
        </div>
      )}

      {['location'].includes(field.type) && (
        <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/30 rounded-lg mt-4">
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Pokaż w nagłówku
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Wyświetl w sekcji informacji o wydarzeniu
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={field.showInHeader !== false}
              onChange={(e) => handleChange('showInHeader', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
          </label>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { getSuggestedLocation, calculateAge, formatAgeRange } from '../utils/ageCalculator';
import { ArrowLeft, UserPlus, Loader2, Check } from 'lucide-react';

export default function GuestCheckinForm({
  locations,
  onCheckin,
  onBack,
  loading
}) {
  const currentYear = new Date().getFullYear();

  const [formData, setFormData] = useState({
    name: '',
    birthYear: '',
    parentName: '',
    parentPhone: '',
    allergies: '',
    notes: ''
  });

  const [selectedLocation, setSelectedLocation] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (formData.birthYear && locations.length > 0) {
      const suggested = getSuggestedLocation(parseInt(formData.birthYear), locations);
      if (suggested) {
        setSelectedLocation(suggested.id);
      }
    }
  }, [formData.birthYear, locations]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Imię jest wymagane';
    }
    if (!formData.birthYear) {
      newErrors.birthYear = 'Rok urodzenia jest wymagany';
    }
    if (!formData.parentName.trim()) {
      newErrors.parentName = 'Imię rodzica jest wymagane';
    }
    if (!formData.parentPhone.trim()) {
      newErrors.parentPhone = 'Telefon jest wymagany';
    }
    if (!selectedLocation) {
      newErrors.location = 'Wybierz salę';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    onCheckin({
      name: formData.name.trim(),
      birthYear: parseInt(formData.birthYear),
      parentName: formData.parentName.trim(),
      parentPhone: formData.parentPhone.trim(),
      allergies: formData.allergies.trim() || null,
      notes: formData.notes.trim() || null,
      locationId: selectedLocation
    });
  };

  const age = formData.birthYear ? calculateAge(parseInt(formData.birthYear)) : null;

  const yearOptions = [];
  for (let year = currentYear; year >= currentYear - 15; year--) {
    yearOptions.push(year);
  }

  const inputClasses = (hasError) => `
    w-full px-4 py-3.5 text-base border-2 rounded-xl bg-white dark:bg-gray-800
    text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
    focus:outline-none focus:border-pink-500 dark:focus:border-pink-400 transition
    ${hasError ? 'border-red-500 dark:border-red-400' : 'border-gray-200 dark:border-gray-700'}
  `;

  return (
    <div className="flex flex-col items-center px-5 py-10 min-h-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Check-in Gościa
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          Wprowadź dane dziecka
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-5 w-full max-w-md">
        {/* Child name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Imię i nazwisko dziecka *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="np. Jan Kowalski"
            className={inputClasses(errors.name)}
          />
          {errors.name && (
            <div className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.name}</div>
          )}
        </div>

        {/* Birth year and age */}
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Rok urodzenia *
            </label>
            <select
              value={formData.birthYear}
              onChange={(e) => handleChange('birthYear', e.target.value)}
              className={inputClasses(errors.birthYear)}
            >
              <option value="">Wybierz...</option>
              {yearOptions.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            {errors.birthYear && (
              <div className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.birthYear}</div>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Wiek
            </label>
            <div className="px-4 py-3.5 text-base bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300">
              {age !== null ? `${age} lat` : '-'}
            </div>
          </div>
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Sala *
          </label>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className={inputClasses(errors.location)}
          >
            <option value="">Wybierz salę...</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
                {loc.room_number && ` (${loc.room_number})`}
                {' - '}
                {formatAgeRange(loc)}
              </option>
            ))}
          </select>
          {errors.location && (
            <div className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.location}</div>
          )}
          {formData.birthYear && selectedLocation && (
            <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 text-sm mt-1">
              <Check size={14} />
              Sala dopasowana do wieku
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Dane rodzica/opiekuna
          </span>
        </div>

        {/* Parent name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Imię rodzica *
          </label>
          <input
            type="text"
            value={formData.parentName}
            onChange={(e) => handleChange('parentName', e.target.value)}
            placeholder="np. Anna Kowalska"
            className={inputClasses(errors.parentName)}
          />
          {errors.parentName && (
            <div className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.parentName}</div>
          )}
        </div>

        {/* Parent phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Telefon *
          </label>
          <input
            type="tel"
            value={formData.parentPhone}
            onChange={(e) => handleChange('parentPhone', e.target.value)}
            placeholder="np. 123 456 789"
            className={inputClasses(errors.parentPhone)}
          />
          {errors.parentPhone && (
            <div className="text-red-500 dark:text-red-400 text-sm mt-1">{errors.parentPhone}</div>
          )}
        </div>

        {/* Optional: Allergies */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Alergie (opcjonalne)
          </label>
          <input
            type="text"
            value={formData.allergies}
            onChange={(e) => handleChange('allergies', e.target.value)}
            placeholder="np. orzechy, mleko"
            className={inputClasses(false)}
          />
        </div>

        {/* Optional: Notes */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Uwagi (opcjonalne)
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder="Dodatkowe informacje..."
            rows={2}
            className={`${inputClasses(false)} resize-vertical min-h-[60px]`}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-4">
          <button
            onClick={onBack}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-4 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          >
            <ArrowLeft size={18} />
            Wróć
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`flex-[2] flex items-center justify-center gap-2 px-4 py-4 text-lg font-semibold rounded-xl transition
              ${loading
                ? 'bg-green-400 dark:bg-green-600 cursor-not-allowed opacity-70'
                : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg cursor-pointer'
              }`}
          >
            {loading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Meldowanie...
              </>
            ) : (
              <>
                <UserPlus size={20} />
                Zamelduj gościa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

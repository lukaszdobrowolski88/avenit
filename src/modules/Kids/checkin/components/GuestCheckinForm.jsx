import React, { useState, useEffect } from 'react';
import { getSuggestedLocation, calculateAge, formatAgeRange, yearsLabel } from '../utils/ageCalculator';
import { ArrowLeft, UserPlus, Check } from 'lucide-react';
import Button from '../../../../components/Button';
import { tr } from '../../../../i18n';

// Meldowanie gościa (dziecko spoza bazy). Sala jest OPCJONALNA — tak samo jak przy dziecku
// z rodziny; bez zdefiniowanych sal gościa da się zameldować (wcześniej formularz był ślepym
// zaułkiem z błędem „Wybierz salę” przy pustej liście).
export default function GuestCheckinForm({
  locations,
  onCheckin,
  onBack,
  loading,
  initialData = null,
}) {
  const currentYear = new Date().getFullYear();

  const [formData, setFormData] = useState({
    name: '',
    birthYear: '',
    parentName: initialData?.parentName || '',
    parentPhone: initialData?.parentPhone || '',
    allergies: '',
    notes: '',
  });

  const [selectedLocation, setSelectedLocation] = useState('');
  const [errors, setErrors] = useState({});
  const hasLocations = locations.length > 0;

  useEffect(() => {
    if (formData.birthYear && hasLocations) {
      const suggested = getSuggestedLocation(parseInt(formData.birthYear, 10), locations);
      if (suggested) setSelectedLocation(suggested.id);
    }
  }, [formData.birthYear, locations, hasLocations]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = tr('Podaj imię i nazwisko dziecka');
    if (!formData.birthYear) newErrors.birthYear = tr('Wybierz rok urodzenia');
    if (!formData.parentName.trim()) newErrors.parentName = tr('Podaj imię rodzica lub opiekuna');
    if (!formData.parentPhone.trim()) newErrors.parentPhone = tr('Podaj telefon — zadzwonimy, gdy dziecko będzie potrzebować rodzica');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (loading || !validate()) return;
    onCheckin({
      name: formData.name.trim(),
      birthYear: parseInt(formData.birthYear, 10),
      parentName: formData.parentName.trim(),
      parentPhone: formData.parentPhone.trim(),
      allergies: formData.allergies.trim() || null,
      notes: formData.notes.trim() || null,
      locationId: selectedLocation || null,
    });
  };

  const age = formData.birthYear ? calculateAge(parseInt(formData.birthYear, 10)) : null;

  const yearOptions = [];
  for (let year = currentYear; year >= currentYear - 15; year--) yearOptions.push(year);

  const inputClasses = (hasError) => `
    w-full px-4 py-3.5 text-base border-2 rounded-xl bg-white dark:bg-gray-800
    text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
    focus:outline-none focus:border-accent-primary transition
    ${hasError ? 'border-red-500 dark:border-red-400' : 'border-gray-300 dark:border-gray-600'}
  `;
  const labelClass = 'block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5';
  const fieldError = (key) => errors[key] && (
    <div id={`guest-${key}-error`} className="text-red-600 dark:text-red-400 text-sm mt-1">{errors[key]}</div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col items-center px-5 py-6 sm:py-8 min-h-full">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {tr('Meldowanie gościa')}
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          {tr('Wpisz dane dziecka i rodzica. Pola z gwiazdką są wymagane.')}
        </p>
      </div>

      <div className="flex flex-col gap-5 w-full max-w-md">
        <div>
          <label htmlFor="guest-name" className={labelClass}>{tr('Imię i nazwisko dziecka')} *</label>
          <input
            id="guest-name"
            type="text"
            autoComplete="off"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={tr('np. Jan Kowalski')}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'guest-name-error' : undefined}
            className={inputClasses(errors.name)}
          />
          {fieldError('name')}
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <label htmlFor="guest-birthYear" className={labelClass}>{tr('Rok urodzenia')} *</label>
            <select
              id="guest-birthYear"
              value={formData.birthYear}
              onChange={(e) => handleChange('birthYear', e.target.value)}
              aria-invalid={!!errors.birthYear}
              aria-describedby={errors.birthYear ? 'guest-birthYear-error' : undefined}
              className={inputClasses(errors.birthYear)}
            >
              <option value="">{tr('Wybierz...')}</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            {fieldError('birthYear')}
          </div>
          <div className="flex-1">
            <span className={labelClass}>{tr('Wiek')}</span>
            <div className="px-4 py-3.5 text-base bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-700 dark:text-gray-300">
              {age !== null ? yearsLabel(age) : '—'}
            </div>
          </div>
        </div>

        {hasLocations && (
          <div>
            <label htmlFor="guest-location" className={labelClass}>{tr('Sala')}</label>
            <select
              id="guest-location"
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className={inputClasses(false)}
            >
              <option value="">{tr('Bez sali')}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                  {loc.room_number && ` (${loc.room_number})`}
                  {' – '}
                  {formatAgeRange(loc)}
                </option>
              ))}
            </select>
            {formData.birthYear && selectedLocation && (
              <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 text-sm mt-1">
                <Check size={14} className="text-accent-primary" />
                {tr('Sala dopasowana do wieku')}
              </div>
            )}
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {tr('Dane rodzica lub opiekuna')}
          </span>
        </div>

        <div>
          <label htmlFor="guest-parentName" className={labelClass}>{tr('Imię i nazwisko rodzica')} *</label>
          <input
            id="guest-parentName"
            type="text"
            autoComplete="off"
            value={formData.parentName}
            onChange={(e) => handleChange('parentName', e.target.value)}
            placeholder={tr('np. Anna Kowalska')}
            aria-invalid={!!errors.parentName}
            aria-describedby={errors.parentName ? 'guest-parentName-error' : undefined}
            className={inputClasses(errors.parentName)}
          />
          {fieldError('parentName')}
        </div>

        <div>
          <label htmlFor="guest-parentPhone" className={labelClass}>{tr('Telefon rodzica')} *</label>
          <input
            id="guest-parentPhone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={formData.parentPhone}
            onChange={(e) => handleChange('parentPhone', e.target.value)}
            placeholder={tr('np. 600 100 200')}
            aria-invalid={!!errors.parentPhone}
            aria-describedby={errors.parentPhone ? 'guest-parentPhone-error' : undefined}
            className={inputClasses(errors.parentPhone)}
          />
          {fieldError('parentPhone')}
        </div>

        <div>
          <label htmlFor="guest-allergies" className={labelClass}>{tr('Alergie (opcjonalnie)')}</label>
          <input
            id="guest-allergies"
            type="text"
            autoComplete="off"
            value={formData.allergies}
            onChange={(e) => handleChange('allergies', e.target.value)}
            placeholder={tr('np. orzechy, mleko')}
            className={inputClasses(false)}
          />
        </div>

        <div>
          <label htmlFor="guest-notes" className={labelClass}>{tr('Uwagi (opcjonalnie)')}</label>
          <textarea
            id="guest-notes"
            value={formData.notes}
            onChange={(e) => handleChange('notes', e.target.value)}
            placeholder={tr('Dodatkowe informacje...')}
            rows={2}
            className={`${inputClasses(false)} resize-y min-h-[60px]`}
          />
        </div>

        <div className="flex gap-4 mt-2">
          <Button type="button" variant="secondary" size="lg" icon={ArrowLeft} onClick={onBack} className="flex-1 py-4">
            {tr('Wróć')}
          </Button>
          <Button type="submit" size="lg" icon={UserPlus} loading={loading} className="flex-[2] py-4 text-lg">
            {loading ? tr('Meldowanie...') : tr('Zamelduj gościa')}
          </Button>
        </div>
      </div>
    </form>
  );
}

import React, { useState, useEffect } from 'react';
import { getSuggestedLocation, formatAge, formatAgeRange } from '../utils/ageCalculator';
import { ArrowLeft, Check, AlertTriangle, Baby, UserPlus, Plus, Clock } from 'lucide-react';
import Button from '../../../../components/Button';
import EmptyState from '../../../../components/EmptyState';
import { tr, appLocale } from '../../../../i18n';

const timeLabel = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString(appLocale(), { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

// Krok 2 meldowania: dzieci z rodziny. Dzieci już zameldowane w tej sesji są widoczne,
// ale nie da się ich zameldować drugi raz. Rodzina bez dzieci nie jest ślepym zaułkiem:
// można dopisać dziecko albo przejść do meldowania gościa.
export default function MemberCheckin({
  household,
  locations,
  onCheckin,
  onBack,
  onAddChild,
  onGuest,
  activeByStudent = {},
  loading,
}) {
  const [selectedMembers, setSelectedMembers] = useState({});
  const [memberLocations, setMemberLocations] = useState({});
  const [showAddChild, setShowAddChild] = useState(false);
  const [childForm, setChildForm] = useState({ full_name: '', birth_year: '', allergies: '' });
  const [childError, setChildError] = useState('');
  const [addingChild, setAddingChild] = useState(false);

  const children = household?.kids_students || [];
  const primaryContact = household?.parent_contacts?.find((c) => c.is_primary)
    || household?.parent_contacts?.[0];
  const hasLocations = locations.length > 0;

  useEffect(() => {
    if (children.length > 0 && hasLocations) {
      const defaults = {};
      children.forEach((child) => {
        const suggested = getSuggestedLocation(child.birth_year, locations);
        if (suggested) defaults[child.id] = suggested.id;
      });
      setMemberLocations((prev) => ({ ...defaults, ...prev }));
    }
  }, [children, locations, hasLocations]);

  // Jedno dziecko w rodzinie — od razu zaznaczone (mniej stuknięć w niedzielny poranek).
  useEffect(() => {
    const available = children.filter((c) => !activeByStudent[c.id]);
    if (available.length === 1) setSelectedMembers((prev) => (Object.keys(prev).length ? prev : { [available[0].id]: true }));
  }, [children, activeByStudent]);

  const handleMemberToggle = (memberId) => {
    if (activeByStudent[memberId]) return;
    setSelectedMembers((prev) => ({ ...prev, [memberId]: !prev[memberId] }));
  };

  const handleCheckin = () => {
    const membersToCheckin = children
      .filter((child) => selectedMembers[child.id] && !activeByStudent[child.id])
      .map((child) => ({ studentId: child.id, locationId: memberLocations[child.id] || null }));
    if (membersToCheckin.length > 0) onCheckin(membersToCheckin);
  };

  const handleAddChild = async (e) => {
    e?.preventDefault?.();
    if (!childForm.full_name.trim()) {
      setChildError(tr('Podaj imię i nazwisko dziecka'));
      return;
    }
    setChildError('');
    setAddingChild(true);
    try {
      const created = await onAddChild?.({
        full_name: childForm.full_name.trim(),
        birth_year: childForm.birth_year || null,
        allergies: childForm.allergies.trim() || null,
      });
      if (created) {
        setSelectedMembers((prev) => ({ ...prev, [created.id]: true }));
        setChildForm({ full_name: '', birth_year: '', allergies: '' });
        setShowAddChild(false);
      }
    } finally {
      setAddingChild(false);
    }
  };

  const selectedCount = Object.entries(selectedMembers)
    .filter(([id, on]) => on && !activeByStudent[id]).length;

  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let year = currentYear; year >= currentYear - 15; year--) yearOptions.push(year);
  const inputClass = 'w-full px-4 py-3 text-base border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-accent-primary focus:outline-none transition';

  const addChildForm = showAddChild && (
    <form onSubmit={handleAddChild} noValidate className="w-full p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 space-y-3 text-left">
      <div className="text-base font-semibold text-gray-900 dark:text-white">{tr('Dodaj dziecko do rodziny')}</div>
      <div>
        <label htmlFor="add-child-name" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{tr('Imię i nazwisko dziecka')} *</label>
        <input
          id="add-child-name"
          className={inputClass}
          autoComplete="off"
          value={childForm.full_name}
          onChange={(e) => { setChildForm({ ...childForm, full_name: e.target.value }); setChildError(''); }}
          aria-invalid={!!childError}
          aria-describedby={childError ? 'add-child-error' : undefined}
        />
        {childError && <div id="add-child-error" className="text-sm text-red-600 dark:text-red-400 mt-1">{childError}</div>}
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="add-child-year" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{tr('Rok urodzenia')}</label>
          <select id="add-child-year" className={inputClass} value={childForm.birth_year} onChange={(e) => setChildForm({ ...childForm, birth_year: e.target.value })}>
            <option value="">{tr('Wybierz...')}</option>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label htmlFor="add-child-allergies" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{tr('Alergie (opcjonalnie)')}</label>
          <input id="add-child-allergies" className={inputClass} autoComplete="off" value={childForm.allergies} onChange={(e) => setChildForm({ ...childForm, allergies: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onClick={() => setShowAddChild(false)}>{tr('Anuluj')}</Button>
        <Button type="submit" icon={Plus} loading={addingChild}>{tr('Dodaj dziecko')}</Button>
      </div>
    </form>
  );

  return (
    <div className="flex flex-col items-center px-5 py-6 sm:py-8 min-h-full">
      <div className="text-center mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1">
          {household?.name}
        </h1>
        {primaryContact && (
          <p className="text-base text-gray-600 dark:text-gray-400">{primaryContact.full_name}</p>
        )}
      </div>

      <div className="flex flex-col gap-4 w-full max-w-lg mb-6">
        {children.length === 0 ? (
          showAddChild ? addChildForm : (
            <EmptyState
              icon={Baby}
              title={tr('W tej rodzinie nie ma jeszcze dzieci')}
              subtitle={onAddChild
                ? tr('Dodaj dziecko do rodziny albo zamelduj je jako gościa.')
                : tr('Zamelduj dziecko jako gościa albo poproś o pomoc obsługę.')}
              action={(
                <div className="flex gap-3 flex-wrap justify-center">
                  {onAddChild && (
                    <Button size="lg" icon={Plus} onClick={() => setShowAddChild(true)}>{tr('Dodaj dziecko')}</Button>
                  )}
                  {onGuest && (
                    <Button size="lg" variant="outline" icon={UserPlus} onClick={onGuest}>{tr('Zamelduj jako gościa')}</Button>
                  )}
                </div>
              )}
            />
          )
        ) : (
          <>
            {children.map((child) => {
              const checkedInAt = activeByStudent[child.id];
              const isSelected = !checkedInAt && selectedMembers[child.id];
              const selectedLocation = locations.find((l) => l.id === memberLocations[child.id]);

              return (
                <div
                  key={child.id}
                  className={`flex flex-col p-5 rounded-2xl border-2 transition
                    ${checkedInAt
                      ? 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700'
                      : isSelected
                        ? 'bg-accent-primary-lightest dark:bg-accent-primary-darkest/20 border-accent-primary'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    }`}
                >
                  <button
                    type="button"
                    className="flex items-center gap-4 text-left disabled:cursor-default"
                    onClick={() => handleMemberToggle(child.id)}
                    disabled={!!checkedInAt}
                    aria-pressed={!!isSelected}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition
                        ${isSelected
                          ? 'bg-accent-primary border-accent-primary'
                          : checkedInAt
                            ? 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                            : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                        }`}
                    >
                      {(isSelected || checkedInAt) && <Check size={16} className={isSelected ? 'text-white' : 'text-gray-500'} />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-lg font-semibold text-gray-900 dark:text-white">{child.full_name}</span>
                      <span className="flex items-center gap-2 flex-wrap text-sm text-gray-600 dark:text-gray-400">
                        {formatAge(child.birth_year)}
                        {child.allergies && (
                          <span className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs font-medium">
                            <AlertTriangle size={12} />
                            {tr('Alergie')}
                          </span>
                        )}
                        {checkedInAt && (
                          <span className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded text-xs font-medium">
                            <Clock size={12} />
                            {tr('Już zameldowane o {time}', { time: timeLabel(checkedInAt) })}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  {isSelected && hasLocations && (
                    <div className="mt-4 pl-11">
                      <label htmlFor={`loc-${child.id}`} className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {tr('Sala')}
                      </label>
                      <select
                        id={`loc-${child.id}`}
                        value={memberLocations[child.id] || ''}
                        onChange={(e) => setMemberLocations((prev) => ({ ...prev, [child.id]: e.target.value }))}
                        className="w-full px-4 py-3 text-base border-2 border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white cursor-pointer focus:border-accent-primary focus:outline-none transition"
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
                      {selectedLocation?.capacity && (
                        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          {tr('Pojemność: {n}', { n: selectedLocation.capacity })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {onAddChild && (showAddChild ? addChildForm : (
              <button
                type="button"
                onClick={() => setShowAddChild(true)}
                className="self-center text-sm font-medium text-accent-primary dark:text-accent-primary-light hover:underline py-2"
              >
                {tr('Nie ma dziecka na liście? Dodaj dziecko')}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="flex gap-4 w-full max-w-lg">
        <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={onBack} className="flex-1 py-4">
          {tr('Wróć')}
        </Button>
        <Button
          size="lg"
          icon={Check}
          onClick={handleCheckin}
          disabled={selectedCount === 0}
          loading={loading && selectedCount > 0}
          className="flex-[2] py-4 text-lg"
        >
          {selectedCount > 0 ? tr('Zamelduj ({n})', { n: selectedCount }) : tr('Zamelduj')}
        </Button>
      </div>
    </div>
  );
}

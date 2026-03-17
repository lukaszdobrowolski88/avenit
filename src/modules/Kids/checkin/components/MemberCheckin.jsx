import React, { useState, useEffect } from 'react';
import { getSuggestedLocation, formatAge, formatAgeRange } from '../utils/ageCalculator';
import { ArrowLeft, Check, Loader2, AlertTriangle } from 'lucide-react';

export default function MemberCheckin({
  household,
  locations,
  onCheckin,
  onBack,
  loading
}) {
  const [selectedMembers, setSelectedMembers] = useState({});
  const [memberLocations, setMemberLocations] = useState({});

  const children = household?.kids_students || [];
  const primaryContact = household?.parent_contacts?.find(c => c.is_primary)
    || household?.parent_contacts?.[0];

  useEffect(() => {
    if (children.length > 0 && locations.length > 0) {
      const defaults = {};
      children.forEach(child => {
        const suggested = getSuggestedLocation(child.birth_year, locations);
        if (suggested) {
          defaults[child.id] = suggested.id;
        }
      });
      setMemberLocations(defaults);
    }
  }, [children, locations]);

  const handleMemberToggle = (memberId) => {
    setSelectedMembers(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  const handleLocationChange = (memberId, locationId) => {
    setMemberLocations(prev => ({
      ...prev,
      [memberId]: locationId
    }));
  };

  const handleCheckin = () => {
    const membersToCheckin = children
      .filter(child => selectedMembers[child.id])
      .map(child => ({
        studentId: child.id,
        locationId: memberLocations[child.id]
      }));

    if (membersToCheckin.length > 0) {
      onCheckin(membersToCheckin);
    }
  };

  const selectedCount = Object.values(selectedMembers).filter(Boolean).length;

  return (
    <div className="flex flex-col items-center px-5 py-10 min-h-full">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
          {household?.family_name}
        </h1>
        {primaryContact && (
          <p className="text-base text-gray-600 dark:text-gray-400">
            {primaryContact.full_name}
          </p>
        )}
      </div>

      {/* Children list */}
      <div className="flex flex-col gap-4 w-full max-w-lg mb-8">
        {children.length === 0 ? (
          <div className="text-center p-10 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-800 dark:text-amber-200">
            Brak zarejestrowanych dzieci w tej rodzinie
          </div>
        ) : (
          children.map((child) => {
            const isSelected = selectedMembers[child.id];
            const selectedLocation = locations.find(l => l.id === memberLocations[child.id]);

            return (
              <div
                key={child.id}
                className={`flex flex-col p-5 rounded-2xl border-2 transition-all
                  ${isSelected
                    ? 'bg-pink-50 dark:bg-pink-900/20 border-pink-500 dark:border-pink-400'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  }`}
              >
                {/* Child row */}
                <div
                  className="flex items-center gap-4 cursor-pointer"
                  onClick={() => handleMemberToggle(child.id)}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all
                      ${isSelected
                        ? 'bg-pink-600 border-pink-600'
                        : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600'
                      }`}
                  >
                    {isSelected && <Check size={16} className="text-white" />}
                  </div>

                  {/* Name and age */}
                  <div className="flex-1">
                    <div className="text-lg font-semibold text-gray-900 dark:text-white">
                      {child.full_name}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      {formatAge(child.birth_year)}
                      {child.allergies && (
                        <span className="flex items-center gap-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-2 py-0.5 rounded text-xs font-medium">
                          <AlertTriangle size={12} />
                          Alergie
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Location selector - only show when selected */}
                {isSelected && (
                  <div className="mt-4 pl-11">
                    <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                      Sala:
                    </label>
                    <select
                      value={memberLocations[child.id] || ''}
                      onChange={(e) => handleLocationChange(child.id, e.target.value)}
                      className="w-full px-4 py-3 text-base border-2 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white cursor-pointer focus:border-pink-500 dark:focus:border-pink-400 focus:outline-none transition"
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
                    {selectedLocation && (
                      <div className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                        Pojemność: {selectedLocation.capacity || '∞'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-4 w-full max-w-lg">
        <button
          onClick={onBack}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-4 text-base font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <ArrowLeft size={18} />
          Wróć
        </button>
        <button
          onClick={handleCheckin}
          disabled={selectedCount === 0 || loading}
          className={`flex-[2] flex items-center justify-center gap-2 px-4 py-4 text-lg font-semibold rounded-xl transition
            ${selectedCount > 0
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:shadow-lg cursor-pointer'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
            }`}
        >
          {loading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Meldowanie...
            </>
          ) : (
            <>
              <Check size={20} />
              Check In {selectedCount > 0 && `(${selectedCount})`}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

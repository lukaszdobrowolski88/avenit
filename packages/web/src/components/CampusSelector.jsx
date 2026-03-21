import React, { useState, useRef, useEffect } from 'react';
import { Building2, ChevronDown, Check, MapPin } from 'lucide-react';
import { useCampus } from '../contexts/CampusContext';

export default function CampusSelector() {
  const { campuses, selectedCampusId, setSelectedCampusId, canSwitchCampus } = useCampus();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click - MUST be before any early return
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Hide if less than 2 campuses
  if (campuses.length < 2) return null;

  const selectedCampus = campuses.find(c => c.id === selectedCampusId);
  const displayName = selectedCampus?.name || 'Wszystkie lokalizacje';

  if (!canSwitchCampus) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 dark:text-gray-300">
        <MapPin size={14} className="text-accent-primary shrink-0" />
        <span className="hidden sm:inline truncate max-w-[140px] font-medium">{displayName}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 lg:px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors text-sm"
      >
        <Building2 size={16} className="text-accent-primary shrink-0" />
        <span className="hidden sm:inline truncate max-w-[160px] font-medium">{displayName}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[1001]">
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Lokalizacja</p>
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            <button
              onClick={() => { setSelectedCampusId(null); setIsOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                !selectedCampusId ? 'bg-accent-primary-lightest dark:bg-gray-700/50 text-accent-primary font-medium' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              <Building2 size={14} />
              <span className="flex-1 text-left">Wszystkie lokalizacje</span>
              {!selectedCampusId && <Check size={14} className="text-accent-primary" />}
            </button>

            <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2 my-1" />

            {campuses.map(campus => (
              <button
                key={campus.id}
                onClick={() => { setSelectedCampusId(campus.id); setIsOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition ${
                  selectedCampusId === campus.id ? 'bg-accent-primary-lightest dark:bg-gray-700/50 text-accent-primary font-medium' : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <MapPin size={14} />
                <div className="flex-1 text-left">
                  <span>{campus.name}</span>
                  {campus.city && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">({campus.city})</span>
                  )}
                </div>
                {selectedCampusId === campus.id && <Check size={14} className="text-accent-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

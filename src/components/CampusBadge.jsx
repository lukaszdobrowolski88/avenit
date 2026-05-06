import React, { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useCampus } from '../contexts/CampusContext';

// Współdzielony pill z nazwą kampusu — używany w listach programów / grafikach
// żeby admin widzący "Wszystkie lokalizacje" rozróżniał wpisy z różnych kampusów.

export function CampusBadge({ campus, size = 'sm', className = '' }) {
  if (!campus) return null;
  const sizeCls = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-1'
    : 'text-xs px-2 py-0.5 gap-1';
  const iconSize = size === 'sm' ? 10 : 11;
  return (
    <span
      className={`inline-flex items-center ${sizeCls} font-medium rounded-full bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 whitespace-nowrap ${className}`}
      style={campus.color ? { background: `${campus.color}1a`, color: campus.color } : undefined}
      title={`Kampus: ${campus.name}`}
    >
      <MapPin size={iconSize} />
      {campus.name}
    </span>
  );
}

// Hook: zwraca getCampus(id) zwracający rekord kampusu **tylko** gdy badge ma być
// widoczny (admin/superadmin oglądający "Wszystkie lokalizacje"). W trybie pojedynczego
// kampusu zwraca null — bo wszystkie wiersze i tak są z tego samego kampusu.
export function useCampusBadge() {
  const { selectedCampusId } = useCampusQuery();
  const { campuses } = useCampus();
  const campusById = useMemo(() => {
    const m = {};
    (campuses || []).forEach(c => { m[c.id] = c; });
    return m;
  }, [campuses]);
  const showCampus = !selectedCampusId && (campuses?.length || 0) > 0;
  const getCampus = (campusId) => (showCampus ? campusById[campusId] || null : null);
  return { showCampus, campusById, getCampus };
}

export default CampusBadge;

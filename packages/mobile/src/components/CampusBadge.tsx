import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { useCampusQuery } from '../hooks/useCampusQuery';
import { useCampus, type Campus } from '../contexts/CampusContext';

type Props = {
  campus: Campus | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
};

// Pill z nazwą kampusu — widoczny tylko gdy admin przegląda "wszystkie lokalizacje".
export function CampusBadge({ campus, size = 'sm', className = '' }: Props) {
  if (!campus) return null;
  const wrapperCls = size === 'sm'
    ? 'flex-row items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5'
    : 'flex-row items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5';
  const textCls = size === 'sm' ? 'text-[10px] font-medium' : 'text-xs font-medium';
  const iconSize = size === 'sm' ? 10 : 11;

  // Custom kolor kampusu — tłumaczymy hex na 10% alpha (suffix `1a`) jak na webie.
  const tint = campus.color
    ? { backgroundColor: `${campus.color}1a` }
    : undefined;
  const fg = campus.color ? campus.color : '#4b5563';

  return (
    <View className={`${wrapperCls} ${className}`} style={tint}>
      <MapPin size={iconSize} color={fg} />
      <Text className={textCls} style={{ color: fg }}>
        {campus.name}
      </Text>
    </View>
  );
}

// Hook: zwraca getCampus(id) zwracający rekord kampusu **tylko** gdy badge ma być widoczny
// (admin/superadmin oglądający "Wszystkie lokalizacje"). W trybie pojedynczego kampusu
// zwraca null — bo wszystkie wiersze i tak są z tego samego kampusu.
export function useCampusBadge() {
  const { selectedCampusId } = useCampusQuery();
  const { campuses } = useCampus();
  const campusById = useMemo(() => {
    const m: Record<number, Campus> = {};
    (campuses || []).forEach((c) => {
      m[c.id] = c;
    });
    return m;
  }, [campuses]);
  const showCampus = !selectedCampusId && (campuses?.length || 0) > 0;
  const getCampus = (campusId: number | null | undefined): Campus | null =>
    showCampus && campusId != null ? campusById[campusId] || null : null;
  return { showCampus, campusById, getCampus };
}

export default CampusBadge;

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

// Pigułka z nazwą kampusu — widoczna tylko gdy admin przegląda „wszystkie lokalizacje”.
// Kolor kampusu = kropka (bez kolorowego tekstu — jasne kolory kampusów były nieczytelne).
export function CampusBadge({ campus, size = 'sm', className = '' }: Props) {
  if (!campus) return null;
  const sm = size === 'sm';
  return (
    <View
      className={className}
      accessibilityLabel={`Lokalizacja: ${campus.name}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        borderRadius: 999,
        backgroundColor: '#ECE8DE',
        paddingHorizontal: sm ? 7 : 9,
        paddingVertical: 2,
      }}
    >
      {campus.color ? (
        <View style={{ width: sm ? 6 : 7, height: sm ? 6 : 7, borderRadius: 4, backgroundColor: campus.color }} />
      ) : (
        <MapPin size={sm ? 10 : 11} color="#4A463E" />
      )}
      <Text style={{ fontSize: sm ? 11 : 12, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>{campus.name}</Text>
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

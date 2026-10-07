import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronDown, Lock, MapPin } from 'lucide-react-native';
import { useCampus, type Campus } from '../contexts/CampusContext';
import { B } from './ui/brand';

type Props = {
  className?: string;
};

// Wybór kampusu (Konto → Lokalizacja). Gdy `canSwitchCampus === false` — pole tylko do odczytu
// z kłódką (lider przypisany do swojego kampusu). Lista w arkuszu (Modal) — wcześniej
// BottomSheet osadzony w przewijanej liście konta rysował się wewnątrz małego pola.
export function CampusSelector({ className = '' }: Props) {
  const { campuses, selectedCampusId, canSwitchCampus, setSelectedCampusId } = useCampus();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const selected = useMemo<Campus | null>(
    () => campuses.find((c) => c.id === selectedCampusId) || null,
    [campuses, selectedCampusId],
  );

  if (campuses.length === 0) return null;

  const choose = (id: number | null) => {
    setSelectedCampusId(id);
    setOpen(false);
  };

  const label = selected ? selected.name : 'Wszystkie lokalizacje';

  const Option = ({ id, name, color }: { id: number | null; name: string; color?: string | null }) => {
    const on = selectedCampusId === id;
    return (
      <Pressable
        onPress={() => choose(id)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        className="active:opacity-70"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 50,
          paddingHorizontal: 14,
          borderRadius: 14,
          backgroundColor: on ? B.kurkumaSoft : B.card,
        }}
      >
        {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : <MapPin size={15} color={B.ink3} />}
        <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: on ? 'Manrope_700Bold' : 'Manrope_500Medium' }}>{name}</Text>
        {on ? <Check size={18} color={B.gold} /> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        onPress={() => canSwitchCampus && setOpen(true)}
        disabled={!canSwitchCampus}
        accessibilityRole="button"
        accessibilityLabel={canSwitchCampus ? `Lokalizacja: ${label}. Zmień` : `Lokalizacja: ${label} (przypisana przez administratora)`}
        className={`active:opacity-70 ${className}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 48,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: B.fieldBorder,
          backgroundColor: B.card,
          paddingHorizontal: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {canSwitchCampus ? <MapPin size={16} color={B.ink3} /> : <Lock size={14} color={B.ink4} />}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: 'Manrope_600SemiBold' }}>
            {label}
          </Text>
        </View>
        {canSwitchCampus ? <ChevronDown size={16} color={B.ink4} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: B.paper,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              gap: 6,
            }}
          >
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD6C6', marginBottom: 8 }} />
            <Text
              accessibilityRole="header"
              style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_700Bold', marginLeft: 4, marginBottom: 4 }}
            >
              Wybierz lokalizację
            </Text>
            <Option id={null} name="Wszystkie lokalizacje" />
            {campuses.map((c) => (
              <Option key={c.id} id={c.id} name={c.name} color={c.color} />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default CampusSelector;

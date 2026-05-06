import React, { useCallback, useMemo, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { Check, ChevronDown, Lock, MapPin } from 'lucide-react-native';
import { useCampus, type Campus } from '../contexts/CampusContext';

type Props = {
  className?: string;
};

// Selector kampusu — wstawiany w Account screen (Faza 5). Gdy `canSwitchCampus === false`,
// renderuje read-only badge z kłódką (lider locked do swojego kampusu).
export function CampusSelector({ className = '' }: Props) {
  const { campuses, selectedCampusId, canSwitchCampus, setSelectedCampusId } = useCampus();
  const sheetRef = useRef<BottomSheet>(null);

  const selected = useMemo<Campus | null>(
    () => campuses.find((c) => c.id === selectedCampusId) || null,
    [campuses, selectedCampusId],
  );

  const open = useCallback(() => {
    if (!canSwitchCampus) return;
    sheetRef.current?.expand();
  }, [canSwitchCampus]);

  const choose = useCallback(
    (id: number | null) => {
      setSelectedCampusId(id);
      sheetRef.current?.close();
    },
    [setSelectedCampusId],
  );

  if (campuses.length === 0) return null;

  return (
    <>
      <Pressable
        onPress={open}
        className={`flex-row items-center justify-between rounded-2xl border border-gray-200 bg-white px-3 py-2 ${className}`}
        disabled={!canSwitchCampus}
      >
        <View className="flex-row items-center gap-2">
          {canSwitchCampus ? (
            <MapPin size={16} color="#6b7280" />
          ) : (
            <Lock size={14} color="#9ca3af" />
          )}
          <Text className="text-sm font-medium text-gray-800">
            {selected ? selected.name : 'Wszystkie lokalizacje'}
          </Text>
        </View>
        {canSwitchCampus && <ChevronDown size={16} color="#9ca3af" />}
      </Pressable>

      <BottomSheet
        ref={sheetRef}
        index={-1}
        enablePanDownToClose
        snapPoints={['50%']}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            opacity={0.5}
          />
        )}
      >
        <BottomSheetView className="px-4 pb-8">
          <Text className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Wybierz lokalizację
          </Text>
          <Pressable
            onPress={() => choose(null)}
            className="flex-row items-center justify-between rounded-xl px-3 py-3 active:bg-gray-100"
          >
            <Text className="text-base text-gray-800">Wszystkie lokalizacje</Text>
            {selectedCampusId === null && <Check size={18} color="#ec4899" />}
          </Pressable>
          {campuses.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => choose(c.id)}
              className="flex-row items-center justify-between rounded-xl px-3 py-3 active:bg-gray-100"
            >
              <Text className="text-base text-gray-800">{c.name}</Text>
              {selectedCampusId === c.id && <Check size={18} color="#ec4899" />}
            </Pressable>
          ))}
        </BottomSheetView>
      </BottomSheet>
    </>
  );
}

export default CampusSelector;

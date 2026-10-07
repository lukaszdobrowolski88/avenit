import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAsyncPress } from '../../hooks/useAsyncPress';

interface Props {
  // Może zwrócić Promise (async zapis) — wtedy przycisk sam blokuje się do jego końca.
  onPress: () => unknown;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const HEIGHT = 52;

// Główny przycisk (CTA) w stylu marki: płaska kurkuma, tekst w kolorze słodu, pełna pigułka.
// Nazwa zostaje (użycia w całej apce), gradient już nie.
// Blokada podwójnego zapisu: async `onPress` → spinner i brak reakcji na kolejne stuknięcia.
export const GradientButton = ({ onPress, children, loading, disabled, accessibilityLabel }: Props) => {
  const { busy, press } = useAsyncPress(onPress, loading);
  return (
    <Pressable
      onPress={press}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : undefined)}
      accessibilityState={{ disabled: !!disabled, busy }}
      className="active:opacity-80"
    >
      <View
        style={{
          height: HEIGHT,
          borderRadius: HEIGHT / 2,
          backgroundColor: '#FFBE0B',
          opacity: disabled ? 0.5 : 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 20,
        }}
      >
        {busy ? (
          <ActivityIndicator color="#2A2312" />
        ) : typeof children === 'string' ? (
          <Text style={{ color: '#2A2312', fontSize: 16, fontFamily: 'Manrope_700Bold' }}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
};

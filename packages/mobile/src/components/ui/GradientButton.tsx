import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

interface Props {
  onPress: () => void;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}

const HEIGHT = 52;

// Główny przycisk (CTA) w stylu marki: płaska kurkuma, tekst w kolorze słodu, pełna pigułka.
// Nazwa zostaje (użycia w całej apce), gradient już nie.
export const GradientButton = ({ onPress, children, loading, disabled }: Props) => (
  <Pressable onPress={onPress} disabled={loading || disabled} className="active:opacity-80">
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
      {loading ? (
        <ActivityIndicator color="#2A2312" />
      ) : typeof children === 'string' ? (
        <Text style={{ color: '#2A2312', fontSize: 16, fontFamily: 'Manrope_700Bold' }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  </Pressable>
);

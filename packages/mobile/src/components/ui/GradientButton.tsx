import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  onPress: () => void;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}

const HEIGHT = 50;

export const GradientButton = ({ onPress, children, loading, disabled }: Props) => {
  return (
    <Pressable onPress={onPress} disabled={loading || disabled}>
      {({ pressed }) => (
        <View
          style={{
            opacity: pressed ? 0.85 : 1,
            height: HEIGHT,
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          <Svg width="100%" height="100%" style={{ position: 'absolute' }}>
            <Defs>
              <LinearGradient id="b" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ec4899" />
                <Stop offset="1" stopColor="#f97316" />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width="100%" height="100%" rx={14} ry={14} fill="url(#b)" />
          </Svg>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <ActivityIndicator color="white" />
            ) : typeof children === 'string' ? (
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '600' }}>{children}</Text>
            ) : (
              children
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
};

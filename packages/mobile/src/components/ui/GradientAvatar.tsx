import { Text, View } from 'react-native';

interface Props {
  initial: string;
  size?: number;
  rounded?: boolean;
}

// Avatar z inicjałem w stylu znaku marki: kurkuma, litera w kolorze słodu.
export const GradientAvatar = ({ initial, size = 56, rounded = true }: Props) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: rounded ? size / 2 : Math.round(size * 0.28),
      backgroundColor: '#FFBE0B',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Text style={{ fontSize: size * 0.42, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
      {initial.toUpperCase()}
    </Text>
  </View>
);

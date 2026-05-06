import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

interface Props {
  initial: string;
  size?: number;
  rounded?: boolean;
}

export const GradientAvatar = ({ initial, size = 56, rounded = true }: Props) => {
  const radius = rounded ? size / 2 : Math.round(size * 0.28);
  const fontSize = size * 0.42;
  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: '#ec4899',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ec4899" />
            <Stop offset="1" stopColor="#f97316" />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} rx={radius} ry={radius} fill="url(#g)" />
        <SvgText
          x={size / 2}
          y={size / 2 + fontSize / 3}
          fontSize={fontSize}
          fontWeight="700"
          textAnchor="middle"
          fill="white"
        >
          {initial.toUpperCase()}
        </SvgText>
      </Svg>
    </View>
  );
};

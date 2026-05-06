import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  Icon: LucideIcon;
  size?: number;
  iconSize?: number;
  from: string;
  to: string;
  iconColor?: string;
  rounded?: boolean;
  shadowColor?: string;
}

export const GradientIcon = ({
  Icon,
  size = 44,
  iconSize,
  from,
  to,
  iconColor = 'white',
  rounded = false,
  shadowColor,
}: Props) => {
  const radius = rounded ? size / 2 : Math.round(size * 0.32);
  const computedIconSize = iconSize ?? Math.round(size * 0.5);
  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: shadowColor ?? to,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
          <Defs>
            <LinearGradient id={`gi-${from}-${to}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect width={size} height={size} rx={radius} ry={radius} fill={`url(#gi-${from}-${to})`} />
        </Svg>
        <Icon size={computedIconSize} color={iconColor} strokeWidth={2.4} />
      </View>
    </View>
  );
};

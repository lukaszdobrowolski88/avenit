import { View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

interface Props {
  Icon: LucideIcon;
  size?: number;
  iconSize?: number;
  rounded?: boolean;
}

// Ikona-znak w stylu marki (jak avatar „a”): kurkuma, ikona w kolorze słodu. Bez gradientu
// i cienia. Nazwa zostaje ze względu na użycia w całej apce.
export const GradientIcon = ({ Icon, size = 44, iconSize, rounded = false }: Props) => (
  <View
    style={{
      width: size,
      height: size,
      borderRadius: rounded ? size / 2 : Math.round(size * 0.32),
      backgroundColor: '#FFBE0B',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Icon size={iconSize ?? Math.round(size * 0.5)} color="#2A2312" strokeWidth={2.2} />
  </View>
);

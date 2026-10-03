import { Pressable, Text, View } from 'react-native';
import { ArrowUpRight, type LucideIcon } from 'lucide-react-native';

interface Props {
  label: string;
  Icon: LucideIcon;
  tint: string;
  bg: string;
  onPress: () => void;
  // Moduł bez ekranu w apce — otwiera się na webie (mała strzałka w rogu).
  isWeb?: boolean;
  badge?: number;
  width: number;
  // Tło kafla — na białej stronie szare, na szarym pulpicie białe.
  surface?: string;
}

// Kafel modułu: ikona w miękkim kwadracie + nazwa. Bez ramek i pasków — tło kafla
// odróżnia go od strony (kanon „miękka pigułka").
export const ModuleTile = ({
  label,
  Icon,
  tint,
  bg,
  onPress,
  isWeb,
  badge,
  width,
  surface = '#f7f6f5',
}: Props) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={isWeb ? `${label}, otwiera się w przeglądarce` : label}
    className="active:opacity-70"
    style={{ width }}
  >
    <View
      style={{
        alignItems: 'center',
        paddingTop: 14,
        paddingBottom: 12,
        paddingHorizontal: 6,
        borderRadius: 18,
        backgroundColor: surface,
        gap: 9,
        minHeight: 104,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={22} color={tint} strokeWidth={2.1} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 12,
          lineHeight: 15,
          textAlign: 'center',
          color: '#1c1917',
          fontFamily: 'Inter_600SemiBold',
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      {isWeb ? (
        <View style={{ position: 'absolute', top: 8, right: 8 }}>
          <ArrowUpRight size={13} color="#a8a29e" strokeWidth={2.4} />
        </View>
      ) : null}
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            minWidth: 20,
            height: 20,
            paddingHorizontal: 6,
            borderRadius: 10,
            backgroundColor: '#ec4899',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: '#ffffff', fontFamily: 'Inter_700Bold' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  </Pressable>
);

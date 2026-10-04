import { Pressable, Text, View } from 'react-native';
import { ArrowUpRight, type LucideIcon } from 'lucide-react-native';

interface Props {
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  // Moduł bez ekranu w apce — otwiera się na webie (mała strzałka w rogu).
  isWeb?: boolean;
  badge?: number;
  width: number;
  // Tło kafla — na białej stronie szare, na szarym pulpicie białe.
  surface?: string;
}

// Kafel modułu: czarna ikona w kółku + nazwa. Monochrom jak pulpit — bez kolorowych
// kwadratów, ramek i pasków; tło kafla odróżnia go od strony.
export const ModuleTile = ({
  label,
  Icon,
  onPress,
  isWeb,
  badge,
  width,
  surface = '#ECE8DE',
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
        paddingTop: 16,
        paddingBottom: 12,
        paddingHorizontal: 6,
        borderRadius: 22,
        backgroundColor: surface,
        gap: 10,
        minHeight: 108,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: surface === '#ffffff' ? '#F6F4EE' : '#ffffff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={21} color="#2A2312" strokeWidth={1.9} />
      </View>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 12,
          lineHeight: 15,
          textAlign: 'center',
          color: '#2A2312',
          fontFamily: 'Manrope_600SemiBold',
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      {isWeb ? (
        <View style={{ position: 'absolute', top: 8, right: 8 }}>
          <ArrowUpRight size={14} color="#A8A59E" strokeWidth={2.2} />
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
            backgroundColor: '#FFBE0B',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      ) : null}
    </View>
  </Pressable>
);

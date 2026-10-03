import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

interface Props {
  title: string;
  Icon: LucideIcon;
  // Kolor widżetu: ikona w miękkim kwadracie (bez gradientów i pasków).
  iconTint?: string;
  iconBg?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  action?: ReactNode;
  children: ReactNode;
}

// Karta pulpitu: biała na ciepłoszarym tle strony. Oddziela ją tło, nie ramka ani cień.
export const WidgetCard = ({
  title,
  Icon,
  iconTint = '#be185d',
  iconBg = '#fce7f3',
  badge,
  badgeBg,
  badgeColor,
  action,
  children,
}: Props) => (
  <View
    style={{
      marginHorizontal: 16,
      marginBottom: 14,
      borderRadius: 22,
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}
  >
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingTop: 15,
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 10,
          backgroundColor: iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={16} color={iconTint} strokeWidth={2.3} />
      </View>
      <Text
        style={{
          flex: 1,
          fontSize: 16,
          color: '#0c0a09',
          letterSpacing: -0.3,
          fontFamily: 'Inter_700Bold',
        }}
      >
        {title}
      </Text>
      {action ? action : null}
      {badge ? (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: badgeBg ?? '#f5f5f4',
          }}
        >
          <Text style={{ fontSize: 11, color: badgeColor ?? '#1c1917', fontFamily: 'Inter_700Bold' }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
    <View>{children}</View>
  </View>
);

import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { B, Monogram } from '../../../components/ui/brand';
import { softBg, boardColor } from '../board';

// Drobne klocki ekranu zadania: awatar osoby i pigułka statusu (kropka w kolorze etykiety
// na miękkim tle — bez pasków-akcentów i tęczy).

export const F = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  xbold: 'Manrope_800ExtraBold',
} as const;

export const PersonAvatar = ({
  name,
  email,
  avatarUrl,
  size = 30,
}: {
  name: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number;
}) => {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: B.paper2 }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }
  return <Monogram name={name || email || '?'} size={size} />;
};

// Kolor etykiety niesie kropka i delikatne tło; tekst zawsze w kolorze słodu (czytelny na każdym
// tle — kolorowy tekst na tincie miewał < 4,5:1).
export const StatusPill = ({
  title,
  color,
  size = 'md',
}: {
  title: string | null;
  color: string | null;
  size?: 'sm' | 'md';
}) => {
  const c = color ? boardColor(color) : B.ink4;
  const sm = size === 'sm';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        maxWidth: '100%',
        paddingHorizontal: sm ? 8 : 11,
        paddingVertical: sm ? 3 : 6,
        borderRadius: 999,
        backgroundColor: title ? softBg(c) : B.paper2,
      }}
    >
      <View style={{ width: sm ? 6 : 8, height: sm ? 6 : 8, borderRadius: 4, backgroundColor: title ? c : B.ink4 }} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: sm ? 11 : 13, color: title ? B.ink : B.ink3, fontFamily: F.bold }}>
        {title ?? 'Bez statusu'}
      </Text>
    </View>
  );
};

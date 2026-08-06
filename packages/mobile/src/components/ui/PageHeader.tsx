import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { GradientIcon } from './GradientIcon';
import { useDS, font, radius } from '../../theme/ds';

interface Props {
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
  showBack?: boolean;
  right?: ReactNode;
}

export const PageHeader = ({ title, subtitle, Icon, showBack = false, right }: Props) => {
  const router = useRouter();
  const { c } = useDS();

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 44, height: 44, borderRadius: radius.icon,
            backgroundColor: c.card, borderWidth: 1, borderColor: c.line,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
          })}
        >
          <ChevronLeft size={21} color={c.ink} strokeWidth={2.2} />
        </Pressable>
      ) : null}
      {Icon && !showBack ? (
        <GradientIcon Icon={Icon} size={42} iconSize={21} from="#FFB24D" to="#F5911F" />
      ) : null}
      <View style={{ flex: 1 }}>
        {subtitle ? (
          <Text style={{ fontSize: 12, color: c.inkSoft, fontFamily: font.medium, letterSpacing: -0.1 }}>{subtitle}</Text>
        ) : null}
        <Text style={{ fontSize: 24, marginTop: 2, color: c.ink, letterSpacing: -0.6, fontFamily: font.display }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
};

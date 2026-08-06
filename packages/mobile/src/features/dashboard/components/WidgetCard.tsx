import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { GradientIcon } from '../../../components/ui/GradientIcon';
import { useDS, radius, font, cardShadow, space } from '../../../theme/ds';

interface Props {
  title: string;
  Icon: LucideIcon;
  iconTint?: string;
  iconBg?: string;
  iconFrom?: string;
  iconTo?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  action?: ReactNode;
  children: ReactNode;
}

export const WidgetCard = ({ title, Icon, iconFrom, iconTo, badge, badgeBg, badgeColor, action, children }: Props) => {
  const { dark, c } = useDS();
  return (
    <View
      style={[
        {
          marginHorizontal: space.screen,
          marginBottom: space.gap,
          borderRadius: radius.card,
          backgroundColor: c.card,
          borderWidth: 1,
          borderColor: c.line,
          overflow: 'hidden',
        },
        cardShadow(dark),
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 15, paddingBottom: 12 }}>
        <GradientIcon Icon={Icon} size={38} iconSize={19} from={iconFrom ?? '#FFB24D'} to={iconTo ?? '#F5911F'} />
        <Text style={{ flex: 1, fontFamily: font.display, fontSize: 16, letterSpacing: -0.3, color: c.ink }}>{title}</Text>
        {action ?? null}
        {badge ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20, backgroundColor: badgeBg ?? c.ground2 }}>
            <Text style={{ fontSize: 11, color: badgeColor ?? c.inkSoft, fontFamily: font.bold }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View>{children}</View>
    </View>
  );
};

import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { GradientIcon } from '../../../components/ui/GradientIcon';

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

export const WidgetCard = ({ title, Icon, badge, badgeBg, badgeColor, action, children }: Props) => {
  return (
    <View
      className="mx-4 mb-3"
      style={{
        borderRadius: 20,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden"
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#eef0f3',
        }}
      >
        <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
          <GradientIcon Icon={Icon} size={36} iconSize={18} from="#f97316" to="#ec4899" />
          <Text
            className="flex-1 text-[16px]"
            style={{
              color: '#0c0a09',
              letterSpacing: -0.3,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {title}
          </Text>
          {action ? action : null}
          {badge ? (
            <View
              className="px-2 py-0.5 rounded-md"
              style={{ backgroundColor: badgeBg ?? '#f5f5f4' }}
            >
              <Text
                className="text-[11px]"
                style={{ color: badgeColor ?? '#1c1917', fontFamily: 'Inter_700Bold' }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        <View>{children}</View>
      </View>
    </View>
  );
};

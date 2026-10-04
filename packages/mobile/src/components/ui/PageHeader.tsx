import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { GradientIcon } from './GradientIcon';

interface Props {
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
  showBack?: boolean;
  right?: ReactNode;
}

export const PageHeader = ({ title, subtitle, Icon, showBack = false, right }: Props) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      className="px-5 pb-4 flex-row items-center gap-3"
      style={{ paddingTop: insets.top + 10 }}
    >
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-60"
          hitSlop={10}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#F1EEE6',
            borderWidth: 1,
            borderColor: '#E3DDD0',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
        </Pressable>
      ) : null}
      {Icon && !showBack ? (
        <GradientIcon Icon={Icon} size={40} iconSize={20} />
      ) : null}
      <View className="flex-1">
        {subtitle ? (
          <Text
            className="text-[12px]"
            style={{
              color: '#6B6557',
              fontFamily: 'Manrope_500Medium',
              letterSpacing: -0.1,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        <Text
          className="text-[24px] mt-0.5"
          style={{
            color: '#2A2312',
            letterSpacing: -0.6,
            fontFamily: 'Manrope_700Bold',
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
};

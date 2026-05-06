import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
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

  return (
    <View className="px-5 pt-12 pb-4 flex-row items-center gap-3">
      {showBack ? (
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-60"
          hitSlop={10}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: '#fafaf9',
            borderWidth: 1,
            borderColor: '#e7e5e4',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
        </Pressable>
      ) : null}
      {Icon && !showBack ? (
        <GradientIcon Icon={Icon} size={40} iconSize={20} from="#f97316" to="#ec4899" />
      ) : null}
      <View className="flex-1">
        {subtitle ? (
          <Text
            className="text-[12px]"
            style={{
              color: '#78716c',
              fontFamily: 'Inter_500Medium',
              letterSpacing: -0.1,
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        <Text
          className="text-[24px] mt-0.5"
          style={{
            color: '#0c0a09',
            letterSpacing: -0.6,
            fontFamily: 'Inter_700Bold',
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

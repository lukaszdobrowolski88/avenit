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

// Nagłówek podstron w stylu marki: biały okrągły „wstecz”, musztardowa etykieta
// (podtytuł wersalikami), duży tytuł; ikona sekcji w kurkumowym kółku jak znak „a”.
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
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: '#FFFFFF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
        </Pressable>
      ) : null}
      {Icon && !showBack ? (
        <GradientIcon Icon={Icon} size={42} iconSize={20} rounded />
      ) : null}
      <View className="flex-1">
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 11,
              color: '#8A6606',
              fontFamily: 'Manrope_700Bold',
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {subtitle}
          </Text>
        ) : null}
        <Text
          style={{
            marginTop: 2,
            fontSize: 27,
            lineHeight: 32,
            color: '#2A2312',
            letterSpacing: -0.9,
            fontFamily: 'Manrope_700Bold',
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
};

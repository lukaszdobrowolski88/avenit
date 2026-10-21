import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { GradientIcon } from './GradientIcon';
import { goBack } from '../../lib/navigation';
import { fitLabelLines } from '../../lib/fitLabel';

interface Props {
  title: string;
  subtitle?: string;
  Icon?: LucideIcon;
  showBack?: boolean;
  right?: ReactNode;
}

// Nagłówek podstron w stylu marki: biały okrągły „wstecz”, musztardowa etykieta
// (podtytuł wersalikami), duży tytuł; ikona sekcji w kurkumowym kółku jak znak „a”.
// Tytuł nigdy nie łamie słowa w środku („Komunik/ator”): po zmierzeniu miejsca liczymy linie
// jak FitLabel — jedno słowo albo słowo dłuższe niż linia → 1 linia z lekkim zmniejszeniem
// czcionki, kilka krótszych słów → do 2 linii między słowami. Przed pomiarem — 1 linia.
// Przy wielu akcjach po prawej (`right`) zostaw tytułowi miejsce: najwyżej 2 okrągłe przyciski,
// resztę schowaj w „Więcej” (jak Komunikator).
const TITLE_SIZE = 27;

export const PageHeader = ({ title, subtitle, Icon, showBack = false, right }: Props) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [titleWidth, setTitleWidth] = useState(0);
  const titleLines = titleWidth > 0 ? fitLabelLines(title, { width: titleWidth, fontSize: TITLE_SIZE, maxLines: 2 }) : 1;

  return (
    <View
      className="px-5 pb-4 flex-row items-center gap-3"
      style={{ paddingTop: insets.top + 10 }}
    >
      {showBack ? (
        <Pressable
          onPress={() => goBack(router)}
          accessibilityRole="button"
          accessibilityLabel="Wstecz"
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
      <View className="flex-1" onLayout={(e) => setTitleWidth(Math.round(e.nativeEvent.layout.width))}>
        {subtitle ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
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
          accessibilityRole="header"
          style={{
            marginTop: 2,
            fontSize: TITLE_SIZE,
            lineHeight: 32,
            color: '#2A2312',
            letterSpacing: -0.9,
            fontFamily: 'Manrope_700Bold',
          }}
          numberOfLines={titleLines}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {title}
        </Text>
      </View>
      {right ?? null}
    </View>
  );
};

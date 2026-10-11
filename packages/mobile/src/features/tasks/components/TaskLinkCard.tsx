import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, SquareCheckBig } from 'lucide-react-native';
import { FONT as F } from '../../../lib/fonts';
import { openTask, type TaskTarget } from '../navigation';

// Karta zadania w dymku czatu — zamiast podglądu linku, gdy wiadomość niesie link do zadania
// tego tenanta („Wyślij do czatu” z weba albo apki). Stuknięcie otwiera ekran zadania w apce.
// Kolory jak LinkPreviewCard (własny dymek ciemny, cudzy jasny).
export const TaskLinkCard = ({
  target,
  name,
  mine,
  onLongPress,
}: {
  target: TaskTarget;
  name: string | null;
  mine: boolean;
  onLongPress?: () => void;
}) => {
  const router = useRouter();
  const fg = mine ? '#ffffff' : '#2A2312';
  const sub = mine ? '#F3E3B0' : '#6B6557';
  return (
    <Pressable
      onPress={() => openTask(router, target)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="link"
      accessibilityLabel={`Zadanie${name ? `: ${name}` : ''}. Otwórz`}
      className="active:opacity-80"
      style={{
        marginTop: 6,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: mine ? 'rgba(255,255,255,0.12)' : '#F6F4EE',
        borderWidth: 1,
        borderColor: mine ? 'rgba(255,255,255,0.18)' : '#E6E1D5',
        maxWidth: 280,
      }}
    >
      <SquareCheckBig size={16} color={fg} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: sub, fontFamily: F.semibold }}>Zadanie</Text>
        <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: fg, fontFamily: F.bold }}>
          {name || 'Otwórz zadanie'}
        </Text>
      </View>
      <ChevronRight size={16} color={sub} />
    </Pressable>
  );
};

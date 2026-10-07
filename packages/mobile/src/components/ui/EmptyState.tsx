import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { B } from './brand';
import { useAsyncPress } from '../../hooks/useAsyncPress';

// Wspólny pusty stan (jak EmptyState na webie): ikona w kółku + tytuł + podpowiedź + akcja.
// Pusty stan mówi, co tu będzie, i — gdy się da — daje pierwszy krok (np. „Dodaj intencję”).
//   <EmptyState Icon={Inbox} title="Brak zadań" hint="Dodaj pierwsze zadanie." actionLabel="Dodaj" onAction={…} />
// compact — w kartach/widżetach (mniej powietrza, mniejsza ikona).
export const EmptyState = ({
  Icon,
  title,
  hint,
  actionLabel,
  onAction,
  compact,
  style,
}: {
  Icon?: LucideIcon;
  title: string;
  hint?: string | null;
  actionLabel?: string;
  onAction?: () => unknown;
  compact?: boolean;
  style?: ViewStyle;
}) => {
  const { busy, press } = useAsyncPress(onAction);
  const size = compact ? 48 : 60;
  return (
    <View style={[{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: compact ? 22 : 40 }, style]}>
      {Icon ? (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: B.kurkumaSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: compact ? 10 : 14,
          }}
        >
          <Icon size={compact ? 22 : 26} color={B.goldDeep} strokeWidth={2} />
        </View>
      ) : null}
      <Text style={{ fontSize: compact ? 15 : 17, color: B.ink, textAlign: 'center', letterSpacing: -0.3, fontFamily: 'Manrope_700Bold' }}>
        {title}
      </Text>
      {hint ? (
        <Text style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: B.ink3, textAlign: 'center', fontFamily: 'Manrope_500Medium' }}>
          {hint}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={press}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          className="active:opacity-80"
          style={{
            marginTop: 16,
            minHeight: 44,
            paddingHorizontal: 20,
            borderRadius: 999,
            backgroundColor: B.kurkuma,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {busy ? (
            <ActivityIndicator color={B.ink} />
          ) : (
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: 'Manrope_700Bold' }}>{actionLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
};

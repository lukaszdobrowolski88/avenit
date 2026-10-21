import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Headphones, Mic } from 'lucide-react-native';
import { B } from '../../components/ui/brand';
import { FONT as F } from '../../lib/fonts';
import { openOnWeb } from '../modules/useModules';
import { CARD_POLL_MS, cardSummary, type SessionGetResponse } from './logic';
import { fetchSession } from './useListener';

// Karta „Tłumaczenie na żywo” na ekranie wydarzenia (obok „Spotkania online”). Jedno wywołanie
// interp-session-get na wejście w wydarzenie; karta tylko, gdy wydarzenie ma niezakończone
// tłumaczenie z językami (błąd / brak sesji / starszy serwer — bez karty, po cichu).
export function InterpretationCard({ eventId, style }: { eventId: number; style?: ViewStyle }) {
  const router = useRouter();
  const q = useQuery({
    queryKey: ['interp-session', eventId],
    queryFn: async () => {
      try {
        const r = (await fetchSession(eventId)) as SessionGetResponse & { my_channels?: string[] };
        // Tylko to, czego potrzebuje karta (cache trafia na dysk — bez linku publicznego i osób).
        const s = r?.session;
        return {
          my_channels: Array.isArray(r?.my_channels) ? r.my_channels : [],
          session: s
            ? { status: s.status, channels: (s.channels ?? []).map((c) => ({ id: c.id, lang_code: c.lang_code, label: c.label, status: c.status })) }
            : null,
        };
      } catch {
        return null;
      }
    },
    staleTime: 15_000,
    retry: false,
    // Odświeżamy tylko, gdy karta jest widoczna (stan „na żywo”).
    refetchInterval: (query) => (cardSummary(query.state.data as SessionGetResponse | null).show ? CARD_POLL_MS : false),
  });
  const data = q.data ?? null;
  const sum = cardSummary(data);
  if (!sum.show) return null;
  const interpreter = (data?.my_channels?.length ?? 0) > 0;
  const live = sum.live.length > 0;

  return (
    <View style={[{ backgroundColor: B.card, borderRadius: 22, padding: 16, gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Headphones size={17} color={B.gold} />
        <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>Tłumaczenie na żywo</Text>
        {live ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: B.okBg }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: B.okFg }} />
            <Text style={{ fontSize: 12, color: B.okFg, fontFamily: F.semibold }}>na żywo</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink2, fontFamily: F.medium }}>
        {live ? `Teraz nadaje: ${sum.live.join(', ')}.` : `Języki: ${sum.languages.join(', ')}. Tłumacz jeszcze nie zaczął.`}
      </Text>
      <Pressable
        onPress={() => router.push({ pathname: '/(app)/interpretation/[eventId]', params: { eventId: String(eventId) } } as never)}
        accessibilityRole="button"
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: B.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, alignSelf: 'flex-start' }}
      >
        <Headphones size={14} color={B.onDark} />
        <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.bold }}>Słuchaj tłumaczenia</Text>
      </Pressable>
      {interpreter ? (
        <Pressable
          onPress={() => void openOnWeb(`/tlumaczenie/konsola/${encodeURIComponent(String(eventId))}`)}
          accessibilityRole="link"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 }}
        >
          <Mic size={13} color={B.ink} />
          <Text style={{ fontSize: 12, color: B.ink, fontFamily: F.bold }}>Konsola tłumacza (w przeglądarce)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

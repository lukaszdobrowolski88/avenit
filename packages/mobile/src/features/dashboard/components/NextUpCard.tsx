import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ArrowUpRight, MapPin } from 'lucide-react-native';
import { D, F } from '../theme';
import type { UpcomingEvent } from '../extras';
import { goToTab } from '../../../lib/navigation';

const parseLocal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export const dayLabel = (ymd: string) => {
  const date = parseLocal(ymd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  const label = diff < 7 ? format(date, 'EEEE', { locale: pl }) : format(date, 'd MMMM', { locale: pl });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

interface Props {
  event: UpcomingEvent;
  // Moja rola, gdy służę na tym wydarzeniu (grafik).
  myRole?: string | null;
}

// Najbliższe wydarzenie — karta-bohater pod nagłówkiem, w jasnej kurkumie (jak posty marki).
export const NextUpCard = ({ event, myRole }: Props) => {
  const router = useRouter();
  const when = [dayLabel(event.date), event.time].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={() => goToTab(router, 'calendar')}
      accessibilityLabel={`Najbliższe: ${event.title}, ${when}`}
      className="active:opacity-80"
      style={{ marginHorizontal: 16, marginBottom: 28, borderRadius: 28, minHeight: 176, backgroundColor: D.accentSoft }}
    >
      <View style={{ flex: 1, padding: 18, justifyContent: 'space-between', gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.8)',
            }}
          >
            <Text style={{ fontSize: 12, color: D.ink, fontFamily: F.semibold }}>Najbliższe</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 13, color: D.ink2, fontFamily: F.semibold }}>{when}</Text>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: D.ink,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowUpRight size={18} color={D.accent} strokeWidth={2.2} />
          </View>
        </View>

        <View>
          <Text
            numberOfLines={2}
            style={{ fontSize: 26, lineHeight: 30, letterSpacing: -0.9, color: D.ink, fontFamily: F.bold }}
          >
            {event.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {event.location ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <MapPin size={13} color="#5B4A50" strokeWidth={2} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: D.ink2, fontFamily: F.medium }}>
                  {event.location}
                </Text>
              </View>
            ) : null}
            {myRole ? (
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: D.ink }}>
                <Text style={{ fontSize: 12, color: D.page, fontFamily: F.semibold }}>Służysz · {myRole}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { WidgetCard } from './WidgetCard';
import { dayLabel } from './NextUpCard';
import { D, F } from '../theme';
import type { UpcomingEvent } from '../extras';
import { goToTab } from '../../../lib/navigation';

const parseLocal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

// Kolejne wydarzenia (pierwsze jest w karcie „Najbliższe” nad listą).
export const UpcomingEventsWidget = ({ events }: { events: UpcomingEvent[] }) => {
  const router = useRouter();
  if (events.length === 0) return null;
  return (
    <WidgetCard title="Wydarzenia" actionLabel="Kalendarz" onAction={() => goToTab(router, 'calendar')}>
      <View style={{ padding: 8 }}>
        {events.map((ev) => {
          const date = parseLocal(ev.date);
          return (
            <Pressable
              key={ev.id}
              onPress={() => router.push({ pathname: '/(app)/events/[id]', params: { id: ev.id } })}
              className="active:opacity-70"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 8 }}
            >
              <View
                style={{
                  width: 48,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: D.well,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 19, lineHeight: 22, color: D.ink, fontFamily: F.bold, letterSpacing: -0.5 }}>
                  {date.getDate()}
                </Text>
                <Text style={{ fontSize: 11, color: D.ink2, fontFamily: F.medium }}>
                  {format(date, 'LLL', { locale: pl })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, color: D.ink, fontFamily: F.semibold, letterSpacing: -0.2 }}>
                  {ev.title}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: 13, color: D.ink2, fontFamily: F.medium, marginTop: 2 }}>
                  {[dayLabel(ev.date), ev.time, ev.location].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </WidgetCard>
  );
};

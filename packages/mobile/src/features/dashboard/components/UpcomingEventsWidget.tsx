import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { CalendarDays, MapPin } from 'lucide-react-native';
import { WidgetCard } from './WidgetCard';
import type { UpcomingEvent } from '../extras';

const parseLocal = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const dayLabel = (ymd: string) => {
  const date = parseLocal(ymd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Dziś';
  if (diff === 1) return 'Jutro';
  if (diff < 7) {
    const w = format(date, 'EEEE', { locale: pl });
    return w.charAt(0).toUpperCase() + w.slice(1);
  }
  return format(date, 'd MMMM', { locale: pl });
};

export const UpcomingEventsWidget = ({ events }: { events: UpcomingEvent[] }) => {
  const router = useRouter();
  if (events.length === 0) return null;
  return (
    <WidgetCard
      title="Nadchodzące wydarzenia"
      Icon={CalendarDays}
      iconTint="#0e7490"
      iconBg="#cffafe"
      action={
        <Pressable onPress={() => router.push('/(app)/calendar')} hitSlop={8}>
          <Text style={{ fontSize: 13, color: '#0e7490', fontFamily: 'Inter_600SemiBold' }}>Kalendarz</Text>
        </Pressable>
      }
    >
      <View style={{ paddingHorizontal: 8, paddingBottom: 8 }}>
        {events.map((ev) => {
          const date = parseLocal(ev.date);
          return (
            <Pressable
              key={ev.id}
              onPress={() => router.push('/(app)/calendar')}
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 9,
                paddingHorizontal: 8,
                borderRadius: 14,
                backgroundColor: 'transparent',
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 46,
                  borderRadius: 12,
                  backgroundColor: '#f0fdff',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 17, color: '#0e7490', fontFamily: 'Inter_700Bold', lineHeight: 20 }}>
                  {date.getDate()}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    color: '#0e7490',
                    fontFamily: 'Inter_600SemiBold',
                    textTransform: 'uppercase',
                  }}
                >
                  {format(date, 'LLL', { locale: pl })}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold', letterSpacing: -0.2 }}
                >
                  {ev.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                    {dayLabel(ev.date)}
                    {ev.time ? ` · ${ev.time}` : ''}
                  </Text>
                  {ev.location ? (
                    <>
                      <MapPin size={11} color="#a8a29e" style={{ marginLeft: 4 }} />
                      <Text
                        numberOfLines={1}
                        style={{ flexShrink: 1, fontSize: 12, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
                      >
                        {ev.location}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </WidgetCard>
  );
};

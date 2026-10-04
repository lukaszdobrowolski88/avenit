import { Fragment, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Baby,
  Calendar,
  Home,
  Image as ImageIcon,
  ListChecks,
  Music,
  Sparkles,
  ChevronRight,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { InfoBlock } from '../../../components/ui/brand';
import type { AgendaEvent, EventSource } from '../api';

const SOURCE_META: Record<
  EventSource,
  { label: string; tint: string; bg: string; Icon: typeof Calendar }
> = {
  program: { label: 'Program', tint: '#8A6606', bg: '#FFF1C2', Icon: ListChecks },
  event: { label: 'Wydarzenie', tint: '#2A2312', bg: '#ECE8DE', Icon: Calendar },
  worship: { label: 'Zespół Uwielbienia', tint: '#9d174d', bg: '#FFF1C2', Icon: Music },
  media: { label: 'Media Team', tint: '#2A2312', bg: '#ECE8DE', Icon: ImageIcon },
  atmosfera: { label: 'Atmosfera Team', tint: '#8A6606', bg: '#FFF1C2', Icon: Sparkles },
  kids: { label: 'Dzieci', tint: '#2A2312', bg: '#ECE8DE', Icon: Baby },
  homegroups: { label: 'Grupy Domowe', tint: '#2A2312', bg: '#ECE8DE', Icon: Home },
};

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const groupByDate = (items: AgendaEvent[]): { date: Date; items: AgendaEvent[] }[] => {
  const map = new Map<string, AgendaEvent[]>();
  for (const it of items) {
    const d = toDate(it.startsAt);
    // Klucz dnia w LOKALNEJ strefie — toISOString() zwraca UTC i w PL (UTC+1/+2)
    // wydarzenia o północy trafiłyby do poprzedniego dnia (niedziela pod sobotę).
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([k, v]) => ({ date: new Date(k + 'T00:00:00'), items: v }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
};

const formatHourMinute = (d: Date): string =>
  d.getHours() === 0 && d.getMinutes() === 0
    ? ''
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const groupHeaderLabel = (date: Date, today: Date, tomorrow: Date) => {
  if (sameDay(date, today)) return 'Dziś';
  if (sameDay(date, tomorrow)) return 'Jutro';
  const out = format(date, 'EEEE, d MMMM', { locale: pl });
  return out.charAt(0).toUpperCase() + out.slice(1);
};

interface Props {
  items: AgendaEvent[];
  onPick: (evt: AgendaEvent) => void;
}

export const AgendaList = ({ items, onPick }: Props) => {
  const groups = useMemo(() => groupByDate(items), [items]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => {
    const t = startOfDay(new Date());
    t.setDate(t.getDate() + 1);
    return t;
  }, []);

  if (groups.length === 0) {
    return (
      <Text
        style={{
          textAlign: 'center',
          paddingVertical: 48,
          color: '#6B6557',
          fontFamily: 'Manrope_500Medium',
        }}
      >
        Brak wydarzeń.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {groups.map(({ date, items: groupItems }) => {
        const dayNum = format(date, 'd', { locale: pl });
        const monthShort = format(date, 'MMM', { locale: pl }).toUpperCase();
        const isToday = sameDay(date, today);
        const isPast = date.getTime() < today.getTime();

        return (
          <Fragment key={date.toISOString()}>
            <View style={styles.dayHeader}>
              <View
                style={[
                  styles.dayBadge,
                  isToday && styles.dayBadgeToday,
                  isPast && !isToday && styles.dayBadgePast,
                ]}
              >
                <Text
                  style={[
                    styles.dayBadgeMonth,
                    isToday && { color: '#CFC8B6' },
                    isPast && !isToday && { color: '#857F70' },
                  ]}
                >
                  {monthShort}
                </Text>
                <Text
                  style={[
                    styles.dayBadgeNum,
                    isToday && { color: '#FFBE0B' },
                    isPast && !isToday && { color: '#857F70' },
                  ]}
                >
                  {dayNum}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayLabel}>{groupHeaderLabel(date, today, tomorrow)}</Text>
                <Text style={styles.dayCount}>
                  {groupItems.length} {groupItems.length === 1 ? 'wydarzenie' : 'wydarzeń'}
                </Text>
              </View>
            </View>

            {/* Wydarzenia dnia w jednej białej karcie; na początku godzina (moje — słód z kurkumą). */}
            <View style={styles.dayCard}>
              {groupItems.map((evt, idx) => {
                const meta = SOURCE_META[evt.source];
                const time = formatHourMinute(toDate(evt.startsAt));
                return (
                  <Pressable key={evt.id} onPress={() => onPick(evt)} className="active:opacity-70" style={styles.row}>
                    <InfoBlock top={time || 'cały'} bottom={time ? null : 'dzień'} dark={evt.isMine} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kind}>{evt.isMine ? `Moje · ${meta.label}` : meta.label}</Text>
                      <Text numberOfLines={1} style={styles.title}>
                        {evt.title}
                      </Text>
                      {evt.location ? (
                        <Text numberOfLines={1} style={styles.metaText}>
                          {evt.location}
                        </Text>
                      ) : null}
                    </View>
                    <ChevronRight size={18} color="#857F70" />
                    {idx < groupItems.length - 1 ? <View style={styles.divider} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 16 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 10 },
  dayBadge: {
    width: 44,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#ECE8DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeToday: { backgroundColor: '#2A2312' },
  dayBadgePast: { opacity: 0.55 },
  dayBadgeMonth: { fontSize: 9, color: '#6B6557', fontFamily: 'Manrope_700Bold', letterSpacing: 0.6 },
  dayBadgeNum: {
    fontSize: 18,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
    marginTop: 1,
  },
  dayLabel: { fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_700Bold', letterSpacing: -0.3 },
  dayCount: { fontSize: 11, color: '#857F70', fontFamily: 'Manrope_500Medium', marginTop: 2 },
  dayCard: { borderRadius: 22, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { position: 'absolute', left: 82, right: 0, bottom: 0, height: 1, backgroundColor: '#ECE8DE' },
  kind: { fontSize: 11, color: '#8A6606', letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginBottom: 2 },
  title: {
    fontSize: 16,
    color: '#2A2312',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.3,
  },
  metaText: { fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_500Medium', marginTop: 2 },
});

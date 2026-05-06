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
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { AgendaEvent, EventSource } from '../api';

const SOURCE_META: Record<
  EventSource,
  { label: string; tint: string; bg: string; Icon: typeof Calendar }
> = {
  program: { label: 'Program', tint: '#be185d', bg: '#fce7f3', Icon: ListChecks },
  event: { label: 'Wydarzenie', tint: '#0e7490', bg: '#cffafe', Icon: Calendar },
  worship: { label: 'Zespół Uwielbienia', tint: '#9d174d', bg: '#fce7f3', Icon: Music },
  media: { label: 'Media Team', tint: '#1d4ed8', bg: '#dbeafe', Icon: ImageIcon },
  atmosfera: { label: 'Atmosfera Team', tint: '#b45309', bg: '#fef3c7', Icon: Sparkles },
  kids: { label: 'Dzieci', tint: '#047857', bg: '#d1fae5', Icon: Baby },
  homegroups: { label: 'Grupy Domowe', tint: '#6d28d9', bg: '#ede9fe', Icon: Home },
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
    const key = d.toISOString().slice(0, 10);
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
          color: '#78716c',
          fontFamily: 'Inter_500Medium',
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
                    isToday && { color: '#ffffff' },
                    isPast && !isToday && { color: '#a8a29e' },
                  ]}
                >
                  {monthShort}
                </Text>
                <Text
                  style={[
                    styles.dayBadgeNum,
                    isToday && { color: '#ffffff' },
                    isPast && !isToday && { color: '#a8a29e' },
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

            {groupItems.map((evt) => {
              const meta = SOURCE_META[evt.source];
              const time = formatHourMinute(toDate(evt.startsAt));
              return (
                <Pressable
                  key={evt.id}
                  onPress={() => onPick(evt)}
                  style={({ pressed }) => [styles.cardShadow, pressed && { opacity: 0.85 }]}
                >
                  <View style={[styles.cardInner, evt.isMine && styles.cardInnerMine]}>
                    <View style={[styles.icon, { backgroundColor: meta.bg }]}>
                      <meta.Icon size={18} color={meta.tint} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={styles.title}>
                        {evt.title}
                      </Text>
                      <View style={styles.metaRow}>
                        <View style={[styles.tagPill, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.tagPillText, { color: meta.tint }]}>
                            {meta.label}
                          </Text>
                        </View>
                        {time ? <Text style={styles.metaText}>{time}</Text> : null}
                        {evt.location ? (
                          <Text numberOfLines={1} style={styles.metaText}>
                            · {evt.location}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {evt.isMine ? (
                      <View style={styles.minePill}>
                        <Text style={styles.minePillText}>MOJE</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
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
    borderRadius: 12,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#eef0f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeToday: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  dayBadgePast: { opacity: 0.55 },
  dayBadgeMonth: { fontSize: 9, color: '#78716c', fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  dayBadgeNum: {
    fontSize: 18,
    color: '#0c0a09',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
    marginTop: 1,
  },
  dayLabel: { fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
  dayCount: { fontSize: 11, color: '#a8a29e', fontFamily: 'Inter_500Medium', marginTop: 2 },
  cardShadow: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1,
    marginBottom: 8,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  cardInnerMine: { borderColor: '#fbcfe8', backgroundColor: '#fef3f2' },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    color: '#0c0a09',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  tagPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagPillText: { fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.2 },
  metaText: { fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium' },
  minePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#ec4899' },
  minePillText: {
    fontSize: 9,
    color: '#ffffff',
    letterSpacing: 0.6,
    fontFamily: 'Inter_700Bold',
  },
});

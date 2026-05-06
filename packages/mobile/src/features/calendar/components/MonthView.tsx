import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { AgendaEvent, EventSource } from '../api';

const SOURCE_DOT: Record<EventSource, string> = {
  program: '#ec4899',
  event: '#0891b2',
  worship: '#a855f7',
  media: '#f97316',
  atmosfera: '#14b8a6',
  kids: '#eab308',
  homegroups: '#3b82f6',
};

const SOURCE_LABEL: Record<EventSource, string> = {
  program: 'Program',
  event: 'Wydarzenie',
  worship: 'Zespół Uwielbienia',
  media: 'Media Team',
  atmosfera: 'Atmosfera Team',
  kids: 'Dzieci',
  homegroups: 'Grupy Domowe',
};

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

const isoKey = (d: Date) => d.toISOString().slice(0, 10);

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

const buildMonthGrid = (anchor: Date): Date[] => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const dayOfWeek = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - dayOfWeek);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));

interface Props {
  items: AgendaEvent[];
  onPick: (evt: AgendaEvent) => void;
}

export const MonthView = ({ items, onPick }: Props) => {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [anchor, setAnchor] = useState<Date>(today);
  const [selected, setSelected] = useState<Date>(today);

  const grid = useMemo(() => buildMonthGrid(anchor), [anchor]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, AgendaEvent[]>();
    for (const it of items) {
      const k = isoKey(toDate(it.startsAt));
      const arr = m.get(k) ?? [];
      arr.push(it);
      m.set(k, arr);
    }
    return m;
  }, [items]);

  const dayItems = eventsByDay.get(isoKey(selected)) ?? [];

  const headerLabel = format(anchor, 'LLLL yyyy', { locale: pl });
  const headerLabelCap = headerLabel.charAt(0).toUpperCase() + headerLabel.slice(1);

  const movMonth = (delta: -1 | 1) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1);
    setAnchor(next);
  };

  const goToday = () => {
    setAnchor(today);
    setSelected(today);
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.monthHeader}>
        <Pressable onPress={() => movMonth(-1)} hitSlop={10} style={styles.navBtn}>
          <ChevronLeft size={18} color="#1c1917" />
        </Pressable>
        <Pressable onPress={goToday} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.monthTitle}>{headerLabelCap}</Text>
          <Text style={styles.monthSub}>Stuknij, by wrócić do dziś</Text>
        </Pressable>
        <Pressable onPress={() => movMonth(1)} hitSlop={10} style={styles.navBtn}>
          <ChevronRight size={18} color="#1c1917" />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekdayCell}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((d, i) => {
          const sameMonth = d.getMonth() === anchor.getMonth();
          const isToday = isoKey(d) === isoKey(today);
          const isSelected = isoKey(d) === isoKey(selected);
          const dayEvents = eventsByDay.get(isoKey(d)) ?? [];
          const sources = Array.from(new Set(dayEvents.map((e) => e.source))).slice(0, 3);
          const hasMine = dayEvents.some((e) => e.isMine);

          return (
            <Pressable
              key={i}
              onPress={() => setSelected(d)}
              style={[
                styles.cell,
                isSelected && styles.cellSelected,
                isToday && !isSelected && styles.cellToday,
              ]}
            >
              <Text
                style={[
                  styles.cellNum,
                  !sameMonth && { color: '#d6d3d1' },
                  isSelected && { color: '#ffffff' },
                  isToday && !isSelected && { color: '#ec4899' },
                ]}
              >
                {d.getDate()}
              </Text>
              <View style={styles.dotsRow}>
                {sources.map((s) => (
                  <View
                    key={s}
                    style={[
                      styles.dot,
                      { backgroundColor: isSelected ? '#ffffff' : SOURCE_DOT[s] },
                    ]}
                  />
                ))}
                {hasMine ? (
                  <View
                    style={[styles.dotRing, isSelected && { borderColor: '#ffffff' }]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dayPanel}>
        <Text style={styles.dayPanelTitle}>
          {(() => {
            const out = format(selected, 'EEEE, d MMMM', { locale: pl });
            return out.charAt(0).toUpperCase() + out.slice(1);
          })()}
        </Text>
        {dayItems.length === 0 ? (
          <Text style={styles.emptyText}>Brak wydarzeń tego dnia.</Text>
        ) : (
          dayItems.map((evt) => {
            const start = toDate(evt.startsAt);
            const hasTime = start.getHours() !== 0 || start.getMinutes() !== 0;
            const time = hasTime ? format(start, 'HH:mm') : 'Cały dzień';
            return (
              <Pressable
                key={evt.id}
                onPress={() => onPick(evt)}
                style={({ pressed }) => [
                  styles.dayRow,
                  evt.isMine && styles.dayRowMine,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.dayDot, { backgroundColor: SOURCE_DOT[evt.source] }]} />
                <View style={styles.dayTimeBox}>
                  <Text style={styles.dayTime}>{time}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.dayTitle}>
                    {evt.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.daySub}>
                    {SOURCE_LABEL[evt.source]}
                    {evt.location ? ` · ${evt.location}` : ''}
                  </Text>
                </View>
                {evt.isMine ? (
                  <View style={styles.minePill}>
                    <Text style={styles.minePillText}>MOJE</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#eef0f3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 18,
    color: '#0c0a09',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.4,
  },
  monthSub: { fontSize: 11, color: '#a8a29e', fontFamily: 'Inter_500Medium', marginTop: 1 },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#a8a29e',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.6,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  cellSelected: { backgroundColor: '#ec4899' },
  cellToday: { backgroundColor: '#fef3f2' },
  cellNum: { fontSize: 14, color: '#1c1917', fontFamily: 'Inter_600SemiBold' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, minHeight: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#ec4899',
    backgroundColor: 'transparent',
  },
  dayPanel: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eef0f3',
  },
  dayPanelTitle: {
    fontSize: 13,
    color: '#0c0a09',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.2,
    marginBottom: 10,
  },
  emptyText: {
    paddingVertical: 24,
    textAlign: 'center',
    color: '#a8a29e',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#eef0f3',
    backgroundColor: '#ffffff',
  },
  dayRowMine: { borderColor: '#fbcfe8', backgroundColor: '#fef3f2' },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  dayTimeBox: { minWidth: 56, alignItems: 'flex-start' },
  dayTime: {
    fontSize: 12,
    color: '#57534e',
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  dayTitle: {
    fontSize: 14,
    color: '#0c0a09',
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: -0.2,
  },
  daySub: { fontSize: 11, color: '#78716c', fontFamily: 'Inter_500Medium', marginTop: 2 },
  minePill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#ec4899',
  },
  minePillText: {
    fontSize: 9,
    color: '#ffffff',
    letterSpacing: 0.4,
    fontFamily: 'Inter_700Bold',
  },
});

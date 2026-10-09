import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, CalendarDays, CheckCircle2, Circle } from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { AgendaEvent } from '../api';
import { timeRange, useCalendarLabel } from '../meta';
import { StatusPill } from '../../tasks/components/bits';
import { openTask } from '../../tasks/navigation';

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

// Klucz dnia w LOKALNEJ strefie — toISOString() (UTC) przesuwałby wydarzenia
// o północy do sąsiedniej komórki w PL (UTC+1/+2).
const isoKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  const calendarLabel = useCalendarLabel();
  const router = useRouter();
  // Zadanie (evt.task) → ekran zadania; wydarzenie → jak dotąd (onPick rodzica).
  const pick = (evt: AgendaEvent) =>
    evt.task ? openTask(router, { itemId: evt.task.itemId, boardId: evt.task.boardId }) : onPick(evt);
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
          <ChevronLeft size={18} color="#2A2312" />
        </Pressable>
        <Pressable onPress={goToday} style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.monthTitle}>{headerLabelCap}</Text>
          <Text style={styles.monthSub}>Stuknij, by wrócić do dziś</Text>
        </Pressable>
        <Pressable onPress={() => movMonth(1)} hitSlop={10} style={styles.navBtn}>
          <ChevronRight size={18} color="#2A2312" />
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
          // Kropka = wydarzenie (do 3), kurkuma = moja służba.
          const dots = dayEvents.slice(0, 3);

          return (
            <Pressable
              key={i}
              onPress={() => setSelected(d)}
              // Pressable dostaje zwykły obiekt (tablica/funkcja stylu psuje się z NativeWind).
              style={StyleSheet.flatten([
                styles.cell,
                isSelected && styles.cellSelected,
                isToday && !isSelected && styles.cellToday,
              ])}
            >
              <Text
                style={[
                  styles.cellNum,
                  !sameMonth && { color: '#9A9586' },
                  isSelected && { color: '#ffffff' },
                  isToday && !isSelected && { color: '#8A6606' },
                ]}
              >
                {d.getDate()}
              </Text>
              <View style={styles.dotsRow}>
                {/* Kropka = wydarzenie (kurkuma = moja służba), kółko = zadanie. */}
                {dots.map((e) =>
                  e.task ? (
                    <View
                      key={e.id}
                      style={[styles.dotRing, { borderColor: isSelected ? '#F6F4EE' : '#6B6557' }]}
                    />
                  ) : (
                    <View
                      key={e.id}
                      style={[
                        styles.dot,
                        { backgroundColor: isSelected ? '#F6F4EE' : e.isMine ? '#FFBE0B' : '#6B6557' },
                      ]}
                    />
                  ),
                )}
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.dayPanel}>
        <View style={styles.dayPanelHead}>
          <Text style={styles.dayPanelTitle}>
            {(() => {
              const out = format(selected, 'EEEE, d MMMM', { locale: pl });
              return out.charAt(0).toUpperCase() + out.slice(1);
            })()}
          </Text>
          {dayItems.length > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{dayItems.length}</Text>
            </View>
          ) : null}
        </View>
        {dayItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <CalendarDays size={26} color="#6E685A" strokeWidth={1.8} />
            <Text style={styles.emptyText}>Nic zaplanowanego tego dnia</Text>
          </View>
        ) : (
          dayItems.map((evt) => {
            if (evt.task) {
              const t = evt.task;
              return (
                <Pressable
                  key={evt.id}
                  onPress={() => pick(evt)}
                  accessibilityRole="button"
                  accessibilityLabel={`Zadanie: ${evt.title}${t.done ? ', zrobione' : ''}`}
                  className="active:opacity-70"
                  style={{ marginBottom: 6 }}
                >
                  <View style={styles.taskRow}>
                    {t.done ? <CheckCircle2 size={16} color="#1E6B34" /> : <Circle size={16} color="#6B6557" />}
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={[styles.dayTitle, t.done ? { color: '#6E685A', textDecorationLine: 'line-through' } : null]}
                      >
                        {evt.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.daySub}>
                        {evt.allDay ? 'Zadanie' : `${timeRange(evt)} · Zadanie`}
                        {t.boardName ? ` · ${t.boardName}` : ''}
                      </Text>
                    </View>
                    {t.statusTitle ? <StatusPill title={t.statusTitle} color={t.statusColor} size="sm" /> : null}
                  </View>
                </Pressable>
              );
            }
            const time = timeRange(evt);
            const color = evt.isMine ? '#FFBE0B' : '#6B6557';
            return (
              <Pressable
                key={evt.id}
                onPress={() => pick(evt)}
                className="active:opacity-70"
                style={{ marginBottom: 6 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    backgroundColor: evt.isMine ? '#FFF8E1' : '#f6f6f5',
                  }}
                >
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.dayTitle}>
                      {evt.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.daySub}>
                      {time} · {calendarLabel(evt.moduleKey)}
                      {evt.location ? ` · ${evt.location}` : ''}
                    </Text>
                  </View>
                  {evt.isMine ? (
                    <View style={styles.minePill}>
                      <Text numberOfLines={1} style={styles.minePillText}>{(evt.myRole ?? 'Służysz').toUpperCase()}</Text>
                    </View>
                  ) : null}
                </View>
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 18,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
  },
  monthSub: { fontSize: 11, color: '#6E685A', fontFamily: 'Manrope_500Medium', marginTop: 1 },
  weekdayRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekdayCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#6E685A',
    fontFamily: 'Manrope_700Bold',
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
  cellSelected: { backgroundColor: '#2A2312' },
  cellToday: { backgroundColor: '#FFF8E1' },
  cellNum: { fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4, minHeight: 6 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dotRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#FFBE0B',
    backgroundColor: 'transparent',
  },
  // Zadanie w panelu dnia: bez tła-wyróżnienia wydarzeń, obrys zamiast wypełnienia.
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E1D5',
    backgroundColor: '#FFFFFF',
  },
  dayPanel: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E6E1D5',
  },
  dayPanelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dayPanelTitle: {
    fontSize: 15,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.3,
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#ECE8DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontSize: 11,
    color: '#6B6557',
    fontFamily: 'Manrope_700Bold',
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6E685A',
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
  },
  dayTitle: {
    fontSize: 15,
    color: '#2A2312',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.2,
  },
  daySub: { fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium', marginTop: 2 },
  minePill: {
    maxWidth: 120,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#FFBE0B',
  },
  minePillText: {
    fontSize: 9,
    color: '#2A2312',
    letterSpacing: 0.4,
    fontFamily: 'Manrope_700Bold',
  },
});

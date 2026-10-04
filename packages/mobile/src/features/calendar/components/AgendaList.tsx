import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Text, View, type RefreshControlProps } from 'react-native';
import { ChevronRight, History, MapPin } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import type { AgendaEvent } from '../api';
import {
  dayDiff,
  endTime,
  isOngoing,
  isOver,
  longDay,
  monthLabel,
  relativeDay,
  startTime,
  useCalendarLabel,
} from '../meta';

// Agenda: dni jako przyklejone nagłówki (pełna data + „Dziś / Jutro / Za 3 dni”), separatory
// miesięcy, w karcie dnia kolumna godzin (początek/koniec) i treść. Minione dni schowane
// pod przyciskiem — lista zaczyna się od dziś.

const F = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  xbold: 'Manrope_800ExtraBold',
} as const;

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Day {
  key: string;
  date: Date;
  items: AgendaEvent[];
}

const groupDays = (items: AgendaEvent[]): Day[] => {
  const map = new Map<string, Day>();
  for (const it of items) {
    const k = dayKey(it.startsAt);
    const day = map.get(k) ?? { key: k, date: new Date(it.startsAt.getFullYear(), it.startsAt.getMonth(), it.startsAt.getDate()), items: [] };
    day.items.push(it);
    map.set(k, day);
  }
  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
};

interface Props {
  items: AgendaEvent[];
  onPick: (evt: AgendaEvent) => void;
  refreshControl?: ReactElement<RefreshControlProps>;
}

export const AgendaList = ({ items, onPick, refreshControl }: Props) => {
  const calendarLabel = useCalendarLabel();
  const [showPast, setShowPast] = useState(false);
  const today = new Date();
  const todayKey = dayKey(today);

  const { past, upcoming } = useMemo(() => {
    const days = groupDays(items);
    return {
      past: days.filter((d) => d.key < todayKey),
      upcoming: days.filter((d) => d.key >= todayKey),
    };
  }, [items, todayKey]);

  // Dziś zawsze widoczne (nawet puste), żeby było wiadomo, gdzie jesteśmy.
  const visible: Day[] = [
    ...(showPast ? past : []),
    ...(upcoming[0]?.key === todayKey
      ? []
      : [{ key: todayKey, date: new Date(today.getFullYear(), today.getMonth(), today.getDate()), items: [] }]),
    ...upcoming,
  ];

  const children: ReactElement[] = [];
  const sticky: number[] = [];
  if (past.length) {
    children.push(
      <View key="past" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, flexDirection: 'row' }}>
        <Pressable
          onPress={() => setShowPast((v) => !v)}
          className="active:opacity-70"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: B.paper2 }}
        >
          <History size={14} color={B.ink3} />
          <Text style={{ fontSize: 13, color: B.ink2, fontFamily: F.semibold }}>
            {showPast ? 'Ukryj minione' : `Pokaż minione (${past.reduce((n, d) => n + d.items.length, 0)})`}
          </Text>
        </Pressable>
      </View>,
    );
  }

  let lastMonth = '';
  for (const day of visible) {
    const month = `${day.date.getFullYear()}-${day.date.getMonth()}`;
    if (month !== lastMonth) {
      lastMonth = month;
      children.push(
        <Text
          key={`m-${month}`}
          style={{
            paddingHorizontal: 20,
            paddingTop: children.length ? 18 : 6,
            paddingBottom: 2,
            fontSize: 12,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: B.gold,
            fontFamily: F.bold,
          }}
        >
          {monthLabel(day.date)}
        </Text>,
      );
    }
    sticky.push(children.length);
    children.push(<DayHeader key={`h-${day.key}`} date={day.date} count={day.items.length} />);
    children.push(
      <View key={`d-${day.key}`} style={{ paddingHorizontal: 16, paddingBottom: 8, opacity: day.key < todayKey ? 0.6 : 1 }}>
        <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
          {day.items.length === 0 ? (
            <Text style={{ paddingHorizontal: 16, paddingVertical: 15, fontSize: 14, color: B.ink4, fontFamily: F.medium }}>
              Nic zaplanowanego na dziś
            </Text>
          ) : (
            day.items.map((evt, i) => (
              <EventRow key={evt.id} evt={evt} first={i === 0} calendar={calendarLabel(evt.moduleKey)} onPress={() => onPick(evt)} />
            ))
          )}
        </View>
      </View>,
    );
  }

  return (
    <ScrollView stickyHeaderIndices={sticky} contentContainerStyle={{ paddingBottom: 130 }} refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
};

const plEvents = (n: number) => (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'wydarzenia' : 'wydarzeń');

// Nagłówek dnia (przyklejony): duża liczba dnia, dzień tygodnia + data, odległość od dziś.
const DayHeader = ({ date, count }: { date: Date; count: number }) => {
  const n = dayDiff(date);
  const [weekday, ...rest] = longDay(date).split(', ');
  return (
    <View style={{ backgroundColor: B.paper, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }}>
      <Text
        style={{
          width: 38,
          fontSize: 26,
          lineHeight: 30,
          color: n < 0 ? B.ink4 : B.ink,
          fontFamily: F.xbold,
          letterSpacing: -1,
          fontVariant: ['tabular-nums'],
        }}
      >
        {date.getDate()}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold, letterSpacing: -0.2 }}>{weekday}</Text>
        <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
          {rest.join(', ')}
          {count > 1 ? ` · ${count} ${plEvents(count)}` : ''}
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: n === 0 ? B.kurkuma : n === 1 ? B.kurkumaSoft : 'transparent',
        }}
      >
        <Text style={{ fontSize: 12, color: n === 0 ? B.ink : n === 1 ? B.goldDeep : B.ink3, fontFamily: F.bold }}>
          {relativeDay(date)}
        </Text>
      </View>
    </View>
  );
};

const EventRow = ({
  evt,
  first,
  calendar,
  onPress,
}: {
  evt: AgendaEvent;
  first: boolean;
  calendar: string;
  onPress: () => void;
}) => {
  const now = new Date();
  const live = isOngoing(evt, now);
  const over = !live && dayDiff(evt.startsAt, now) === 0 && isOver(evt, now);
  const start = startTime(evt);
  const end = endTime(evt);
  return (
    <Pressable
      onPress={onPress}
      className="active:opacity-70"
      style={{ flexDirection: 'row', gap: 12, paddingLeft: 16, paddingRight: 12, paddingVertical: 14, opacity: over ? 0.55 : 1 }}
    >
      {!first ? <View style={{ position: 'absolute', top: 0, left: 82, right: 0, height: 1, backgroundColor: B.line }} /> : null}
      <View style={{ width: 54 }}>
        {start ? (
          <>
            <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.bold, fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>
              {start}
            </Text>
            {live ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: B.gold, fontFamily: F.bold }}>Teraz</Text>
            ) : end ? (
              <Text style={{ marginTop: 2, fontSize: 12, color: B.ink4, fontFamily: F.medium, fontVariant: ['tabular-nums'] }}>
                {end}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={{ fontSize: 12, lineHeight: 16, color: B.ink3, fontFamily: F.bold }}>Cały{'\n'}dzień</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, color: B.ink, fontFamily: F.semibold, letterSpacing: -0.3 }}>
          {evt.title}
        </Text>
        {evt.location ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <MapPin size={12} color={B.ink3} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
              {evt.location}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {evt.isMine ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: B.kurkuma }}>
              <Text numberOfLines={1} style={{ fontSize: 11, color: B.ink, fontFamily: F.bold }}>
                Służysz · {evt.myRole ?? 'grafik'}
              </Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold }}>{calendar}</Text>
        </View>
      </View>
      <ChevronRight size={17} color={B.ink4} style={{ alignSelf: 'center' }} />
    </Pressable>
  );
};

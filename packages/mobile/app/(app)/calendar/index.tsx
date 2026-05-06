import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Calendar, CalendarDays, List } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import {
  useAgenda,
  type AgendaEvent,
  type EventSource,
} from '../../../src/features/calendar/api';
import { AgendaList } from '../../../src/features/calendar/components/AgendaList';
import { MonthView } from '../../../src/features/calendar/components/MonthView';
import { EventDetailSheet } from '../../../src/features/calendar/components/EventDetailSheet';
import { useAuthSession } from '../../../src/lib/auth';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';

const SOURCE_FILTERS: { key: EventSource | 'all' | 'mine'; label: string; color: string }[] = [
  { key: 'all', label: 'Wszystkie', color: '#475569' },
  { key: 'mine', label: 'Moje', color: '#ec4899' },
  { key: 'program', label: 'Programy', color: '#ec4899' },
  { key: 'worship', label: 'Zespół Uwielbienia', color: '#a855f7' },
  { key: 'media', label: 'Media Team', color: '#f97316' },
  { key: 'atmosfera', label: 'Atmosfera Team', color: '#14b8a6' },
  { key: 'kids', label: 'Dzieci', color: '#eab308' },
  { key: 'homegroups', label: 'Grupy Domowe', color: '#3b82f6' },
  { key: 'event', label: 'Inne', color: '#0891b2' },
];

type ViewMode = 'agenda' | 'month';

export default function CalendarScreen() {
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const [filter, setFilter] = useState<EventSource | 'all' | 'mine'>('all');
  const [view, setView] = useState<ViewMode>('agenda');
  const [picked, setPicked] = useState<AgendaEvent | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useAgenda({
    userEmail: user?.email ?? null,
    selectedCampusId,
    withCampusFilter,
  });

  const items = (data ?? []).filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'mine') return e.isMine;
    return e.source === filter;
  });

  const filterCounts: Record<string, number> = {
    all: data?.length ?? 0,
    mine: (data ?? []).filter((e) => e.isMine).length,
  };
  for (const f of SOURCE_FILTERS) {
    if (f.key !== 'all' && f.key !== 'mine') {
      filterCounts[f.key] = (data ?? []).filter((e) => e.source === f.key).length;
    }
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Kalendarz"
          subtitle="Wszystkie wydarzenia"
          Icon={Calendar}
          right={
            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => setView('agenda')}
                style={[styles.viewBtn, view === 'agenda' && styles.viewBtnActive]}
              >
                <List
                  size={14}
                  color={view === 'agenda' ? '#ffffff' : '#57534e'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.viewBtnText,
                    view === 'agenda' && styles.viewBtnTextActive,
                  ]}
                >
                  Agenda
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setView('month')}
                style={[styles.viewBtn, view === 'month' && styles.viewBtnActive]}
              >
                <CalendarDays
                  size={14}
                  color={view === 'month' ? '#ffffff' : '#57534e'}
                  strokeWidth={2.4}
                />
                <Text
                  style={[
                    styles.viewBtnText,
                    view === 'month' && styles.viewBtnTextActive,
                  ]}
                >
                  Miesiąc
                </Text>
              </Pressable>
            </View>
          }
        />

        <View style={{ height: 44 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 8,
              gap: 6,
              alignItems: 'center',
            }}
          >
            {SOURCE_FILTERS.map((f) => {
              const active = filter === f.key;
              const count = filterCounts[f.key] ?? 0;
              if (count === 0 && f.key !== 'all' && f.key !== 'mine') return null;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  className="flex-row items-center gap-1.5 active:opacity-80"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? f.color : '#fafaf9',
                    borderWidth: 1,
                    borderColor: active ? f.color : '#eef0f3',
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: active ? '#ffffff' : f.color,
                    }}
                  />
                  <Text
                    className="text-[13px]"
                    style={{
                      color: active ? '#ffffff' : '#1c1917',
                      fontFamily: 'Inter_600SemiBold',
                    }}
                  >
                    {f.label} · {count}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : view === 'month' ? (
          <MonthView items={items} onPick={setPicked} />
        ) : items.length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#fef3f2',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Calendar size={28} color="#ec4899" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
            >
              Brak wydarzeń
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              {filter !== 'all'
                ? 'Spróbuj wybrać inny filtr.'
                : 'Wszystko spokojnie. Pociągnij w dół aby odświeżyć.'}
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            <AgendaList items={items} onPick={setPicked} />
          </ScrollView>
        )}
      </View>

      <EventDetailSheet event={picked} onClose={() => setPicked(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#eef0f3',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  viewBtnActive: { backgroundColor: '#0c0a09' },
  viewBtnText: {
    fontSize: 11,
    color: '#57534e',
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.1,
  },
  viewBtnTextActive: { color: '#ffffff' },
});

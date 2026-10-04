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
import { Calendar, CalendarDays, List, Plus } from 'lucide-react-native';
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
import { usePermissions } from '../../../src/lib/permissions';
import { NewCalendarEventModal } from '../../../src/features/calendar/components/NewCalendarEventModal';

const SOURCE_FILTERS: { key: EventSource | 'all' | 'mine'; label: string; color: string }[] = [
  { key: 'all', label: 'Wszystkie', color: '#4A463E' },
  { key: 'mine', label: 'Moje', color: '#8A6606' },
  { key: 'program', label: 'Programy', color: '#8A6606' },
  { key: 'worship', label: 'Zespół Uwielbienia', color: '#6B6557' },
  { key: 'media', label: 'Media Team', color: '#FFBE0B' },
  { key: 'atmosfera', label: 'Atmosfera Team', color: '#6B6557' },
  { key: 'kids', label: 'Dzieci', color: '#FFBE0B' },
  { key: 'homegroups', label: 'Grupy Domowe', color: '#6B6557' },
  { key: 'event', label: 'Inne', color: '#2A2312' },
];

type ViewMode = 'agenda' | 'month';

export default function CalendarScreen() {
  const { user } = useAuthSession();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const perms = usePermissions();
  // Jak serwer: dodawać może rola z res:events:create (członek tylko czyta).
  const canCreate = perms.can('res:events:create');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<EventSource | 'all' | 'mine'>('all');
  const [view, setView] = useState<ViewMode>('agenda');
  const [picked, setPicked] = useState<AgendaEvent | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useAgenda({
    userEmail: user?.email ?? null,
    selectedCampusId,
    withCampusFilter,
  });

  const items = (data ?? []).filter((e: AgendaEvent) => {
    if (filter === 'all') return true;
    if (filter === 'mine') return e.isMine;
    return e.source === filter;
  });

  const filterCounts: Record<string, number> = {
    all: data?.length ?? 0,
    mine: (data ?? []).filter((e: AgendaEvent) => e.isMine).length,
  };
  for (const f of SOURCE_FILTERS) {
    if (f.key !== 'all' && f.key !== 'mine') {
      filterCounts[f.key] = (data ?? []).filter((e: AgendaEvent) => e.source === f.key).length;
    }
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
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
                  color={view === 'agenda' ? '#ffffff' : '#4A463E'}
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
                  color={view === 'month' ? '#ffffff' : '#4A463E'}
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
                    backgroundColor: active ? f.color : '#F1EEE6',
                    borderWidth: 1,
                    borderColor: active ? f.color : '#E6E1D5',
                  }}
                >
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: active ? '#F6F4EE' : f.color,
                    }}
                  />
                  <Text
                    className="text-[13px]"
                    style={{
                      color: active ? '#ffffff' : '#2A2312',
                      fontFamily: 'Manrope_600SemiBold',
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
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{
                marginTop: 14,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: '#2A2312',
              }}
            >
              <Text style={{ color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>
                Spróbuj ponownie
              </Text>
            </Pressable>
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                backgroundColor: '#FFF8E1',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 12,
              }}
            >
              <Calendar size={28} color="#8A6606" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
            >
              Brak wydarzeń
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            <AgendaList items={items} onPick={setPicked} />
          </ScrollView>
        )}
      </View>

      <EventDetailSheet event={picked} onClose={() => setPicked(null)} />
      {canCreate ? (
        <Pressable
          onPress={() => setCreating(true)}
          accessibilityLabel="Nowe wydarzenie"
          className="active:opacity-80"
          style={{
            position: 'absolute',
            right: 18,
            bottom: 108,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#2A2312',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#2A2312',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Plus size={24} color="#ffffff" strokeWidth={2.4} />
        </Pressable>
      ) : null}
      <NewCalendarEventModal
        visible={creating}
        onClose={() => setCreating(false)}
        userEmail={user?.email ?? null}
        campusIdForInsert={campusIdForInsert}
      />
    </>
  );
}

const styles = StyleSheet.create({
  viewToggle: {
    flexDirection: 'row',
    gap: 4,
    padding: 3,
    borderRadius: 12,
    backgroundColor: '#F1EEE6',
    borderWidth: 1,
    borderColor: '#E6E1D5',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  viewBtnActive: { backgroundColor: '#2A2312' },
  viewBtnText: {
    fontSize: 11,
    color: '#4A463E',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.1,
  },
  viewBtnTextActive: { color: '#ffffff' },
});

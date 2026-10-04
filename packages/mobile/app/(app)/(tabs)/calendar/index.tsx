import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
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
import { PageHeader } from '../../../../src/components/ui/PageHeader';
import { useAgenda, type AgendaEvent } from '../../../../src/features/calendar/api';
import { useCalendarLabel } from '../../../../src/features/calendar/meta';
import { useMyProfile } from '../../../../src/features/account/api';
import { AgendaList } from '../../../../src/features/calendar/components/AgendaList';
import { MonthView } from '../../../../src/features/calendar/components/MonthView';
import { useAuthSession } from '../../../../src/lib/auth';
import { useCampusQuery } from '../../../../src/hooks/useCampusQuery';
import { usePermissions } from '../../../../src/lib/permissions';
import { NewCalendarEventModal } from '../../../../src/features/calendar/components/NewCalendarEventModal';

type ViewMode = 'agenda' | 'month';

export default function CalendarScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const profile = useMyProfile(user?.email ?? null);
  const calendarLabel = useCalendarLabel();
  const { selectedCampusId, withCampusFilter, campusIdForInsert } = useCampusQuery();
  const perms = usePermissions();
  // Jak serwer: dodawać może rola z res:events:create (członek tylko czyta).
  const canCreate = perms.can('res:events:create');
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [view, setView] = useState<ViewMode>('agenda');
  const openEvent = (e: AgendaEvent) =>
    router.push({ pathname: '/(app)/events/[id]', params: { id: String(e.eventId) } });

  const { data, isLoading, isError, error, refetch, isRefetching } = useAgenda({
    userEmail: user?.email ?? null,
    userName: profile.data?.full_name || profile.data?.name || user?.full_name || null,
    selectedCampusId,
    withCampusFilter,
  });

  const items = (data ?? []).filter((e: AgendaEvent) => {
    if (filter === 'all') return true;
    if (filter === 'mine') return e.isMine;
    return e.source === filter;
  });

  // Filtry z danych: Wszystkie, Moje (służby z grafiku) i kalendarze, w których coś jest
  // (liczone nadchodzące — minione są schowane).
  const filters = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = (data ?? []).filter((e: AgendaEvent) => e.startsAt >= today);
    const bySource = new Map<string, number>();
    for (const e of upcoming) bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
    return [
      { key: 'all', label: 'Wszystkie', count: upcoming.length },
      { key: 'mine', label: 'Moje służby', count: upcoming.filter((e: AgendaEvent) => e.isMine).length },
      ...[...bySource.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, label: calendarLabel(key), count })),
    ];
  }, [data, calendarLabel]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title="Kalendarz"
          subtitle="Wydarzenia"
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
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  className="flex-row items-center gap-1.5 active:opacity-80"
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? '#2A2312' : '#ECE8DE',
                  }}
                >
                  {f.key === 'mine' ? (
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFBE0B' }} />
                  ) : null}
                  <Text
                    className="text-[13px]"
                    style={{ color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                  >
                    {f.label}
                  </Text>
                  <Text
                    className="text-[12px]"
                    style={{ color: active ? '#CFC8B6' : '#857F70', fontFamily: 'Manrope_600SemiBold' }}
                  >
                    {f.count}
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
          <MonthView items={items} onPick={openEvent} />
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
          <AgendaList
            items={items}
            onPick={openEvent}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          />
        )}
      </View>

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
    backgroundColor: '#FFFFFF',
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

import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { CheckCircle2, CircleDot, ListTodo } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useAuthSession } from '../../../src/lib/auth';
import { useMyWork, useSetWorkStatus, type WorkItem } from '../../../src/features/work/api';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const fmtDue = (iso: string) => {
  try {
    return format(parseISO(iso.slice(0, 10)), 'd MMM', { locale: pl });
  } catch {
    return iso;
  }
};

type BucketKey = 'overdue' | 'today' | 'upcoming' | 'nodate';
const BUCKETS: { key: BucketKey; label: string; tint: string }[] = [
  { key: 'overdue', label: 'Zaległe', tint: '#dc2626' },
  { key: 'today', label: 'Dziś', tint: '#ea580c' },
  { key: 'upcoming', label: 'Nadchodzące', tint: '#0e7490' },
  { key: 'nodate', label: 'Bez terminu', tint: '#78716c' },
];

// Miękka karta (bez paska-akcentu); kolor tablicy pokazuje kropka przy jej nazwie.
const ItemCard = ({ item, onStatus }: { item: WorkItem; onStatus: (item: WorkItem) => void }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      marginBottom: 8,
      borderRadius: 16,
      backgroundColor: '#f7f6f5',
      opacity: item.done ? 0.6 : 1,
    }}
  >
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 15,
          color: '#0c0a09',
          fontFamily: 'Inter_600SemiBold',
          textDecorationLine: item.done ? 'line-through' : 'none',
        }}
        numberOfLines={2}
      >
        {item.name || '(bez nazwy)'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.boardColor }} />
          <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
            {item.boardName}
          </Text>
        </View>
        {item.due ? (
          <Text style={{ fontSize: 12, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>
            · {fmtDue(item.due)}
          </Text>
        ) : null}
      </View>
    </View>
    {item.statusColumnId && item.statusLabels.length ? (
      <Pressable
        onPress={() => onStatus(item)}
        accessibilityLabel={`Zmień status: ${item.name}`}
        className="active:opacity-70"
        style={{
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: (item.statusColor ?? '#64748b') + '22',
        }}
      >
        <Text
          style={{ fontSize: 12, color: item.statusColor ?? '#475569', fontFamily: 'Inter_700Bold' }}
          numberOfLines={1}
        >
          {item.statusLabel ?? 'Ustaw status'}
        </Text>
      </Pressable>
    ) : null}
  </View>
);

export default function MyWorkScreen() {
  const { user } = useAuthSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyWork(user?.email ?? null);
  const [showDone, setShowDone] = useState(false);
  const setStatus = useSetWorkStatus(user?.email ?? null);

  const changeStatus = (item: WorkItem) => {
    const labels = item.statusLabels;
    const apply = (id: string) =>
      setStatus.mutate(
        { item, labelId: id },
        { onError: (e: any) => Alert.alert('Nie udało się zmienić statusu', e?.message ?? '') },
      );
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: item.name, options: [...labels.map((l) => l.title), 'Anuluj'], cancelButtonIndex: labels.length },
        (i) => {
          if (i < labels.length) apply(labels[i].id);
        },
      );
    } else {
      Alert.alert(item.name, 'Zmień status', [
        ...labels.map((l) => ({ text: l.title, onPress: () => apply(l.id) })),
        { text: 'Anuluj', style: 'cancel' as const },
      ]);
    }
  };

  const buckets = useMemo(() => {
    const today = todayIso();
    const items = (data ?? []).filter((i: WorkItem) => (showDone ? true : !i.done));
    const by: Record<BucketKey, WorkItem[]> = { overdue: [], today: [], upcoming: [], nodate: [] };
    for (const it of items) {
      if (!it.due) by.nodate.push(it);
      else {
        const d = it.due.slice(0, 10);
        if (d < today) by.overdue.push(it);
        else if (d === today) by.today.push(it);
        else by.upcoming.push(it);
      }
    }
    const byDue = (a: WorkItem, b: WorkItem) => (a.due ?? '').localeCompare(b.due ?? '');
    by.overdue.sort(byDue);
    by.today.sort(byDue);
    by.upcoming.sort(byDue);
    return by;
  }, [data, showDone]);

  const total = (data ?? []).length;
  const openCount = (data ?? []).filter((i: WorkItem) => !i.done).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Moja praca"
          subtitle={total > 0 ? `${openCount} otwartych z ${total}` : 'Zadania przypisane do Ciebie'}
          showBack
          right={
            <Pressable
              onPress={() => setShowDone((v) => !v)}
              hitSlop={8}
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: showDone ? '#0c0a09' : '#fafaf9',
                borderWidth: 1,
                borderColor: showDone ? '#0c0a09' : '#eef0f3',
              }}
            >
              <CheckCircle2 size={14} color={showDone ? '#ffffff' : '#78716c'} />
              <Text
                style={{ fontSize: 12, color: showDone ? '#ffffff' : '#57534e', fontFamily: 'Inter_600SemiBold' }}
              >
                Zrobione
              </Text>
            </Pressable>
          }
        />

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#e11d48', textAlign: 'center', fontFamily: 'Inter_500Medium' }}>
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {total === 0 || (!showDone && openCount === 0) ? (
              <View style={{ alignItems: 'center', paddingTop: 56 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#ecfdf5',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <ListTodo size={28} color="#10b981" />
                </View>
                <Text style={{ fontSize: 16, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                  {total === 0 ? 'Nic do zrobienia' : 'Wszystko zrobione 🎉'}
                </Text>
                <Text
                  style={{ fontSize: 13, color: '#78716c', textAlign: 'center', marginTop: 4, fontFamily: 'Inter_400Regular' }}
                >
                  Nie masz teraz przypisanych zadań na tablicach.
                </Text>
              </View>
            ) : (
              BUCKETS.map(({ key, label, tint }) => {
                const items = buckets[key];
                if (!items.length) return null;
                return (
                  <View key={key} style={{ marginBottom: 18 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <CircleDot size={13} color={tint} />
                      <Text
                        style={{ fontSize: 12, color: tint, letterSpacing: 0.4, fontFamily: 'Inter_700Bold', textTransform: 'uppercase' }}
                      >
                        {label} · {items.length}
                      </Text>
                    </View>
                    {items.map((it: WorkItem) => (
                      <ItemCard onStatus={changeStatus} key={it.id} item={it} />
                    ))}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}

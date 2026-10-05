import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StatusBar, Text, View } from 'react-native';
import { CalendarOff, Plus, Trash2 } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B } from '../../../src/components/ui/brand';
import { AbsenceSheet } from '../../../src/features/serve/components/AbsenceSheet';
import { useDeleteBlockout, useMyBlockouts, type Blockout } from '../../../src/features/serve/api';
import { daysLabel, rangeLabel, todayIso } from '../../../src/features/serve/format';

// „Moje nieobecności” — jedna funkcja zamiast dwóch (dawne „Moje nieobecności” przy
// programach + „Moja dostępność”). Dane: volunteer_blockouts przez fn my-blockouts.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export default function AbsencesScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyBlockouts();
  const del = useDeleteBlockout();
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [adding, setAdding] = useState(false);

  const blockouts = data?.blockouts ?? [];
  const memberResolved = data?.memberResolved ?? false;
  const list = useMemo(() => {
    const today = todayIso();
    const sorted = [...blockouts].sort((a: Blockout, b: Blockout) => a.start_date.localeCompare(b.start_date));
    return onlyUpcoming ? sorted.filter((b: Blockout) => b.end_date >= today) : sorted.reverse();
  }, [blockouts, onlyUpcoming]);

  const confirmDelete = (b: Blockout) =>
    Alert.alert('Usunąć nieobecność?', rangeLabel(b), [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => del.mutate(b.id, { onError: (e: any) => Alert.alert('Nie udało się usunąć', e?.message ?? 'Spróbuj ponownie.') }),
      },
    ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Moje nieobecności" subtitle="Kiedy nie możesz służyć" Icon={CalendarOff} showBack />

        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
          {[
            { on: true, label: 'Nadchodzące' },
            { on: false, label: 'Wszystkie' },
          ].map((o) => (
            <Pressable
              key={o.label}
              onPress={() => setOnlyUpcoming(o.on)}
              className="active:opacity-80"
              style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: onlyUpcoming === o.on ? B.ink : B.paper2 }}
            >
              <Text style={{ fontSize: 13, color: onlyUpcoming === o.on ? '#fff' : B.ink, fontFamily: F.semibold }}>{o.label}</Text>
            </Pressable>
          ))}
        </View>

        {isLoading ? (
          <ActivityIndicator color={B.ink} style={{ marginTop: 40 }} />
        ) : isError ? (
          <Text style={{ margin: 24, textAlign: 'center', color: B.ink3, fontFamily: F.medium }}>{(error as Error)?.message ?? 'Błąd'}</Text>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 10 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={B.ink} />}
          >
            {!memberResolved ? (
              <View style={{ padding: 16, borderRadius: 20, backgroundColor: B.kurkumaSoft }}>
                <Text style={{ fontSize: 14, lineHeight: 20, color: B.goldDeep, fontFamily: F.semibold }}>
                  Twoje konto nie jest jeszcze powiązane z profilem członka. Poproś lidera o połączenie — wtedy zgłosisz nieobecność.
                </Text>
              </View>
            ) : (
              <>
                <Pressable
                  onPress={() => setAdding(true)}
                  className="active:opacity-80"
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 999, backgroundColor: B.kurkuma }}
                >
                  <Plus size={18} color={B.ink} strokeWidth={2.4} />
                  <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Zgłoś nieobecność</Text>
                </Pressable>

                {list.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingTop: 36 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                      <CalendarOff size={24} color={B.ink4} />
                    </View>
                    <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.semibold }}>
                      {onlyUpcoming ? 'Brak zgłoszonych nieobecności' : 'Brak zgłoszeń'}
                    </Text>
                    <Text style={{ marginTop: 4, fontSize: 13, color: B.ink3, textAlign: 'center', fontFamily: F.medium }}>
                      Zgłoś dni, kiedy cię nie będzie — lider zobaczy to przy grafiku.
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
                    {list.map((b: Blockout, i: number) => {
                      const past = b.end_date < todayIso();
                      return (
                        <View
                          key={b.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingHorizontal: 16,
                            paddingVertical: 14,
                            borderTopWidth: i ? 1 : 0,
                            borderTopColor: B.line,
                            opacity: past ? 0.55 : 1,
                          }}
                        >
                          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.kurkumaSoft, alignItems: 'center', justifyContent: 'center' }}>
                            <CalendarOff size={17} color={B.gold} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>{rangeLabel(b)}</Text>
                            <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                              {[daysLabel(b), b.reason].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <Pressable onPress={() => confirmDelete(b)} hitSlop={10} accessibilityLabel="Usuń nieobecność" style={{ padding: 4 }}>
                            <Trash2 size={17} color={B.ink4} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>
      <AbsenceSheet visible={adding} onClose={() => setAdding(false)} />
    </>
  );
}

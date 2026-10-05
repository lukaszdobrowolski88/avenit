import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarOff, Plus } from 'lucide-react-native';
import { EmptyRow, WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import { useMyBlockouts, type Blockout } from '../../serve/api';
import { daysLabel, rangeLabel, todayIso } from '../../serve/format';
import { AbsenceSheet } from '../../serve/components/AbsenceSheet';

// „Moje nieobecności” na pulpicie — skrót do JEDNEJ funkcji nieobecności (ekran
// /serve/availability, dane volunteer_blockouts). Dawny osobny model user_absences
// (nieobecność „na program”) został zastąpiony.
export const AbsencesWidget = () => {
  const router = useRouter();
  const { data } = useMyBlockouts();
  const [adding, setAdding] = useState(false);

  if (!data) return null;
  // Konto bez profilu członka nie może zgłaszać (serwer wiąże nieobecność z członkiem) —
  // mówimy o tym wprost zamiast chować widżet.
  if (!data.memberResolved) {
    return (
      <WidgetCard title="Moje nieobecności">
        <EmptyRow text="Konto nie jest powiązane z profilem członka — poproś lidera o połączenie, by zgłaszać nieobecności." />
      </WidgetCard>
    );
  }
  const today = todayIso();
  const upcoming = (data.blockouts ?? [])
    .filter((b: Blockout) => b.end_date >= today)
    .sort((a: Blockout, b: Blockout) => a.start_date.localeCompare(b.start_date));

  return (
    <>
      <WidgetCard
        title="Moje nieobecności"
        count={upcoming.length}
        actionLabel={upcoming.length ? 'Wszystkie' : undefined}
        onAction={upcoming.length ? () => router.push('/(app)/serve/availability') : undefined}
      >
        {upcoming.length === 0 ? (
          <EmptyRow text="Brak zgłoszonych nieobecności." actionLabel="Zgłoś" onAction={() => setAdding(true)} />
        ) : (
          <View>
            {upcoming.slice(0, 3).map((b: Blockout, i: number) => (
              <View
                key={b.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderTopColor: D.hair }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: D.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <CalendarOff size={16} color={D.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, color: D.ink, fontFamily: F.semibold }}>
                    {rangeLabel(b)}
                  </Text>
                  <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 13, color: D.ink2, fontFamily: F.medium }}>
                    {[daysLabel(b), b.reason].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </View>
            ))}
            <Pressable
              onPress={() => setAdding(true)}
              className="active:opacity-70"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: D.hair }}
            >
              <Plus size={16} color={D.ink} />
              <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.semibold }}>Zgłoś nieobecność</Text>
            </Pressable>
          </View>
        )}
      </WidgetCard>
      <AbsenceSheet visible={adding} onClose={() => setAdding(false)} />
    </>
  );
};

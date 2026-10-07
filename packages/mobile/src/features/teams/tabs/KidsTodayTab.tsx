import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Baby, LogOut, UserCheck } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { toYmd } from '../../../components/ui/DateField';
import { B } from '../../../components/ui/brand';
import { EmptyState } from '../../../components/ui/EmptyState';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { normalizePickupCode, pickupCodeMatches } from '../kids';
import { KidsCheckinSheet } from '../components/KidsCheckinSheet';
import { Card, Loading, Pill } from './ui';

// Meldowanie dzieci — dziś (web: src/modules/Kids/checkin/**). Sesja na dziś (data LOKALNA),
// lista obecnych wg sal (sale są opcjonalne — reszta w „Bez sali”), odbiór po kodzie z naklejki
// rodzica. Otwarcie ekranu NICZEGO nie tworzy: sesja powstaje przy pierwszym meldowaniu
// (tu albo w kiosku na webie) — dawniej przycisk „Utwórz sesję” zostawiał puste sesje.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

interface Checkin {
  id: string;
  studentId: string | null;
  child: string;
  birthYear: number | null;
  allergies: string | null;
  room: string;
  code: string;
  inAt: string | null;
  outAt: string | null;
  guest: boolean;
}

const asList = (d: unknown) => ((d ?? []) as any[]);
const NO_ROOM = 'Bez sali';

const useKidsToday = () =>
  useQuery({
    queryKey: ['kids', 'today', toYmd(new Date())],
    queryFn: async () => {
      const { data: sessions, error } = await supabase
        .from('checkin_sessions')
        .select('id, name, start_time, end_time')
        .eq('session_date', toYmd(new Date()))
        .eq('is_active', true)
        .order('start_time', { ascending: true })
        .limit(1);
      if (error) throw error;
      const session = asList(sessions)[0] ?? null;
      if (!session) return { session: null, checkins: [] as Checkin[] };
      const { data, error: cErr } = await supabase
        .from('checkins')
        .select(
          'id, student_id, security_code, checked_in_at, checked_out_at, is_guest, guest_name, guest_birth_year, guest_allergies, kids_students:student_id(full_name, birth_year, allergies), checkin_locations:location_id(name, room_number)',
        )
        .eq('session_id', session.id)
        .order('checked_in_at', { ascending: false });
      if (cErr) throw cErr;
      const checkins: Checkin[] = asList(data).map((c) => {
        const st = c.kids_students ?? {};
        const loc = c.checkin_locations ?? {};
        return {
          id: String(c.id),
          studentId: c.student_id != null ? String(c.student_id) : null,
          child: String(c.is_guest ? c.guest_name ?? 'Gość' : st.full_name ?? 'Dziecko'),
          birthYear: c.is_guest ? c.guest_birth_year ?? null : st.birth_year ?? null,
          allergies: (c.is_guest ? c.guest_allergies : st.allergies) || null,
          room: [loc.name, loc.room_number].filter(Boolean).join(' · ') || NO_ROOM,
          code: String(c.security_code ?? ''),
          inAt: c.checked_in_at ?? null,
          outAt: c.checked_out_at ?? null,
          guest: !!c.is_guest,
        };
      });
      return { session: { id: String(session.id), name: String(session.name ?? 'Meldowanie') }, checkins };
    },
    refetchInterval: 20_000,
  });

export const KidsTodayTab = ({
  myEmail,
  canCheckIn,
  canCheckOut,
  canReadHouseholds,
  scope,
}: {
  myEmail: string | null;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canReadHouseholds: boolean;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
}) => {
  const qc = useQueryClient();
  const today = useKidsToday();
  const [code, setCode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);

  const checkout = useMutation({
    mutationFn: async (ids: string[]) => {
      let done = 0;
      for (const id of ids) {
        const { error } = await (supabase.from('checkins') as any)
          .update({ checked_out_at: new Date().toISOString(), checked_out_by: myEmail || 'system' })
          .eq('id', id)
          .is('checked_out_at', null);
        if (error) {
          if (done > 0) throw new Error('Wydano tylko część dzieci. Sprawdź listę obecnych.');
          throw error;
        }
        done++;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['kids', 'today'] }),
  });

  const checkins: Checkin[] = today.data?.checkins ?? [];
  const present = checkins.filter((c) => !c.outAt);
  const byRoom = useMemo(() => {
    const m = new Map<string, Checkin[]>();
    for (const c of checkins) m.set(c.room, [...(m.get(c.room) ?? []), c]);
    // „Bez sali” na końcu, jak na webie.
    return [...m.entries()].sort(([a], [b]) => (a === NO_ROOM ? 1 : b === NO_ROOM ? -1 : a.localeCompare(b, 'pl')));
  }, [checkins]);
  const checkedInIds = useMemo(() => new Set(present.map((c) => c.studentId).filter(Boolean) as string[]), [present]);

  // Kod odbioru z naklejki rodzica — losowe 4–6 znaków (litery/cyfry, od 2026-10); starsze
  // kody to cyfry telefonu i mogą być kilka (z „|”), jak web.
  const pickup = () => {
    const entered = normalizePickupCode(code);
    if (!/^[0-9A-Z]{4,6}$/.test(entered)) {
      Alert.alert('Wpisz kod odbioru', 'Kod odbioru jest na naklejce rodzica (4–6 znaków).');
      return;
    }
    const match = present.filter((c) => pickupCodeMatches(c.code, entered));
    if (!match.length) {
      Alert.alert('Brak dzieci z tym kodem', 'Sprawdź kod na naklejce albo zapytaj koordynatora.');
      return;
    }
    Alert.alert('Wydać dzieci rodzicowi?', match.map((c) => `• ${c.child} (${c.room})`).join('\n'), [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wydaj',
        onPress: () =>
          checkout.mutate(
            match.map((c) => c.id),
            {
              onSuccess: () => {
                setCode('');
                toast.success(match.length === 1 ? 'Wydano dziecko' : `Wydano dzieci: ${match.length}`, match.map((c) => c.child).join(', '));
              },
              onError: (e: unknown) => Alert.alert('Nie udało się oznaczyć odbioru', friendlyError(e, 'Spróbuj ponownie.')),
            },
          ),
      },
    ]);
  };

  const checkinButton = canCheckIn ? (
    <Pressable
      onPress={() => setCheckingIn(true)}
      accessibilityLabel="Zamelduj dzieci"
      className="active:opacity-80"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: B.kurkuma, marginBottom: 14 }}
    >
      <UserCheck size={18} color={B.ink} strokeWidth={2.4} />
      <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Zamelduj dzieci</Text>
    </Pressable>
  ) : null;

  const sheet = canCheckIn ? (
    <KidsCheckinSheet
      visible={checkingIn}
      onClose={() => setCheckingIn(false)}
      scope={scope}
      canReadHouseholds={canReadHouseholds}
      checkedInIds={checkedInIds}
      myEmail={myEmail}
    />
  ) : null;

  if (today.isLoading) return <Loading />;
  if (today.isError) {
    return (
      <EmptyState
        Icon={Baby}
        title="Nie udało się wczytać meldowania"
        hint={friendlyError(today.error, 'Pociągnij w dół, żeby spróbować ponownie.')}
        actionLabel="Spróbuj ponownie"
        onAction={() => today.refetch()}
      />
    );
  }
  if (!today.data?.session) {
    return (
      <View>
        {checkinButton}
        <EmptyState
          Icon={Baby}
          title="Dziś nikt nie jest jeszcze zameldowany"
          hint={
            canCheckIn
              ? 'Sesja meldowania rozpocznie się przy pierwszym meldowaniu — tutaj albo w kiosku na webie.'
              : 'Sesja meldowania rozpocznie się przy pierwszym meldowaniu w kiosku.'
          }
        />
        {sheet}
      </View>
    );
  }

  return (
    <View>
      {checkinButton}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, borderRadius: 18, backgroundColor: B.kurkumaSoft, padding: 14 }}>
          <Text style={{ fontSize: 11, color: B.goldDeep, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 1.2 }}>Obecne</Text>
          <Text style={{ fontSize: 28, color: B.ink, fontFamily: F.bold }}>{present.length}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 18, backgroundColor: B.card, padding: 14 }}>
          <Text style={{ fontSize: 11, color: B.gold, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 1.2 }}>Odebrane</Text>
          <Text style={{ fontSize: 28, color: B.ink, fontFamily: F.bold }}>{checkins.length - present.length}</Text>
        </View>
      </View>

      {canCheckOut && present.length ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <LogOut size={15} color={B.gold} />
            <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Odbiór dziecka</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(normalizePickupCode(t).slice(0, 6))}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Kod z naklejki"
              placeholderTextColor={B.ink4}
              accessibilityLabel="Kod odbioru z naklejki rodzica"
              style={{ flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: B.paper, fontSize: 18, letterSpacing: 4, color: B.ink, fontFamily: F.bold }}
            />
            <Pressable
              onPress={pickup}
              disabled={checkout.isPending}
              className="active:opacity-70"
              style={{
                paddingHorizontal: 18,
                height: 46,
                borderRadius: 14,
                backgroundColor: code.length >= 4 ? B.ink : B.paper2,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: checkout.isPending ? 0.6 : 1,
              }}
            >
              <Text style={{ fontSize: 14, color: code.length >= 4 ? '#FFFFFF' : B.ink3, fontFamily: F.bold }}>Wydaj</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {!checkins.length ? <EmptyState Icon={Baby} title="Nikt jeszcze nie jest zameldowany" compact /> : null}
      {byRoom.map(([room, list]) => (
        <View key={room} style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: B.gold, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: F.bold, marginVertical: 8 }}>
            {room} · {list.filter((c) => !c.outAt).length}
          </Text>
          {list.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: c.outAt ? 0.55 : 1 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
                    {c.child}
                    {c.birthYear ? <Text style={{ color: B.ink4, fontFamily: F.medium }}>{`  ${new Date().getFullYear() - c.birthYear} l.`}</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                    {c.inAt ? `od ${format(new Date(c.inAt), 'HH:mm')}` : ''}
                    {c.outAt ? ` · odebrane ${format(new Date(c.outAt), 'HH:mm')}` : ''}
                  </Text>
                </View>
                {c.allergies ? <Pill text={`Alergia: ${c.allergies}`} tint="#B42318" bg="#FDE7E4" /> : null}
                {c.guest ? <Pill text="Gość" tint={B.goldDeep} bg={B.kurkumaSoft} /> : null}
              </View>
            </Card>
          ))}
        </View>
      ))}
      {sheet}
    </View>
  );
};

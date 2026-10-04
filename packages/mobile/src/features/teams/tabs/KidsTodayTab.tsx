import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Baby, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../../../lib/supabase';
import { toYmd } from '../../../components/ui/DateField';
import { Card, Empty, Loading, Pill } from './ui';

// Dzieci — dziś (web: src/modules/Kids/checkin/**). Sesja na dziś (data LOKALNA — web
// bierze UTC i po północy pokazuje wczorajszą), lista zameldowanych wg sal, odbiór po
// 4 cyfrach kodu rodzica (security_code „1234|5678”). Meldowanie zostaje w kiosku na webie.

interface Checkin {
  id: string;
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
          'id, security_code, checked_in_at, checked_out_at, is_guest, guest_name, guest_birth_year, guest_allergies, kids_students:student_id(full_name, birth_year, allergies), checkin_locations:location_id(name, room_number)',
        )
        .eq('session_id', session.id)
        .order('checked_in_at', { ascending: false });
      if (cErr) throw cErr;
      const checkins: Checkin[] = asList(data).map((c) => {
        const st = c.kids_students ?? {};
        const loc = c.checkin_locations ?? {};
        return {
          id: String(c.id),
          child: String(c.is_guest ? c.guest_name ?? 'Gość' : st.full_name ?? 'Dziecko'),
          birthYear: c.is_guest ? c.guest_birth_year ?? null : st.birth_year ?? null,
          allergies: (c.is_guest ? c.guest_allergies : st.allergies) || null,
          room: [loc.name, loc.room_number].filter(Boolean).join(' · ') || 'Bez sali',
          code: String(c.security_code ?? ''),
          inAt: c.checked_in_at ?? null,
          outAt: c.checked_out_at ?? null,
          guest: !!c.is_guest,
        };
      });
      return { session: { id: String(session.id), name: String(session.name ?? 'Sesja') }, checkins };
    },
    refetchInterval: 20_000,
  });

export const KidsTodayTab = ({ myEmail, canCreateSession }: { myEmail: string | null; canCreateSession: boolean }) => {
  const qc = useQueryClient();
  const today = useKidsToday();
  const [code, setCode] = useState('');

  const createSession = useMutation({
    mutationFn: async () => {
      const weekday = format(new Date(), 'EEEE', { locale: pl });
      const { error } = await (supabase.from('checkin_sessions') as any).insert({
        name: `Nabożeństwo - ${weekday}`,
        session_date: toYmd(new Date()),
        start_time: '09:00',
        end_time: '13:00',
        is_active: true,
        created_by: myEmail,
      });
      if (error) throw new Error(error.message || 'Nie udało się utworzyć sesji.');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kids', 'today'] }),
  });

  const checkout = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const { error } = await (supabase.from('checkins') as any)
          .update({ checked_out_at: new Date().toISOString(), checked_out_by: myEmail })
          .eq('id', id);
        if (error) throw new Error(error.message || 'Nie udało się wydać dziecka.');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kids', 'today'] }),
  });

  const checkins: Checkin[] = today.data?.checkins ?? [];
  const byRoom = useMemo(() => {
    const m = new Map<string, Checkin[]>();
    for (const c of checkins) m.set(c.room, [...(m.get(c.room) ?? []), c]);
    return [...m.entries()];
  }, [checkins]);
  const present = checkins.filter((c) => !c.outAt).length;

  // Kod rodzica — 4 cyfry; kod zameldowania może mieć kilka (z „|”), jak web.
  const pickup = () => {
    if (!/^\d{4}$/.test(code)) {
      Alert.alert('Wpisz 4 cyfry', 'Kod to ostatnie 4 cyfry telefonu rodzica.');
      return;
    }
    const match = checkins.filter((c) => !c.outAt && c.code.split('|').includes(code));
    if (!match.length) {
      Alert.alert('Brak dzieci z tym kodem', 'Sprawdź kod albo zapytaj koordynatora.');
      return;
    }
    Alert.alert('Wydać dzieci?', match.map((c) => `• ${c.child} (${c.room})`).join('\n'), [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Wydaj',
        onPress: () =>
          checkout.mutate(
            match.map((c) => c.id),
            { onSuccess: () => setCode(''), onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') },
          ),
      },
    ]);
  };

  if (today.isLoading) return <Loading />;
  if (!today.data?.session) {
    return (
      <View>
        <Empty Icon={Baby} title="Dziś nie ma sesji check-in" hint="Meldowanie dzieci prowadzi się w kiosku na webie." />
        {canCreateSession ? (
          <Pressable
            onPress={() => createSession.mutate(undefined, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') })}
            className="active:opacity-70"
            style={{ height: 46, borderRadius: 14, backgroundColor: '#0c0a09', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Inter_600SemiBold' }}>Utwórz sesję na dziś</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <View style={{ flex: 1, borderRadius: 18, backgroundColor: '#fef9c3', padding: 14 }}>
          <Text style={{ fontSize: 11, color: '#854d0e', fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>W salach</Text>
          <Text style={{ fontSize: 28, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>{present}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 18, backgroundColor: '#f7f6f5', padding: 14 }}>
          <Text style={{ fontSize: 11, color: '#57534e', fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>Odebrane</Text>
          <Text style={{ fontSize: 28, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>{checkins.length - present}</Text>
        </View>
      </View>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <ShieldCheck size={15} color="#15803d" />
          <Text style={{ fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>Odbiór dziecka</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="Kod rodzica (4 cyfry)"
            placeholderTextColor="#a8a29e"
            style={{ flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#ffffff', fontSize: 18, letterSpacing: 4, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}
          />
          <Pressable
            onPress={pickup}
            className="active:opacity-70"
            style={{ paddingHorizontal: 18, height: 46, borderRadius: 14, backgroundColor: code.length === 4 ? '#15803d' : '#d6d3d1', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: '#ffffff', fontFamily: 'Inter_700Bold' }}>Wydaj</Text>
          </Pressable>
        </View>
      </Card>

      {!checkins.length ? <Empty Icon={Baby} title="Nikt jeszcze nie jest zameldowany" /> : null}
      {byRoom.map(([room, list]) => (
        <View key={room} style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: '#78716c', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Inter_700Bold', marginVertical: 8 }}>
            {room} · {list.filter((c) => !c.outAt).length}
          </Text>
          {list.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: c.outAt ? 0.55 : 1 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
                    {c.child}
                    {c.birthYear ? <Text style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}>{`  ${new Date().getFullYear() - c.birthYear} l.`}</Text> : null}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                    {c.inAt ? `od ${format(new Date(c.inAt), 'HH:mm')}` : ''}
                    {c.outAt ? ` · odebrane ${format(new Date(c.outAt), 'HH:mm')}` : ''}
                  </Text>
                </View>
                {c.allergies ? <Pill text={`Alergia: ${c.allergies}`} tint="#b91c1c" bg="#fee2e2" /> : null}
                {c.guest ? <Pill text="Gość" tint="#a16207" bg="#fef3c7" /> : null}
              </View>
            </Card>
          ))}
        </View>
      ))}
    </View>
  );
};

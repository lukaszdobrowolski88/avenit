import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StatusBar, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, Minus, Plus, Search, Trash2, UserPlus, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import {
  SESSION_TYPES,
  useAddGuest,
  useDeleteSession,
  useRemoveRecord,
  useSessionDetail,
  useToggleMember,
  useUpdateSession,
  type AttendanceRecord,
  type CheckMember,
} from '../../../src/features/attendance/api';
import { Loading, dayLabel } from '../../../src/features/teams/tabs/ui';

export default function AttendanceSessionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = String(id ?? '');
  const perms = usePermissions();
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const detail = useSessionDetail(sessionId, { selectedCampusId, withCampusFilter });
  const toggle = useToggleMember(sessionId);
  const addGuest = useAddGuest(sessionId);
  const removeRecord = useRemoveRecord();
  const update = useUpdateSession();
  const del = useDeleteSession();
  const [q, setQ] = useState('');
  const [guest, setGuest] = useState('');

  // Odznaczenie i usuwanie gości = DELETE wpisu → potrzebne res:attendance_records:delete.
  const canUncheck = perms.can('res:attendance_records:delete');
  const canDeleteSession = perms.can('res:attendance_sessions:delete');

  const records: AttendanceRecord[] = detail.data?.records ?? [];
  const members: CheckMember[] = detail.data?.members ?? [];
  const recordByMember = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of records) if (r.memberId != null) m.set(Number(r.memberId), r.id);
    return m;
  }, [records]);
  const guests = records.filter((r) => r.memberId == null && r.guestName);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? members.filter((m) => m.name.toLowerCase().includes(s)) : members;
  }, [members, q]);

  const session = detail.data?.session ?? null;
  const presentCount = records.length;
  const typeLabel = SESSION_TYPES.find((t) => t.key === session?.type)?.label ?? 'Sesja';

  const onToggle = (m: CheckMember) => {
    const recordId = recordByMember.get(m.id) ?? null;
    if (recordId && !canUncheck) {
      Alert.alert('Nie możesz odznaczyć', 'Odznaczanie wymaga uprawnienia do usuwania wpisów obecności. Poproś koordynatora.');
      return;
    }
    toggle.mutate({ memberId: m.id, recordId }, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') });
  };

  const setHeadcount = (next: number | null) => {
    if (!session) return;
    update.mutate({ id: session.id, patch: { headcount: next } }, { onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') });
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć sesję?', 'Usunięte zostaną też wszystkie wpisy obecności.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(sessionId, {
            onSuccess: () => router.back(),
            onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? ''),
          }),
      },
    ]);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title={session?.title || typeLabel}
          subtitle={session ? `${dayLabel(session.date)} · ${typeLabel}` : 'Wczytywanie…'}
          showBack
          right={
            canDeleteSession && session ? (
              <Pressable onPress={confirmDelete} hitSlop={10} className="active:opacity-60" accessibilityLabel="Usuń sesję">
                <Trash2 size={20} color="#A8A59E" />
              </Pressable>
            ) : undefined
          }
        />

        {detail.isLoading ? <Loading /> : null}
        {session ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, borderRadius: 18, backgroundColor: '#f0fdfa', padding: 14 }}>
                <Text style={{ fontSize: 11, color: '#0f766e', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Obecni imiennie
                </Text>
                <Text style={{ fontSize: 28, color: '#2A2312', fontFamily: 'Manrope_700Bold', marginTop: 2 }}>{presentCount}</Text>
              </View>
              <View style={{ flex: 1, borderRadius: 18, backgroundColor: '#EFEBE2', padding: 14 }}>
                <Text style={{ fontSize: 11, color: '#4A463E', fontFamily: 'Manrope_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  Szacunkowo
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <Pressable
                    onPress={() => setHeadcount(Math.max(0, (session.headcount ?? 0) - 1))}
                    hitSlop={6}
                    className="active:opacity-60"
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Minus size={15} color="#2A2312" />
                  </Pressable>
                  <Text style={{ fontSize: 22, color: '#2A2312', fontFamily: 'Manrope_700Bold', minWidth: 36, textAlign: 'center' }}>
                    {session.headcount ?? '—'}
                  </Text>
                  <Pressable
                    onPress={() => setHeadcount((session.headcount ?? 0) + 1)}
                    hitSlop={6}
                    className="active:opacity-60"
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F6F4EE', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Plus size={15} color="#2A2312" />
                  </Pressable>
                </View>
              </View>
            </View>

            <Text style={{ fontSize: 13, color: '#7A7466', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginBottom: 8 }}>
              Goście
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              <TextInput
                value={guest}
                onChangeText={setGuest}
                placeholder="Imię gościa"
                placeholderTextColor="#A8A59E"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (guest.trim()) addGuest.mutate(guest.trim(), { onSuccess: () => setGuest('') });
                }}
                style={{ flex: 1, height: 44, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#ECE8DE', fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
              />
              <Pressable
                onPress={() => {
                  if (guest.trim()) addGuest.mutate(guest.trim(), { onSuccess: () => setGuest(''), onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? '') });
                }}
                className="active:opacity-70"
                style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: guest.trim() ? '#2A2312' : '#D3CCBC', alignItems: 'center', justifyContent: 'center' }}
              >
                <UserPlus size={18} color="#ffffff" />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {guests.map((g) => (
                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 6, paddingVertical: 5, borderRadius: 999, backgroundColor: '#fef3c7' }}>
                  <Text style={{ fontSize: 13, color: '#92400e', fontFamily: 'Manrope_600SemiBold' }}>{g.guestName}</Text>
                  {canUncheck ? (
                    <Pressable onPress={() => removeRecord.mutate(g.id)} hitSlop={8} className="active:opacity-60">
                      <X size={13} color="#92400e" />
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>

            <Text style={{ fontSize: 13, color: '#7A7466', letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold', marginBottom: 8 }}>
              Członkowie
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#ECE8DE', marginBottom: 10 }}>
              <Search size={16} color="#A8A59E" />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Szukaj osoby"
                placeholderTextColor="#A8A59E"
                style={{ flex: 1, fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_400Regular' }}
              />
            </View>
            {filtered.map((m) => {
              const on = recordByMember.has(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => onToggle(m)}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: on ? '#f0fdfa' : 'transparent' }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: on ? 0 : 2,
                      borderColor: '#D3CCBC',
                      backgroundColor: on ? '#0f766e' : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on ? <Check size={15} color="#ffffff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 15, color: '#2A2312', fontFamily: on ? 'Manrope_600SemiBold' : 'Manrope_400Regular' }}>{m.name}</Text>
                </Pressable>
              );
            })}
            {members.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#A8A59E', fontFamily: 'Manrope_500Medium' }}>
                Brak dostępu do listy członków — możesz dopisać gości i liczbę szacunkową.
              </Text>
            ) : null}
          </ScrollView>
        ) : null}
      </View>
    </>
  );
}

import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronRight, ClipboardList, Clock, Plus, Send, UserX, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import {
  csvNames,
  splitGrafik,
  useAnswerAssignment,
  useGrafik,
  useSendInvites,
  useSetRolePeople,
  useSetTeamNote,
  type GrafikAssignment,
  type GrafikEvent,
  type GrafikRoleDef,
} from '../grafik';
import { AssignSheet } from '../components/AssignSheet';
import { DateBlock, Empty, Loading, SegmentChips, dayLabel } from './ui';

// Grafik służby jak na webie (Grafik), tylko kartami zamiast tabeli: wydarzenie → role → osoby.
// Lider (prawo edycji wydarzeń) przypisuje osoby, nieobecnych, notatkę i wysyła zaproszenia.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

type Range = 'upcoming' | 'mine' | 'past';

const PersonChip = ({ name, status, isMe }: { name: string; status: GrafikAssignment['status'] | null; isMe: boolean }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isMe ? B.kurkuma : B.paper,
      opacity: status === 'rejected' ? 0.55 : 1,
    }}
  >
    {status === 'accepted' ? <Check size={12} color={isMe ? B.ink : '#15803d'} strokeWidth={3} /> : null}
    {status === 'pending' ? <Clock size={11} color={isMe ? B.ink : B.gold} strokeWidth={2.5} /> : null}
    <Text
      style={{
        fontSize: 13,
        color: B.ink,
        fontFamily: isMe ? F.bold : F.semibold,
        textDecorationLine: status === 'rejected' ? 'line-through' : 'none',
      }}
    >
      {isMe ? `${name} (Ty)` : name}
    </Text>
  </View>
);

const Tally = ({ sa }: { sa: GrafikAssignment[] }) => {
  const n = (s: string) => sa.filter((a) => a.status === s).length;
  const items = [
    { k: 'accepted', v: n('accepted'), Icon: Check, c: '#15803d' },
    { k: 'pending', v: n('pending'), Icon: Clock, c: B.gold },
    { k: 'rejected', v: n('rejected'), Icon: X, c: '#B42318' },
  ].filter((x) => x.v > 0);
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {items.map(({ k, v, Icon, c }) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Icon size={12} color={c} strokeWidth={2.8} />
          <Text style={{ fontSize: 12, color: c, fontFamily: F.bold }}>{v}</Text>
        </View>
      ))}
    </View>
  );
};

export const GrafikTab = ({
  teamKey,
  me,
  canEdit,
  canSend,
}: {
  teamKey: string;
  me: { email: string | null; name: string | null };
  canEdit: boolean;
  canSend: boolean;
}) => {
  const router = useRouter();
  const grafik = useGrafik(teamKey);
  const setPeople = useSetRolePeople(teamKey);
  const setNote = useSetTeamNote(teamKey);
  const send = useSendInvites(teamKey);
  const answer = useAnswerAssignment(teamKey);
  const [range, setRange] = useState<Range>('upcoming');
  const [picking, setPicking] = useState<{ eventId: string; role: GrafikRoleDef | 'absent' } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const data = grafik.data;
  const roles: GrafikRoleDef[] = data?.roles ?? [];
  const members = data?.members ?? [];

  // Ja w grafiku: po e-mailu z schedule_assignments albo po imieniu z profilu.
  const isMe = (ev: GrafikEvent, name: string) =>
    (!!me.name && name === me.name) || ev.sa.some((a) => a.name === name && !!me.email && a.email?.toLowerCase() === me.email.toLowerCase());
  const involvesMe = (ev: GrafikEvent) => roles.some((r) => csvNames(ev.team[r.key]).some((n) => isMe(ev, n)));

  const list = useMemo(() => {
    const { upcoming, past } = splitGrafik(data?.events ?? []);
    if (range === 'past') return past;
    if (range === 'mine') return upcoming.filter(involvesMe);
    return upcoming;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, range, me.email, me.name]);

  const pickingEvent = picking ? data?.events.find((e: GrafikEvent) => e.id === picking.eventId) ?? null : null;

  const savePicked = (names: string[]) => {
    if (!picking || !pickingEvent) return;
    const done = { onSuccess: () => setPicking(null), onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') };
    if (picking.role === 'absent') {
      setNote.mutate({ eventId: pickingEvent.id, field: 'absencja', value: names.join(', ') }, done);
    } else {
      setPeople.mutate({ event: pickingEvent, role: picking.role, names, members, me }, done);
    }
  };

  const sendInvites = (ev: GrafikEvent) =>
    send.mutate(ev.id, {
      onSuccess: (r) =>
        Alert.alert(
          r.sent ? 'Wysłano zaproszenia' : 'Nic do wysłania',
          r.sent
            ? `Powiadomiono: ${r.sent}${r.failed ? `, nie udało się: ${r.failed}` : ''}.`
            : r.emailReady === false
              ? 'Serwer nie ma skonfigurowanej poczty.'
              : 'Nowe osoby nie mają e-maila w profilu albo już dostały zaproszenie.',
        ),
      onError: (e: any) => Alert.alert('Nie udało się wysłać', e?.message ?? 'Spróbuj ponownie.'),
    });

  const saveNote = (ev: GrafikEvent) => {
    const v = notes[ev.id];
    if (v == null || v === (ev.team.notatki ?? '')) return;
    setNote.mutate({ eventId: ev.id, field: 'notatki', value: v.trim() }, { onError: (e: any) => Alert.alert('Nie udało się zapisać notatki', e?.message ?? '') });
  };

  return (
    <View>
      <SegmentChips
        options={[
          { key: 'upcoming', label: 'Nadchodzące' },
          { key: 'mine', label: 'Moje' },
          { key: 'past', label: 'Minione' },
        ]}
        value={range}
        onChange={setRange}
      />
      {grafik.isLoading ? <Loading /> : null}
      {grafik.isError ? <Empty Icon={ClipboardList} title="Nie udało się wczytać grafiku" hint="Pociągnij w dół, żeby spróbować ponownie." /> : null}
      {!grafik.isLoading && !grafik.isError && list.length === 0 ? (
        <Empty
          Icon={ClipboardList}
          title={range === 'mine' ? 'Nie masz zaplanowanych służb' : range === 'past' ? 'Brak minionych wydarzeń' : 'Brak nadchodzących wydarzeń'}
          hint={
            range === 'upcoming'
              ? 'Grafik układa się na wydarzeniach tej służby. Dodaj wydarzenie albo przypisz służbę do typu wydarzenia w ustawieniach.'
              : undefined
          }
        />
      ) : null}

      {list.map((ev: GrafikEvent) => {
        const filled = roles.filter((r) => csvNames(ev.team[r.key]).length);
        const open = roles.filter((r) => !csvNames(ev.team[r.key]).length);
        const shown = canEdit ? roles : filled;
        const absent = csvNames(ev.team.absencja);
        const mine = ev.sa.filter((a) => a.status === 'pending' && isMe(ev, a.name));
        const toSend = ev.sa.filter((a) => a.status === 'pending' && !a.emailSent && a.email).length;
        const past = range === 'past';
        return (
          <View key={ev.id} style={{ borderRadius: 22, backgroundColor: B.card, marginBottom: 12, overflow: 'hidden' }}>
            <Pressable
              onPress={() => router.push({ pathname: '/(app)/events/[id]', params: { id: ev.id } })}
              className="active:opacity-70"
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, paddingBottom: 10 }}
            >
              <DateBlock ymd={ev.date} tint={involvesMe(ev) ? B.gold : B.ink} bg={involvesMe(ev) ? B.kurkumaSoft : B.paper2} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ fontSize: 16, color: B.ink, letterSpacing: -0.3, fontFamily: F.bold }}>
                  {ev.title}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                    {dayLabel(ev.date)}
                    {ev.time ? ` · ${ev.time}` : ''}
                  </Text>
                  <Tally sa={ev.sa} />
                </View>
              </View>
              <ChevronRight size={18} color={B.ink4} />
            </Pressable>

            {mine.length ? (
              <View style={{ marginHorizontal: 14, marginBottom: 10, padding: 12, borderRadius: 16, backgroundColor: B.kurkumaSoft, gap: 10 }}>
                <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
                  Służysz jako {[...new Set(mine.map((a) => roles.find((r) => r.key === a.roleKey)?.label ?? a.roleKey))].join(', ')} — potwierdzasz?
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    disabled={answer.isPending}
                    onPress={() => mine.forEach((a) => answer.mutate({ id: a.id, status: 'accepted' }))}
                    className="active:opacity-80"
                    style={{ flex: 1, height: 40, borderRadius: 999, backgroundColor: B.ink, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: F.bold }}>Potwierdzam</Text>
                  </Pressable>
                  <Pressable
                    disabled={answer.isPending}
                    onPress={() =>
                      Alert.alert('Nie możesz służyć?', 'Lider zobaczy odmowę w grafiku.', [
                        { text: 'Anuluj', style: 'cancel' },
                        { text: 'Nie mogę', style: 'destructive', onPress: () => mine.forEach((a) => answer.mutate({ id: a.id, status: 'rejected' })) },
                      ])
                    }
                    className="active:opacity-80"
                    style={{ flex: 1, height: 40, borderRadius: 999, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Nie mogę</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {shown.map((r) => {
              const names = csvNames(ev.team[r.key]);
              const statusOf = (n: string) => ev.sa.find((a) => a.roleKey === r.key && a.name === n)?.status ?? null;
              const body = (
                <>
                  <Text style={{ width: '34%', paddingTop: 5, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>{r.label}</Text>
                  <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {names.map((n) => (
                      <PersonChip key={n} name={n} status={statusOf(n)} isMe={isMe(ev, n)} />
                    ))}
                    {!names.length ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5 }}>
                        <Plus size={13} color={B.gold} strokeWidth={2.6} />
                        <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>Przypisz</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              );
              const style = { flexDirection: 'row' as const, gap: 10, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: B.line };
              return canEdit && !past ? (
                <Pressable key={r.key} onPress={() => setPicking({ eventId: ev.id, role: r })} className="active:opacity-60" style={style}>
                  {body}
                </Pressable>
              ) : (
                <View key={r.key} style={style}>
                  {body}
                </View>
              );
            })}

            {!canEdit && open.length ? (
              <Text style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                {filled.length ? 'Wolne role: ' : 'Nikt jeszcze nie jest przypisany. Role: '}
                {open.map((r) => r.label).join(', ')}
              </Text>
            ) : null}

            {canEdit && !past ? (
              <Pressable
                onPress={() => setPicking({ eventId: ev.id, role: 'absent' })}
                className="active:opacity-60"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: 1, borderTopColor: B.line }}
              >
                <UserX size={15} color={absent.length ? '#B42318' : B.ink4} />
                <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, color: absent.length ? B.ink2 : B.ink4, fontFamily: F.medium }}>
                  {absent.length ? `Nieobecni: ${absent.join(', ')}` : 'Zaznacz nieobecnych'}
                </Text>
              </Pressable>
            ) : absent.length ? (
              <Text style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                Nieobecni: {absent.join(', ')}
              </Text>
            ) : null}

            {canEdit && !past ? (
              <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderTopWidth: 1, borderTopColor: B.line }}>
                <TextInput
                  value={notes[ev.id] ?? ev.team.notatki ?? ''}
                  onChangeText={(t) => setNotes((n) => ({ ...n, [ev.id]: t }))}
                  onBlur={() => saveNote(ev)}
                  placeholder="Notatka dla zespołu…"
                  placeholderTextColor={B.ink4}
                  multiline
                  style={{ minHeight: 36, paddingVertical: 8, fontSize: 13, lineHeight: 18, color: B.ink2, fontFamily: F.medium }}
                />
              </View>
            ) : ev.team.notatki ? (
              <Text style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line, fontSize: 13, lineHeight: 18, color: B.ink2, fontFamily: F.medium }}>
                {ev.team.notatki}
              </Text>
            ) : null}

            {canSend && !past && ev.sa.length ? (
              <View style={{ padding: 12, paddingTop: 4 }}>
                <Pressable
                  onPress={() => sendInvites(ev)}
                  disabled={send.isPending}
                  className="active:opacity-80"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: toSend ? B.kurkuma : B.paper,
                    opacity: send.isPending ? 0.6 : 1,
                  }}
                >
                  <Send size={15} color={toSend ? B.ink : B.ink3} />
                  <Text style={{ fontSize: 14, color: toSend ? B.ink : B.ink3, fontFamily: F.bold }}>
                    {toSend ? `Wyślij zaproszenia · ${toSend}` : 'Zaproszenia wysłane'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ height: 4 }} />
            )}
          </View>
        );
      })}

      <AssignSheet
        visible={!!picking && !!pickingEvent}
        event={pickingEvent}
        role={picking?.role ?? null}
        members={members}
        roles={roles}
        saving={setPeople.isPending || setNote.isPending}
        onClose={() => setPicking(null)}
        onSave={savePicked}
      />
    </View>
  );
};

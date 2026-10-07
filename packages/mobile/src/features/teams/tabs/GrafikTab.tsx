import { useMemo, useState } from 'react';
import { Alert, Pressable, Share, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AlertTriangle, Check, ChevronRight, ClipboardList, Clock, Plus, Send, Share2, UserX, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { friendlyError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { respondMessage } from '../../../lib/assignments';
import {
  csvNames,
  inviteSummary,
  splitGrafik,
  unavailableOn,
  useAnswerAssignment,
  useGrafik,
  useSendInvites,
  useSetRolePeople,
  useSetTeamNote,
  useTeamAvailability,
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

// 1 osobę, 2 osoby, 5 osób (biernik — „powiadom 2 osoby”).
const personAcc = (n: number) => {
  if (n === 1) return 'osobę';
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? 'osoby' : 'osób';
};

const STATUS_WORD: Record<GrafikAssignment['status'], string> = {
  accepted: 'potwierdził(a)',
  pending: 'czeka na odpowiedź',
  rejected: 'odmówił(a)',
};

// Osoba w roli: ✓ = potwierdzone, zegar + „czeka” = zaproszenie bez odpowiedzi, przekreślone = odmowa.
const PersonChip = ({ name, status, isMe }: { name: string; status: GrafikAssignment['status'] | null; isMe: boolean }) => (
  <View
    accessible
    accessibilityLabel={`${name}${status ? `, ${STATUS_WORD[status]}` : ''}`}
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
    {status === 'pending' ? <Text style={{ fontSize: 11, color: isMe ? B.goldDeep : B.ink3, fontFamily: F.semibold }}>czeka</Text> : null}
    {status === 'rejected' ? <Text style={{ fontSize: 11, color: '#B42318', fontFamily: F.semibold }}>odmowa</Text> : null}
  </View>
);

// Podsumowanie statusów słowami (na telefonie nie ma podpowiedzi po najechaniu jak na webie).
const Tally = ({ sa }: { sa: GrafikAssignment[] }) => {
  const s = inviteSummary(sa);
  const items = [
    { k: 'accepted', v: s.accepted, Icon: Check, c: '#15803d', label: 'potw.' },
    { k: 'pending', v: s.pending, Icon: Clock, c: B.gold, label: 'czeka' },
    { k: 'rejected', v: s.rejected, Icon: X, c: '#B42318', label: s.rejected === 1 ? 'odmowa' : 'odmowy' },
  ].filter((x) => x.v > 0);
  if (!items.length) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Potwierdzone: ${s.accepted}, czeka na odpowiedź: ${s.pending}, odmówiło: ${s.rejected}`}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}
    >
      {items.map(({ k, v, Icon, c, label }) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Icon size={12} color={c} strokeWidth={2.8} />
          <Text style={{ fontSize: 12, color: c, fontFamily: F.bold }}>
            {v} {label}
          </Text>
        </View>
      ))}
    </View>
  );
};

// Grafik jako tekst do wysłania (WhatsApp, SMS, mail) — mobilny odpowiednik eksportu CSV z weba.
const grafikText = (teamLabel: string, events: GrafikEvent[], roles: GrafikRoleDef[]) =>
  [
    `Grafik — ${teamLabel}`,
    ...events.map((ev) => {
      const lines = [`\n${dayLabel(ev.date)}${ev.time ? `, ${ev.time}` : ''} — ${ev.title}`];
      for (const r of roles) {
        const names = csvNames(ev.team[r.key]);
        if (names.length) lines.push(`${r.label}: ${names.join(', ')}`);
      }
      const absent = csvNames(ev.team.absencja);
      if (absent.length) lines.push(`Nieobecni: ${absent.join(', ')}`);
      if (ev.team.notatki) lines.push(`Notatka: ${ev.team.notatki}`);
      if (lines.length === 1) lines.push('(bez obsady)');
      return lines.join('\n');
    }),
  ].join('\n');

export const GrafikTab = ({
  teamKey,
  teamLabel,
  me,
  canEdit,
  canSend,
}: {
  teamKey: string;
  teamLabel: string;
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

  // Zgłoszone nieobecności (Moje nieobecności / Dostępność) w zakresie nadchodzących wydarzeń.
  const upcomingDates = splitGrafik(data?.events ?? []).upcoming.map((e: GrafikEvent) => e.date);
  const availability = useTeamAvailability(teamKey, upcomingDates[0] ?? null, upcomingDates[upcomingDates.length - 1] ?? null);
  const blockouts = availability.data ?? [];

  // Zapis obsady: od razu na ekranie; przy błędzie obsada wraca (grafik.ts) i pokazujemy powód.
  const savePicked = (names: string[]) => {
    if (!picking || !pickingEvent) return;
    const done = {
      onSuccess: () => setPicking(null),
      onError: (e: unknown) => Alert.alert('Nie udało się zapisać grafiku', friendlyError(e, 'Zmiana nie została zapisana. Spróbuj ponownie.')),
    };
    if (picking.role === 'absent') {
      setNote.mutate({ eventId: pickingEvent.id, field: 'absencja', value: names.join(', ') }, done);
    } else {
      setPeople.mutate({ event: pickingEvent, role: picking.role, names, members, me }, done);
    }
  };

  // „Powiadom (n)”: mail + powiadomienie w aplikacji do osób, które jeszcze go nie dostały.
  const sendInvites = (ev: GrafikEvent) =>
    send.mutate(ev.id, {
      onSuccess: (r) =>
        Alert.alert(
          r.sent ? 'Wysłano powiadomienia' : 'Nikogo nie powiadomiono',
          r.sent
            ? `Powiadomiono: ${r.sent}${r.failed ? `, nie udało się: ${r.failed}` : ''}.`
            : r.failed
              ? 'Nie udało się wysłać powiadomień. Spróbuj ponownie.'
              : 'Brak nowych osób do powiadomienia (sprawdź, czy mają e-mail w profilu).',
        ),
      onError: (e: unknown) => Alert.alert('Nie udało się wysłać', friendlyError(e, 'Spróbuj ponownie.')),
    });

  const answerMine = (ids: string[], status: 'accepted' | 'rejected') =>
    answer.mutate(
      { ids, status },
      {
        onSuccess: () => toast.success(respondMessage(status, { status, already: false })),
        onError: (e: unknown) => Alert.alert('Nie udało się zapisać odpowiedzi', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );

  const saveNote = (ev: GrafikEvent) => {
    const v = notes[ev.id];
    if (v == null || v.trim() === (ev.team.notatki ?? '')) return;
    setNote.mutate(
      { eventId: ev.id, field: 'notatki', value: v.trim() },
      { onError: (e: unknown) => Alert.alert('Nie udało się zapisać notatki', `${friendlyError(e, 'Spróbuj ponownie.')} Tekst został w polu.`) },
    );
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <SegmentChips
            options={[
              { key: 'upcoming', label: 'Nadchodzące' },
              { key: 'mine', label: 'Moje' },
              { key: 'past', label: 'Minione' },
            ]}
            value={range}
            onChange={setRange}
          />
        </View>
        {list.length ? (
          <Pressable
            onPress={() => Share.share({ message: grafikText(teamLabel, list.slice(0, 12), roles) }).catch(() => {})}
            accessibilityLabel="Udostępnij grafik"
            hitSlop={6}
            className="active:opacity-70"
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card }}
          >
            <Share2 size={15} color={B.ink} />
          </Pressable>
        ) : null}
      </View>
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
        const reported = [...unavailableOn(blockouts, ev.date)].filter((n) => !absent.includes(n));
        const mine = ev.sa.filter((a) => a.status === 'pending' && isMe(ev, a.name));
        const summary = inviteSummary(ev.sa);
        const toSend = summary.toSend;
        // Odmowy osób, których już nie ma w roli (serwer zdejmuje je z grafiku przy odmowie).
        const declined = ev.sa.filter((a) => a.status === 'rejected' && !csvNames(ev.team[a.roleKey]).includes(a.name));
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
                <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                  {dayLabel(ev.date)}
                  {ev.time ? ` · ${ev.time}` : ''}
                </Text>
                <View style={{ marginTop: 3 }}>
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
                    onPress={() => answerMine(mine.map((a) => a.id), 'accepted')}
                    className="active:opacity-80"
                    style={{ flex: 1, height: 40, borderRadius: 999, backgroundColor: B.ink, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, color: '#FFFFFF', fontFamily: F.bold }}>Potwierdzam</Text>
                  </Pressable>
                  <Pressable
                    disabled={answer.isPending}
                    onPress={() =>
                      Alert.alert('Nie możesz służyć?', 'Twoje imię zniknie z grafiku na ten dzień, a lider zobaczy odmowę.', [
                        { text: 'Anuluj', style: 'cancel' },
                        { text: 'Nie mogę', style: 'destructive', onPress: () => answerMine(mine.map((a) => a.id), 'rejected') },
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

            {reported.length && !past ? (
              <Text style={{ paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: B.line, fontSize: 12, lineHeight: 17, color: '#B42318', fontFamily: F.semibold }}>
                Zgłoszone nieobecności: {reported.join(', ')}
              </Text>
            ) : null}

            {declined.length && !past ? (
              <Text style={{ paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: 1, borderTopColor: B.line, fontSize: 12, lineHeight: 17, color: '#B42318', fontFamily: F.semibold }}>
                Odmówili: {declined.map((a) => `${a.name} (${roles.find((r) => r.key === a.roleKey)?.label ?? a.roleKey})`).join(', ')}
                {canEdit ? <Text style={{ color: B.ink3, fontFamily: F.medium }}> — ponowne przypisanie wyśle nowe zaproszenie.</Text> : null}
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

            {canSend && !past && (toSend > 0 || summary.noEmail.length > 0 || summary.pending > 0) ? (
              <View style={{ padding: 12, paddingTop: 4, gap: 6 }}>
                {toSend > 0 ? (
                  <>
                    <Pressable
                      onPress={() => sendInvites(ev)}
                      disabled={send.isPending}
                      accessibilityLabel={`Powiadom o służbie: ${toSend} ${personAcc(toSend)}`}
                      className="active:opacity-80"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        height: 44,
                        borderRadius: 999,
                        backgroundColor: B.kurkuma,
                        opacity: send.isPending ? 0.6 : 1,
                      }}
                    >
                      <Send size={15} color={B.ink} />
                      <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>{`Powiadom (${toSend})`}</Text>
                    </Pressable>
                    <Text style={{ fontSize: 12, lineHeight: 16, color: B.ink4, textAlign: 'center', fontFamily: F.medium }}>
                      Wybór osób nie wysyła powiadomień — wyślesz je tym przyciskiem.
                    </Text>
                  </>
                ) : summary.pending > summary.noEmail.length ? (
                  <Text style={{ fontSize: 12, color: B.ink3, textAlign: 'center', fontFamily: F.semibold }}>Wszyscy z e-mailem zostali powiadomieni.</Text>
                ) : null}
                {summary.noEmail.length ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <AlertTriangle size={13} color={B.gold} style={{ marginTop: 2 }} />
                    <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: B.gold, fontFamily: F.semibold }}>
                      Bez e-maila — nie dostaną powiadomienia: {summary.noEmail.join(', ')}
                    </Text>
                  </View>
                ) : null}
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
        reported={pickingEvent ? unavailableOn(blockouts, pickingEvent.date) : new Set<string>()}
        saving={setPeople.isPending || setNote.isPending}
        onClose={() => setPicking(null)}
        onSave={savePicked}
      />
    </View>
  );
};

import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { ArrowUpRight, CalendarOff, ChevronRight, ClipboardList, MessageSquare, Package, Smile, Users, UserRound } from 'lucide-react-native';
import { B, InfoBlock, SectionLabel } from '../../../components/ui/brand';
import { csvNames, splitGrafik, useAnswerAssignment, useGrafik, type GrafikEvent, type GrafikRoleDef } from '../grafik';
import { useRoster, type RosterPerson } from '../roster';
import { useTeamEquipment, type EquipmentItem } from '../data';
import { useKidsData } from '../kids';
import type { WallPost } from '../api';
import type { TeamTabKey } from '../config';
import { dayLabel, parseYmd } from './ui';

// Przegląd zespołu — pierwszy ekran: moja najbliższa służba (z potwierdzeniem),
// najbliższe wydarzenia z obsadą ról i skróty do składu, służb, sprzętu i tablicy.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
};

const Stat = ({ Icon, value, label, onPress }: { Icon: typeof Users; value: string; label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} className="active:opacity-80" style={{ flex: 1, borderRadius: 20, backgroundColor: B.card, paddingHorizontal: 14, paddingVertical: 13 }}>
    <Icon size={16} color={B.gold} />
    <Text numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 10, fontSize: 24, color: B.ink, letterSpacing: -0.6, fontFamily: F.bold }}>
      {value}
    </Text>
    <Text numberOfLines={1} style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
      {label}
    </Text>
  </Pressable>
);

export const OverviewTab = ({
  team,
  table,
  tabs,
  me,
  canEditGrafik,
  latestPost,
  scope,
  onTab,
}: {
  team: string;
  table: string | undefined;
  tabs: TeamTabKey[];
  me: { email: string | null; name: string | null };
  canEditGrafik: boolean;
  latestPost: WallPost | null;
  scope: { selectedCampusId: number | null; withCampusFilter: <T>(q: T) => T };
  onTab: (t: TeamTabKey) => void;
}) => {
  const router = useRouter();
  const has = (t: TeamTabKey) => tabs.includes(t);
  const grafik = useGrafik(team);
  const roster = useRoster(team, has('members') || has('roles') ? table : undefined);
  const equipment = useTeamEquipment(team, has('equipment'));
  const kids = useKidsData(scope, has('students'));
  const answer = useAnswerAssignment(team);

  const roles: GrafikRoleDef[] = grafik.data?.roles ?? [];
  const upcoming: GrafikEvent[] = splitGrafik(grafik.data?.events ?? []).upcoming;
  const isMe = (ev: GrafikEvent, name: string) =>
    (!!me.name && name === me.name) || ev.sa.some((a) => a.name === name && !!me.email && a.email?.toLowerCase() === me.email.toLowerCase());
  const myRoles = (ev: GrafikEvent) => roles.filter((r) => csvNames(ev.team[r.key]).some((n) => isMe(ev, n)));
  const myNext = upcoming.find((ev) => myRoles(ev).length > 0) ?? null;
  const myPending = myNext ? myNext.sa.filter((a) => a.status === 'pending' && isMe(myNext, a.name)) : [];
  const myAccepted = myNext ? myNext.sa.some((a) => a.status === 'accepted' && isMe(myNext, a.name)) : false;

  const people = roster.data?.people.filter((p: RosterPerson) => p.active).length ?? 0;
  const roleCount = roster.data?.roles.length ?? 0;
  const pieces = ((equipment.data ?? []) as EquipmentItem[]).reduce((s, i) => s + i.quantity, 0);
  const openEvent = (id: string) => router.push({ pathname: '/(app)/events/[id]', params: { id } });

  return (
    <View>
      {/* Moja najbliższa służba */}
      {myNext ? (
        <Pressable onPress={() => openEvent(myNext.id)} className="active:opacity-90" style={{ borderRadius: 26, backgroundColor: B.ink, padding: 18 }}>
          <Text style={{ fontSize: 11, color: B.kurkuma, letterSpacing: 1.4, textTransform: 'uppercase', fontFamily: F.bold }}>Twoja najbliższa służba</Text>
          <Text style={{ marginTop: 10, fontSize: 24, color: B.onDark, letterSpacing: -0.6, fontFamily: F.bold }}>
            {dayLabel(myNext.date)}
            {myNext.time ? `, ${myNext.time}` : ''}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 15, color: B.onDarkMuted, fontFamily: F.medium }}>
            {myNext.title} · {format(parseYmd(myNext.date), 'd MMMM', { locale: pl })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
            {myRoles(myNext).map((r) => (
              <View key={r.key} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: B.kurkuma }}>
                <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.bold }}>{r.label}</Text>
              </View>
            ))}
            {!myPending.length && myAccepted ? (
              <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(246,244,238,0.25)' }}>
                <Text style={{ fontSize: 13, color: B.onDark, fontFamily: F.semibold }}>Potwierdzone</Text>
              </View>
            ) : null}
          </View>
          {myPending.length ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pressable
                disabled={answer.isPending}
                onPress={() => myPending.forEach((a) => answer.mutate({ id: a.id, status: 'accepted' }))}
                className="active:opacity-80"
                style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, color: B.ink, fontFamily: F.bold }}>Potwierdzam</Text>
              </Pressable>
              <Pressable
                disabled={answer.isPending}
                onPress={() =>
                  Alert.alert('Nie możesz służyć?', 'Lider zobaczy odmowę w grafiku.', [
                    { text: 'Anuluj', style: 'cancel' },
                    { text: 'Nie mogę', style: 'destructive', onPress: () => myPending.forEach((a) => answer.mutate({ id: a.id, status: 'rejected' })) },
                  ])
                }
                className="active:opacity-80"
                style={{ flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(246,244,238,0.3)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, color: B.onDark, fontFamily: F.bold }}>Nie mogę</Text>
              </Pressable>
            </View>
          ) : null}
        </Pressable>
      ) : grafik.isSuccess ? (
        <View style={{ borderRadius: 24, backgroundColor: B.card, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: B.kurkumaSoft, alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={20} color={B.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Nie masz zaplanowanych służb</Text>
            <Text style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Gdy lider Cię przypisze, zobaczysz to tutaj.</Text>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => router.push('/(app)/serve/availability')}
        className="active:opacity-70"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 10, marginLeft: 4, paddingVertical: 6 }}
      >
        <CalendarOff size={15} color={B.gold} />
        <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>Zgłoś nieobecność</Text>
      </Pressable>

      {/* Najbliższe wydarzenia z obsadą */}
      {upcoming.length ? (
        <>
          <SectionLabel count={upcoming.length}>Najbliższe wydarzenia</SectionLabel>
          <View style={{ backgroundColor: B.card, borderRadius: 22, overflow: 'hidden' }}>
            {upcoming.slice(0, 4).map((ev, i) => {
              const filled = roles.filter((r) => csvNames(ev.team[r.key]).length).length;
              const open = roles.length - filled;
              const d = parseYmd(ev.date);
              return (
                <Pressable
                  key={ev.id}
                  onPress={() => (canEditGrafik ? onTab('schedule') : openEvent(ev.id))}
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: B.line }}
                >
                  <InfoBlock top={String(d.getDate())} bottom={format(d, 'LLL', { locale: pl })} dark={myRoles(ev).length > 0} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, letterSpacing: -0.2, fontFamily: F.semibold }}>
                      {ev.title}
                    </Text>
                    <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                      {dayLabel(ev.date)}
                      {ev.time ? ` · ${ev.time}` : ''}
                    </Text>
                    {roles.length ? (
                      <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12, color: open ? B.gold : '#15803d', fontFamily: F.bold }}>
                        {open ? `${open} ${plural(open, 'wolna rola', 'wolne role', 'wolnych ról')} z ${roles.length}` : 'Pełna obsada'}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={18} color={B.ink4} />
                </Pressable>
              );
            })}
          </View>
          {has('schedule') ? (
            <Pressable onPress={() => onTab('schedule')} className="active:opacity-70" style={{ alignSelf: 'flex-start', marginTop: 10, marginLeft: 4, paddingVertical: 6 }}>
              <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>{canEditGrafik ? 'Ułóż grafik' : 'Cały grafik'} →</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {/* Skróty */}
      {has('members') || has('roles') || has('equipment') || has('students') ? (
        <>
          <SectionLabel>Zespół</SectionLabel>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {has('members') ? <Stat Icon={UserRound} value={roster.data ? String(people) : '–'} label={team === 'kids' ? plural(people, 'nauczyciel', 'nauczycieli', 'nauczycieli') : plural(people, 'osoba', 'osoby', 'osób')} onPress={() => onTab('members')} /> : null}
            {has('students') ? (
              <Stat Icon={Smile} value={kids.data ? String(kids.data.students.length) : '–'} label="dzieci" onPress={() => onTab('students')} />
            ) : null}
            {has('roles') ? <Stat Icon={Users} value={roster.data ? String(roleCount) : '–'} label={plural(roleCount, 'służba', 'służby', 'służb')} onPress={() => onTab('roles')} /> : null}
            {has('equipment') ? <Stat Icon={Package} value={equipment.data ? String(pieces) : '–'} label="sprzęt" onPress={() => onTab('equipment')} /> : null}
          </View>
        </>
      ) : null}

      {/* Ostatni wpis z tablicy */}
      {has('wall') && latestPost ? (
        <>
          <SectionLabel>Z tablicy</SectionLabel>
          <Pressable onPress={() => onTab('wall')} className="active:opacity-80" style={{ borderRadius: 22, backgroundColor: B.card, padding: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MessageSquare size={14} color={B.gold} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
                {latestPost.author_name || latestPost.author_email?.split('@')[0]} · {format(new Date(latestPost.created_at), 'd MMM, HH:mm', { locale: pl })}
              </Text>
              <ArrowUpRight size={16} color={B.ink4} />
            </View>
            <Text numberOfLines={3} style={{ fontSize: 15, lineHeight: 21, color: B.ink, fontFamily: F.medium }}>
              {latestPost.title ? `${latestPost.title} — ` : ''}
              {latestPost.content}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
};

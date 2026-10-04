import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  MapPin,
  Minus,
  MoreHorizontal,
  Music,
  Navigation,
  Pencil,
  Plus,
  Share2,
  Ticket,
  Type as TypeIcon,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { B, Monogram, SectionLabel } from '../../../src/components/ui/brand';
import { goBack } from '../../../src/lib/navigation';
import { useAuthSession } from '../../../src/lib/auth';
import { tenantWebBase } from '../../../src/lib/supabase';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { useMyProfile } from '../../../src/features/account/api';
import { useUpdateAssignmentStatus } from '../../../src/features/programs/api';
import { formatTime } from '../../../src/lib/domain';
import {
  useCancelEvent,
  useEventRegistrations,
  useSignUpEvent,
  type EventRegistration,
} from '../../../src/features/calendar/api';
import {
  useEventDetail,
  type EventDetail,
  type EventFile,
  type EventProgram,
  type MyAssignment,
  type ServiceSection,
} from '../../../src/features/calendar/event-detail';
import { addToPhoneCalendar } from '../../../src/features/calendar/add-to-calendar';
import { NewCalendarEventModal } from '../../../src/features/calendar/components/NewCalendarEventModal';
import { cap, isOngoing, isOver, relativeDay, timeRange, useCalendarLabel } from '../../../src/features/calendar/meta';

// Pełny widok wydarzenia (jak strona wydarzenia na webie): termin i miejsce, szybkie akcje,
// moja służba (potwierdź/odmów), obecność (Będę), szczegóły, program, służby, materiały,
// zakładki własne. Osoby z prawem edycji zmieniają podstawowe pola i usuwają wydarzenie.

const F = {
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  xbold: 'Manrope_800ExtraBold',
} as const;

const ymdPl = (ymd: string | null) => (ymd ? ymd.split('-').reverse().join('.') : '');
const money = (grosze: number | null) =>
  grosze == null ? '—' : `${(grosze / 100).toFixed(2).replace('.', ',').replace(/,00$/, '')} zł`;
// Czas trwania (sekundy) jako „12 min” / „1 h 15 min” — „12:00” myliło się z godziną.
const duration = (sec: number) => {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
};
const fileSize = (b: number | null) =>
  !b ? null : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
const plural = (n: number, one: string, few: string, many: string) => {
  if (n === 1) return one;
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const hm = (d: Date) => format(d, 'HH:mm');

const openUrl = (url: string | null) => {
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert('Błąd', 'Nie udało się otworzyć linku.'));
};
const openMaps = (place: string) =>
  openUrl(
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?q=${encodeURIComponent(place)}`
      : `geo:0,0?q=${encodeURIComponent(place)}`,
  );

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = Number(id);
  const router = useRouter();
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const profile = useMyProfile(email);
  const myName = profile.data?.full_name || profile.data?.name || user?.full_name || null;
  const calendarLabel = useCalendarLabel();

  const q = useEventDetail(Number.isFinite(eventId) ? eventId : null, { email, name: myName, moduleLabel: calendarLabel });

  if (q.data) {
    return (
      <EventBody
        d={q.data}
        calendarLabel={calendarLabel(q.data.event.moduleKey)}
        email={email}
        myName={myName}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
      />
    );
  }
  return (
    <Shell onBack={() => goBack(router)}>
      {q.isLoading ? (
        <ActivityIndicator color={B.ink} />
      ) : (
        <>
          <Text style={{ fontSize: 17, color: B.ink, fontFamily: F.bold, textAlign: 'center' }}>
            {q.isError ? 'Nie udało się wczytać wydarzenia' : 'Wydarzenie niedostępne'}
          </Text>
          <Text style={{ marginTop: 6, fontSize: 14, color: B.ink3, fontFamily: F.medium, textAlign: 'center' }}>
            {q.isError ? (q.error as Error)?.message : 'Mogło zostać usunięte albo nie jest widoczne dla Ciebie.'}
          </Text>
          {q.isError ? (
            <Pressable onPress={() => q.refetch()} style={[btn.base, btn.dark, { marginTop: 16, paddingHorizontal: 22 }]}>
              <Text style={[btn.text, { color: '#fff' }]}>Spróbuj ponownie</Text>
            </Pressable>
          ) : null}
        </>
      )}
    </Shell>
  );
}

const Shell = ({ onBack, children }: { onBack: () => void; children: ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
        <BackButton onPress={onBack} />
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>{children}</View>
    </View>
  );
};

const BackButton = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    hitSlop={10}
    accessibilityLabel="Wstecz"
    className="active:opacity-60"
    style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
  >
    <ChevronLeft size={20} color={B.ink} strokeWidth={2.2} />
  </Pressable>
);

interface BodyProps {
  d: EventDetail;
  calendarLabel: string;
  email: string | null;
  myName: string | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const EventBody = ({ d, calendarLabel, email, myName, refreshing, onRefresh }: BodyProps) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const perms = usePermissions();
  const { campusIdForInsert } = useCampusQuery();
  const ev = d.event;
  const canEdit = perms.can('res:events:update');
  const [editing, setEditing] = useState(false);

  const now = new Date();
  const over = isOver(ev, now);
  const live = isOngoing(ev, now);
  const eyebrow = [d.typeLabel, calendarLabel].filter(Boolean).join(' · ');
  const length =
    !ev.allDay && ev.endsAt && ev.endsAt > ev.startsAt ? duration((ev.endsAt.getTime() - ev.startsAt.getTime()) / 1000) : null;

  // Obecność / zapisy (event_registrations) — jak panel „Uczestnicy” na webie: „Będę” przy
  // każdym wydarzeniu; przy wymaganej rejestracji limit miejsc i termin; płatne → web.
  const regs = useEventRegistrations(ev.eventId);
  const list: EventRegistration[] = regs.data ?? [];
  const going = list.reduce((s, r) => s + 1 + (r.guests_count || 0), 0);
  const mine = email ? list.find((r) => (r.user_email || '').toLowerCase() === email.toLowerCase()) ?? null : null;

  const showAttendance = (d.sections.participants || d.registrationRequired) && (!over || list.length > 0);
  const showProgram = d.sections.program && !!d.program;
  const showServices = d.sections.services && d.hasServiceConfig;
  const files = [...d.attachments, ...d.materials];
  const showFiles = files.length > 0;
  const showDetails = !!d.details || d.fields.length > 0 || !!d.link;
  const showMyService = d.myAssignments.length > 0 || ev.isMine;

  const share = () => {
    const base = tenantWebBase();
    const when = `${cap(format(ev.startsAt, 'EEEE, d MMMM', { locale: pl }))}, ${timeRange(ev)}`;
    Share.share({
      message: [ev.title, when, ev.location, base ? `${base}/wydarzenie/${ev.eventId}` : null].filter(Boolean).join('\n'),
    }).catch(() => undefined);
  };

  // Skróty do sekcji (przyklejony pasek): pozycja sekcji z onLayout → scrollTo.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const baseY = useRef(0);
  const [navH, setNavH] = useState(0);
  const mark = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };
  const jump = (key: string) => {
    const y = offsets.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, baseY.current + y - navH - 6), animated: true });
  };
  const nav: { key: string; label: string }[] = [
    ...(showAttendance ? [{ key: 'attendance', label: d.registrationRequired ? 'Zapisy' : 'Obecność' }] : []),
    ...(showDetails ? [{ key: 'details', label: 'Szczegóły' }] : []),
    ...(showProgram ? [{ key: 'program', label: 'Program' }] : []),
    ...(showServices ? [{ key: 'services', label: 'Służby' }] : []),
    ...(showFiles ? [{ key: 'files', label: 'Materiały' }] : []),
    ...d.customTabs.map((t) => ({ key: `tab-${t.id}`, label: t.label })),
  ];

  const actions: { key: string; Icon: LucideIcon; label: string; onPress: () => void }[] = [
    ...(!over ? [{ key: 'cal', Icon: CalendarPlus, label: 'Do kalendarza', onPress: () => addToPhoneCalendar(ev, d.details || null) }] : []),
    ...(ev.location ? [{ key: 'map', Icon: Navigation, label: 'Trasa', onPress: () => openMaps(ev.location!) }] : []),
    { key: 'share', Icon: Share2, label: 'Udostępnij', onPress: share },
    ...(canEdit ? [{ key: 'edit', Icon: Pencil, label: 'Edytuj', onPress: () => setEditing(true) }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      {/* Pas pod paskiem statusu — przyklejony pasek skrótów zatrzymuje się pod nim. */}
      <View style={{ height: insets.top, backgroundColor: B.paper }} />
      <ScrollView
        ref={scrollRef}
        stickyHeaderIndices={nav.length > 1 ? [1] : undefined}
        contentContainerStyle={{ paddingBottom: 130 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.ink} />}
      >
        <View style={{ paddingTop: 10, paddingHorizontal: 16 }}>
          <View style={{ paddingHorizontal: 4, marginBottom: 14 }}>
            <BackButton onPress={() => goBack(router)} />
          </View>

          {/* Ciemna karta: co, kiedy, gdzie */}
          <View style={{ backgroundColor: B.ink, borderRadius: 28, padding: 20 }}>
            {eyebrow ? (
              <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: B.kurkuma, fontFamily: F.bold }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={{ marginTop: 6, fontSize: 26, lineHeight: 31, color: B.onDark, letterSpacing: -0.8, fontFamily: F.xbold }}>
              {ev.title}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 18 }}>
              <View style={{ width: 64, borderRadius: 18, backgroundColor: B.kurkuma, alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontSize: 11, letterSpacing: 1, color: B.ink, fontFamily: F.bold, textTransform: 'uppercase' }}>
                  {format(ev.startsAt, 'LLL', { locale: pl }).replace('.', '')}
                </Text>
                <Text style={{ fontSize: 28, lineHeight: 32, color: B.ink, fontFamily: F.xbold, letterSpacing: -1 }}>
                  {ev.startsAt.getDate()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, color: B.onDark, fontFamily: F.bold, letterSpacing: -0.2 }}>
                  {cap(format(ev.startsAt, 'EEEE, d MMMM yyyy', { locale: pl }))}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Clock size={14} color={B.onDarkMuted} />
                  <Text style={{ fontSize: 14, color: B.onDarkMuted, fontFamily: F.semibold, fontVariant: ['tabular-nums'] }}>
                    {timeRange(ev)}
                    {length ? ` · ${length}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              <Chip tone={live ? 'kurkuma' : 'dark'}>{live ? 'Trwa teraz' : over ? 'Zakończone' : relativeDay(ev.startsAt, now)}</Chip>
              {mine ? <Chip tone="dark">{over ? 'Byłeś/aś zapisany/a' : 'Będziesz'}</Chip> : null}
            </View>

            {ev.location ? (
              <Pressable
                onPress={() => openMaps(ev.location!)}
                className="active:opacity-70"
                style={{
                  marginTop: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingTop: 14,
                  borderTopWidth: 1,
                  borderTopColor: 'rgba(246,244,238,0.12)',
                }}
              >
                <MapPin size={17} color={B.kurkuma} />
                <Text style={{ flex: 1, fontSize: 15, color: B.onDark, fontFamily: F.semibold }}>{ev.location}</Text>
                <ChevronRight size={16} color={B.onDarkMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* Szybkie akcje */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            {actions.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                className="active:opacity-70"
                accessibilityLabel={a.label}
                style={{ flex: 1, backgroundColor: B.card, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center', gap: 7 }}
              >
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                  <a.Icon size={18} color={B.ink} strokeWidth={2.1} />
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={{ fontSize: 12, color: B.ink2, fontFamily: F.semibold }}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {showMyService ? (
            <MyServiceCard assignments={d.myAssignments} fallbackRole={ev.myRole} over={over} eventId={ev.eventId} />
          ) : null}
        </View>

        {/* Przyklejony pasek skrótów do sekcji */}
        {nav.length > 1 ? (
          <View onLayout={(e) => setNavH(e.nativeEvent.layout.height)} style={{ backgroundColor: B.paper, paddingTop: 12, paddingBottom: 8 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
              {nav.map((n) => (
                <Pressable
                  key={n.key}
                  onPress={() => jump(n.key)}
                  className="active:opacity-70"
                  style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: B.paper2 }}
                >
                  <Text style={{ fontSize: 13, color: B.ink, fontFamily: F.semibold }}>{n.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <View />
        )}

        <View style={{ paddingHorizontal: 16 }} onLayout={(e) => (baseY.current = e.nativeEvent.layout.y)}>
          {showAttendance ? (
            <View onLayout={mark('attendance')}>
              <SectionLabel count={going || undefined}>{d.registrationRequired ? 'Zapisy' : 'Obecność'}</SectionLabel>
              <Attendance d={d} list={list} going={going} mine={mine} over={over} email={email} myName={myName} loading={regs.isLoading} />
            </View>
          ) : null}

          {showDetails ? (
            <View onLayout={mark('details')}>
              <SectionLabel>Szczegóły</SectionLabel>
              <Card>
                {d.details ? (
                  <Text style={{ fontSize: 15, lineHeight: 23, color: B.ink2, fontFamily: F.medium }}>{d.details}</Text>
                ) : null}
                {d.fields.map((f, i) => (
                  <KeyValue key={f.label} label={f.label} value={f.value} first={!d.details && i === 0} />
                ))}
                {d.link ? (
                  <LinkRow
                    Icon={LinkIcon}
                    label={d.link.replace(/^https?:\/\//, '')}
                    onPress={() => openUrl(d.link)}
                    first={!d.details && !d.fields.length}
                  />
                ) : null}
              </Card>
            </View>
          ) : null}

          {showProgram ? (
            <View onLayout={mark('program')}>
              <SectionLabel>Program</SectionLabel>
              <ProgramCard
                program={d.program!}
                onOpen={() => router.push({ pathname: '/(app)/programs/[id]', params: { id: String(d.program!.id) } })}
              />
            </View>
          ) : null}

          {showServices ? (
            <View onLayout={mark('services')}>
              <SectionLabel>Służby</SectionLabel>
              <Services sections={d.services} />
            </View>
          ) : null}

          {showFiles ? (
            <View onLayout={mark('files')}>
              <SectionLabel count={files.length}>Materiały</SectionLabel>
              <Card padded={false}>
                {files.map((f, i) => (
                  <FileRow key={f.id} file={f} first={i === 0} />
                ))}
              </Card>
            </View>
          ) : null}

          {d.customTabs.map((t) => (
            <View key={t.id} onLayout={mark(`tab-${t.id}`)}>
              <SectionLabel>{t.label}</SectionLabel>
              <Card>
                <Text style={{ fontSize: 15, lineHeight: 23, color: B.ink2, fontFamily: F.medium }}>{t.text}</Text>
              </Card>
            </View>
          ))}
        </View>
      </ScrollView>

      {canEdit ? (
        <NewCalendarEventModal
          visible={editing}
          onClose={() => setEditing(false)}
          userEmail={email}
          campusIdForInsert={campusIdForInsert}
          canDelete={perms.can('res:events:delete')}
          onDeleted={() => goBack(router)}
          editing={{
            id: ev.eventId,
            title: ev.title,
            moduleKey: ev.moduleKey,
            date: format(ev.startsAt, 'yyyy-MM-dd'),
            time: ev.allDay ? null : hm(ev.startsAt),
            endTime: ev.endsAt && !ev.allDay ? hm(ev.endsAt) : null,
            location: ev.location,
            description: d.raw.description,
            hasDetailsHtml: d.raw.hasDetailsHtml,
          }}
        />
      ) : null}
    </View>
  );
};

// ── Moja służba ────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<string, string> = {
  pending: 'Czeka na Twoje potwierdzenie',
  accepted: 'Potwierdzone',
  rejected: 'Odmówiono',
};

const MyServiceCard = ({
  assignments,
  fallbackRole,
  over,
  eventId,
}: {
  assignments: MyAssignment[];
  fallbackRole: string | null;
  over: boolean;
  eventId: number;
}) => {
  const qc = useQueryClient();
  const respond = useUpdateAssignmentStatus();
  const answer = (a: MyAssignment, status: 'accepted' | 'rejected') =>
    respond.mutate(
      { id: a.id, status },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ['event-detail', eventId] });
          qc.invalidateQueries({ queryKey: ['agenda'] });
        },
        onError: (e: any) => Alert.alert('Nie udało się', e?.message ?? 'Spróbuj ponownie.'),
      },
    );
  const rows = assignments.length
    ? assignments
    : [{ id: '', team: '', role: fallbackRole ?? 'Służba', status: null } as MyAssignment];

  return (
    <View style={{ marginTop: 12, backgroundColor: B.kurkuma, borderRadius: 24, padding: 18, gap: 14 }}>
      {rows.map((a, i) => (
        <View key={a.id || i} style={{ gap: 10 }}>
          <View>
            <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: B.goldDeep, fontFamily: F.bold }}>
              Twoja służba
            </Text>
            <Text style={{ marginTop: 4, fontSize: 18, color: B.ink, fontFamily: F.xbold, letterSpacing: -0.4 }}>
              {[a.role, a.team].filter(Boolean).join(' · ')}
            </Text>
            {a.status ? (
              <Text style={{ marginTop: 2, fontSize: 13, color: B.goldDeep, fontFamily: F.semibold }}>{STATUS_TEXT[a.status]}</Text>
            ) : null}
          </View>
          {a.id && !over && a.status !== 'accepted' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => answer(a, 'accepted')}
                disabled={respond.isPending}
                className="active:opacity-80"
                style={[btn.base, btn.dark, { flex: 1, paddingVertical: 11 }]}
              >
                <Check size={16} color="#fff" strokeWidth={2.6} />
                <Text style={[btn.text, { color: '#fff' }]}>Potwierdzam</Text>
              </Pressable>
              {a.status !== 'rejected' ? (
                <Pressable
                  onPress={() => answer(a, 'rejected')}
                  disabled={respond.isPending}
                  className="active:opacity-80"
                  style={[btn.base, { flex: 1, paddingVertical: 11, backgroundColor: 'rgba(42,35,18,0.1)' }]}
                >
                  <Text style={btn.text}>Nie mogę</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
};

// ── Obecność / zapisy ─────────────────────────────────────────────────────

const Attendance = ({
  d,
  list,
  going,
  mine,
  over,
  email,
  myName,
  loading,
}: {
  d: EventDetail;
  list: EventRegistration[];
  going: number;
  mine: EventRegistration | null;
  over: boolean;
  email: string | null;
  myName: string | null;
  loading: boolean;
}) => {
  const ev = d.event;
  const signUp = useSignUpEvent(ev.eventId, email);
  const cancel = useCancelEvent(ev.eventId, email);
  const [guests, setGuests] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const busy = signUp.isPending || cancel.isPending;
  const capacity = d.maxParticipants;
  const full = capacity != null && going >= capacity;
  const paidOnWeb = d.isPaid && d.registrationRequired;
  const deadlinePassed = !!d.registrationDeadline && d.registrationDeadline < format(new Date(), 'yyyy-MM-dd');

  const doSignUp = () =>
    signUp.mutate(
      { guests, fullName: myName ?? '' },
      { onError: (e: any) => Alert.alert('Nie udało się zapisać', e?.message ?? 'Spróbuj ponownie.') },
    );
  const doCancel = () =>
    cancel.mutate(undefined, { onError: (e: any) => Alert.alert('Nie udało się wypisać', e?.message ?? 'Spróbuj ponownie.') });
  const openWebEvent = () => {
    const base = tenantWebBase();
    if (base) openUrl(`${base}/wydarzenie/${ev.eventId}`);
  };

  const names = list.map((r) => r.full_name || r.user_email?.split('@')[0] || 'Uczestnik');
  const summary =
    going === 0
      ? over
        ? 'Nikt się nie zapisał'
        : 'Nikt jeszcze się nie zapisał'
      : over
        ? `${going} ${plural(going, 'osoba była', 'osoby były', 'osób było')}`
        : `${going} ${plural(going, 'osoba będzie', 'osoby będą', 'osób będzie')}`;
  const shown = showAll ? list : list.slice(0, 5);

  return (
    <Card padded={false}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {names.length ? (
            <View style={{ flexDirection: 'row' }}>
              {names.slice(0, 4).map((n, i) => (
                <View key={`${n}-${i}`} style={{ marginLeft: i ? -10 : 0, borderRadius: 18, borderWidth: 2, borderColor: B.card }}>
                  <Monogram name={n} size={32} />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
              <Users size={17} color={B.ink3} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{loading ? 'Wczytywanie…' : summary}</Text>
            {capacity != null || d.registrationDeadline ? (
              <Text style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                {[
                  capacity != null ? `limit ${capacity} miejsc` : null,
                  d.registrationDeadline ? `zapisy do ${ymdPl(d.registrationDeadline)}${deadlinePassed ? ' (zamknięte)' : ''}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
        </View>

        {capacity != null ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: B.paper2, overflow: 'hidden' }}>
            <View style={{ height: 6, width: `${Math.min(100, Math.round((going / capacity) * 100))}%`, backgroundColor: B.kurkuma }} />
          </View>
        ) : null}

        {d.prices.length ? (
          <View>
            {d.prices.map((p, i) => (
              <KeyValue key={`${p.label}-${i}`} label={p.label} value={money(p.amount)} first={i === 0} />
            ))}
            {d.paymentDeadline ? <KeyValue label="Płatność do" value={ymdPl(d.paymentDeadline)} /> : null}
          </View>
        ) : null}

        {over || !email ? null : paidOnWeb ? (
          <Pressable onPress={openWebEvent} className="active:opacity-80" style={[btn.base, btn.dark]}>
            <Ticket size={16} color="#fff" strokeWidth={2.3} />
            <Text style={[btn.text, { color: '#fff' }]}>{mine ? 'Twoja rejestracja' : 'Zapisz się i zapłać'}</Text>
          </Pressable>
        ) : mine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, paddingLeft: 12, borderRadius: 18, backgroundColor: B.kurkumaSoft }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center' }}>
              <Check size={16} color={B.ink} strokeWidth={2.8} />
            </View>
            <Text style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.bold }}>
              Będziesz{mine.guests_count ? ` (+${mine.guests_count})` : ''}
            </Text>
            <Pressable onPress={doCancel} disabled={busy} className="active:opacity-70" style={[btn.base, { backgroundColor: B.card, paddingVertical: 8, paddingHorizontal: 14 }]}>
              {busy ? <ActivityIndicator size="small" color={B.ink} /> : <Text style={[btn.text, { fontSize: 13 }]}>Nie będę</Text>}
            </Pressable>
          </View>
        ) : deadlinePassed ? (
          <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.semibold }}>Zapisy są już zamknięte.</Text>
        ) : full ? (
          <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.semibold }}>Brak wolnych miejsc.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>Osoby towarzyszące</Text>
              <Stepper value={guests} onChange={setGuests} max={capacity != null ? Math.max(0, capacity - going - 1) : 10} />
            </View>
            <Pressable onPress={doSignUp} disabled={busy} className="active:opacity-80" style={[btn.base, btn.kurkuma]}>
              {busy ? <ActivityIndicator size="small" color={B.ink} /> : <Check size={17} color={B.ink} strokeWidth={2.6} />}
              <Text style={btn.text}>{d.registrationRequired ? 'Zapisz się' : 'Będę'}</Text>
            </Pressable>
          </>
        )}

        {d.formUrl && !over ? (
          <Pressable onPress={() => openUrl(d.formUrl)} className="active:opacity-80" style={[btn.base, { backgroundColor: B.paper2 }]}>
            <FileText size={16} color={B.ink} />
            <Text style={btn.text}>Formularz zgłoszeniowy</Text>
          </Pressable>
        ) : null}
      </View>

      {shown.map((r, i) => {
        const name = r.full_name || r.user_email?.split('@')[0] || 'Uczestnik';
        return (
          <View
            key={r.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line }}
          >
            <Monogram name={name} size={30} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
              {name}
              {mine && r.id === mine.id ? ' (Ty)' : ''}
            </Text>
            {r.guests_count ? <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>+{r.guests_count}</Text> : null}
          </View>
        );
      })}
      {list.length > 5 ? (
        <Pressable
          onPress={() => setShowAll((v) => !v)}
          className="active:opacity-70"
          style={{ paddingVertical: 13, alignItems: 'center', borderTopWidth: 1, borderTopColor: B.line }}
        >
          <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>{showAll ? 'Zwiń listę' : `Pokaż wszystkich (${list.length})`}</Text>
        </Pressable>
      ) : null}
    </Card>
  );
};

const Stepper = ({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 3, borderRadius: 999, backgroundColor: B.paper }}>
    <Pressable
      onPress={() => onChange(Math.max(0, value - 1))}
      disabled={value === 0}
      hitSlop={6}
      accessibilityLabel="Mniej osób"
      style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card, opacity: value === 0 ? 0.4 : 1 }}
    >
      <Minus size={16} color={B.ink} />
    </Pressable>
    <Text style={{ minWidth: 22, textAlign: 'center', fontSize: 15, color: B.ink, fontFamily: F.bold, fontVariant: ['tabular-nums'] }}>{value}</Text>
    <Pressable
      onPress={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      hitSlop={6}
      accessibilityLabel="Więcej osób"
      style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: B.card, opacity: value >= max ? 0.4 : 1 }}
    >
      <Plus size={16} color={B.ink} />
    </Pressable>
  </View>
);

// ── Klocki ─────────────────────────────────────────────────────────────────

const Card = ({ children, padded = true }: { children: ReactNode; padded?: boolean }) => (
  <View style={{ backgroundColor: B.card, borderRadius: 22, padding: padded ? 16 : 0, overflow: 'hidden' }}>{children}</View>
);

const Chip = ({ children, tone }: { children: string; tone: 'kurkuma' | 'dark' }) => (
  <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tone === 'kurkuma' ? B.kurkuma : 'rgba(246,244,238,0.12)' }}>
    <Text style={{ fontSize: 12, color: tone === 'kurkuma' ? B.ink : B.onDark, fontFamily: F.bold }}>{children}</Text>
  </View>
);

const KeyValue = ({ label, value, first }: { label: string; value: string; first?: boolean }) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      paddingVertical: 10,
      marginTop: first ? -4 : 0,
      borderTopWidth: first ? 0 : 1,
      borderTopColor: B.line,
    }}
  >
    <Text style={{ fontSize: 14, color: B.ink3, fontFamily: F.medium }}>{label}</Text>
    <Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, color: B.ink, fontFamily: F.semibold }}>{value}</Text>
  </View>
);

const LinkRow = ({ Icon, label, onPress, first }: { Icon: LucideIcon; label: string; onPress: () => void; first?: boolean }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingTop: first ? 0 : 12,
      marginTop: first ? 0 : 10,
      borderTopWidth: first ? 0 : 1,
      borderTopColor: B.line,
    }}
  >
    <Icon size={16} color={B.gold} />
    <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
      {label}
    </Text>
    <ChevronRight size={16} color={B.ink4} />
  </Pressable>
);

const ITEM_ICON: Record<string, LucideIcon> = { item: TypeIcon, song: Music, media: ImageIcon, header: MoreHorizontal };

const ProgramCard = ({ program, onOpen }: { program: EventProgram; onOpen: () => void }) => {
  const [all, setAll] = useState(false);
  const items = program.schedule;
  const total = items.reduce((s, it) => s + (Number(it?.duration) || 0), 0);
  const songs = items.filter((it) => it?.type === 'song').length;
  const LIMIT = 8;
  const shown = all ? items : items.slice(0, LIMIT);
  return (
    <Card padded={false}>
      <Pressable onPress={onOpen} className="active:opacity-70" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, color: B.ink, fontFamily: F.bold, letterSpacing: -0.3 }}>
            {program.title || 'Program'}
          </Text>
          <Text style={{ marginTop: 3, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
            {[`${items.length} elem.`, songs ? `${songs} pieśni` : null, total ? `łącznie ${duration(total)}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>Otwórz</Text>
        <ChevronRight size={16} color={B.gold} />
      </Pressable>
      {shown.map((it, idx) => {
        if (it?.type === 'header') {
          return (
            <View key={it.id ?? idx} style={{ paddingHorizontal: 16, paddingVertical: 9, backgroundColor: B.kurkumaSoft }}>
              <Text style={{ fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', color: B.goldDeep, fontFamily: F.bold }}>
                {it.title || 'Sekcja'}
              </Text>
            </View>
          );
        }
        const Icon = ITEM_ICON[it?.type] ?? TypeIcon;
        const song = it?.type === 'song' && it?.songId != null ? program.songs[String(it.songId)] : null;
        const title = it?.type === 'song' ? it?.title || song?.title || 'Pieśń' : it?.title || 'Element';
        const key = it?.songKey || song?.key;
        const sub = [it?.person, key ? `tonacja ${key}` : null].filter(Boolean).join(' · ');
        return (
          <View
            key={it.id ?? idx}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: B.line }}
          >
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: it?.type === 'song' ? B.kurkumaSoft : B.paper,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={15} color={it?.type === 'song' ? B.gold : B.ink3} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
                {title}
              </Text>
              {sub ? (
                <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>
                  {sub}
                </Text>
              ) : null}
            </View>
            {it?.duration ? (
              <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.semibold, fontVariant: ['tabular-nums'] }}>
                {it.duration % 60 ? formatTime(it.duration) : duration(it.duration)}
              </Text>
            ) : null}
          </View>
        );
      })}
      {items.length > LIMIT ? (
        <Pressable
          onPress={() => setAll((v) => !v)}
          className="active:opacity-70"
          style={{ paddingVertical: 13, alignItems: 'center', borderTopWidth: 1, borderTopColor: B.line }}
        >
          <Text style={{ fontSize: 13, color: B.gold, fontFamily: F.bold }}>{all ? 'Zwiń plan' : `Pokaż cały plan (${items.length})`}</Text>
        </Pressable>
      ) : null}
      {items.length === 0 ? (
        <Text style={{ paddingHorizontal: 16, paddingBottom: 16, fontSize: 13, color: B.ink4, fontFamily: F.medium }}>
          Plan programu jest jeszcze pusty.
        </Text>
      ) : null}
    </Card>
  );
};

const STATUS_HINT: Record<string, string> = { pending: 'czeka', rejected: 'odmowa' };

const Services = ({ sections }: { sections: ServiceSection[] }) => {
  const assigned = sections.filter((s) => s.roles.length > 0 || s.notes);
  const empty = sections.filter((s) => s.roles.length === 0 && !s.notes);
  return (
    <View style={{ gap: 10 }}>
      {assigned.map((s) => (
        <Card key={s.key} padded={false}>
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ fontSize: 16, color: B.ink, fontFamily: F.bold, letterSpacing: -0.3 }}>{s.label}</Text>
          </View>
          {s.roles.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line }}>
              <Text style={{ width: '36%', paddingTop: 5, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>{r.label}</Text>
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {r.people.map((p) => (
                  <View
                    key={p.name}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      backgroundColor: p.isMe ? B.kurkuma : B.paper,
                      opacity: p.status === 'rejected' ? 0.5 : 1,
                    }}
                  >
                    {p.status === 'accepted' ? <Check size={12} color={p.isMe ? B.ink : B.gold} strokeWidth={3} /> : null}
                    <Text
                      style={{
                        fontSize: 13,
                        color: B.ink,
                        fontFamily: p.isMe ? F.bold : F.semibold,
                        textDecorationLine: p.status === 'rejected' ? 'line-through' : 'none',
                      }}
                    >
                      {p.isMe ? `${p.name} (Ty)` : p.name}
                    </Text>
                    {p.status && STATUS_HINT[p.status] ? (
                      <Text style={{ fontSize: 11, color: B.ink3, fontFamily: F.semibold }}>{STATUS_HINT[p.status]}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </View>
          ))}
          {s.absent.length || s.notes || s.openRoles ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: B.line, gap: 4 }}>
              {s.absent.length ? (
                <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>Nieobecni: {s.absent.join(', ')}</Text>
              ) : null}
              {s.notes ? <Text style={{ fontSize: 13, color: B.ink2, fontFamily: F.medium }}>{s.notes}</Text> : null}
              {s.openRoles ? (
                <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>Nieobsadzone role: {s.openRoles}</Text>
              ) : null}
            </View>
          ) : (
            <View style={{ height: 4 }} />
          )}
        </Card>
      ))}

      {/* Służby bez nikogo — lista zamiast akapitu, żeby od razu było widać które. */}
      {empty.length ? (
        <Card padded={false}>
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>
              {assigned.length ? 'Jeszcze bez przypisań' : 'Nikt nie jest jeszcze przypisany'}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 12, color: B.ink3, fontFamily: F.medium }}>Grafik uzupełnia lider służby.</Text>
          </View>
          {empty.map((s) => (
            <View
              key={s.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: B.line }}
            >
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} color={B.ink3} />
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
                {s.label}
              </Text>
              {s.openRoles ? (
                <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
                  {s.openRoles} {plural(s.openRoles, 'rola', 'role', 'ról')}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
};

const FileRow = ({ file, first }: { file: EventFile; first: boolean }) => {
  const image = (file.mime ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/i.test(file.name);
  const Icon = image ? ImageIcon : FileText;
  return (
    <Pressable
      onPress={() => (file.url ? openUrl(file.url) : Alert.alert('Błąd', 'Nie udało się otworzyć pliku.'))}
      className="active:opacity-70"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: B.line,
      }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={B.ink2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
          {file.name}
        </Text>
        {fileSize(file.size) ? <Text style={{ fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{fileSize(file.size)}</Text> : null}
      </View>
      <ChevronRight size={16} color={B.ink4} />
    </Pressable>
  );
};

const btn = {
  base: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 999,
  },
  dark: { backgroundColor: B.ink },
  kurkuma: { backgroundColor: B.kurkuma },
  text: { fontSize: 14, color: B.ink, fontFamily: F.bold, letterSpacing: -0.2 },
};

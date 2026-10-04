import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Baby,
  Calendar,
  CalendarPlus,
  Check,
  Clock,
  ExternalLink,
  Home,
  Image as ImageIcon,
  ListChecks,
  MapPin,
  Music,
  Sparkles,
  Ticket,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import * as ExpoCalendar from 'expo-calendar';
import {
  rawEventId,
  useCancelEvent,
  useEventRegistrations,
  useEventRsvpMeta,
  useSignUpEvent,
  type AgendaEvent,
  type EventRegistration,
  type EventSource,
} from '../api';
import { useAuthSession } from '../../../lib/auth';
import { tenantWebBase } from '../../../lib/supabase';

const SOURCE_META: Record<
  EventSource,
  { label: string; tint: string; bg: string; Icon: typeof Calendar }
> = {
  program: { label: 'Program', tint: '#8A6606', bg: '#FFF1C2', Icon: ListChecks },
  event: { label: 'Wydarzenie', tint: '#2A2312', bg: '#ECE8DE', Icon: Calendar },
  worship: { label: 'Zespół Uwielbienia', tint: '#9d174d', bg: '#FFF1C2', Icon: Music },
  media: { label: 'Media Team', tint: '#2A2312', bg: '#ECE8DE', Icon: ImageIcon },
  atmosfera: { label: 'Atmosfera Team', tint: '#8A6606', bg: '#FFF1C2', Icon: Sparkles },
  kids: { label: 'Dzieci', tint: '#2A2312', bg: '#ECE8DE', Icon: Baby },
  homegroups: { label: 'Grupy Domowe', tint: '#2A2312', bg: '#ECE8DE', Icon: Home },
};

interface Props {
  event: AgendaEvent | null;
  onClose: () => void;
}

export const EventDetailSheet = ({ event, onClose }: Props) => {
  const router = useRouter();
  const { user } = useAuthSession();
  const userEmail = user?.email ?? null;

  // Hooki muszą być wołane bezwarunkowo (reguły hooków) — enabled wyłącza fetch, gdy brak
  // wydarzenia/źródło bez RSVP. Program = brak zapisów; event = ogólne (bogaty RSVP przy
  // registration_required); moduły służb = lekki toggle „Będę".
  const source = event?.source;
  const isGeneric = source === 'event';
  const isMinistry = !!source && source !== 'event' && source !== 'program';
  const supportsRsvp = isGeneric || isMinistry;
  const rid = event ? rawEventId(event.id) : null;

  const regsQuery = useEventRegistrations(supportsRsvp ? rid : null);
  const metaQuery = useEventRsvpMeta(rid, isGeneric);
  const signUp = useSignUpEvent(rid, userEmail);
  const cancel = useCancelEvent(rid, userEmail);
  const [guests, setGuests] = useState(0);

  const visible = event != null;
  if (!event) {
    return (
      <Modal visible={false} transparent>
        <View />
      </Modal>
    );
  }

  const meta = SOURCE_META[event.source];
  const start = event.startsAt instanceof Date ? event.startsAt : new Date(event.startsAt);
  const end =
    event.endsAt instanceof Date
      ? event.endsAt
      : event.endsAt
        ? new Date(event.endsAt)
        : null;
  const hasTime = start.getHours() !== 0 || start.getMinutes() !== 0;

  const dateLabel = format(start, 'EEEE, d MMMM yyyy', { locale: pl });
  const dateLabelCap = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  const timeRange = hasTime
    ? end
      ? `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`
      : format(start, 'HH:mm')
    : 'Cały dzień';

  const goToProgram = () => {
    if (event.source === 'program' && event.programId) {
      onClose();
      setTimeout(() => {
        router.push({
          pathname: '/(app)/programs/[id]',
          params: { id: String(event.programId) },
        });
      }, 220);
    }
  };

  const addToCalendar = async () => {
    try {
      const { status } = await ExpoCalendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Brak dostępu do kalendarza',
          'Zezwól na dostęp do kalendarza w ustawieniach, aby zapisać wydarzenie.',
        );
        return;
      }
      // iOS ma domyślny kalendarz; na Androidzie szukamy pierwszego zapisywalnego.
      let calendarId: string | null = null;
      if (Platform.OS === 'ios') {
        const def = await ExpoCalendar.getDefaultCalendarAsync();
        calendarId = def?.id ?? null;
      } else {
        const cals = await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
        const writable =
          cals.find(
            (c) =>
              c.accessLevel === ExpoCalendar.CalendarAccessLevel.OWNER && c.allowsModifications,
          ) ?? cals.find((c) => c.allowsModifications);
        calendarId = writable?.id ?? null;
      }
      if (!calendarId) {
        Alert.alert('Błąd', 'Nie znaleziono kalendarza, do którego można zapisać wydarzenie.');
        return;
      }
      const endDate = hasTime ? (end ?? new Date(start.getTime() + 60 * 60 * 1000)) : start;
      await ExpoCalendar.createEventAsync(calendarId, {
        title: event.title,
        startDate: start,
        endDate,
        location: event.location ?? undefined,
        notes: event.description ?? undefined,
        allDay: !hasTime,
      });
      Alert.alert('Dodano do kalendarza', 'Wydarzenie zapisano w kalendarzu telefonu.');
    } catch (err) {
      Alert.alert('Błąd', (err as Error)?.message ?? 'Nie udało się zapisać wydarzenia.');
    }
  };

  // ── RSVP / obecność ──
  const regs: EventRegistration[] = regsQuery.data ?? [];
  const going = regs.reduce((s: number, r: EventRegistration) => s + 1 + (r.guests_count || 0), 0);
  const myReg = userEmail
    ? regs.find(
        (r: EventRegistration) => (r.user_email || '').toLowerCase() === userEmail.toLowerCase(),
      ) ?? null
    : null;
  const rsvpMeta = metaQuery.data ?? null;
  const cap = rsvpMeta?.max_participants ?? null;
  const isFull = cap != null ? going >= cap : false;
  const paidWeb = isGeneric && !!rsvpMeta?.is_paid && !!rsvpMeta?.registration_required;
  // Panel: moduły — zawsze; ogólne — gdy registration_required (jak web); płatne → na web.
  const showRsvp =
    !paidWeb &&
    supportsRsvp &&
    rid != null &&
    (isMinistry || (isGeneric && !!rsvpMeta?.registration_required));
  const rsvpBusy = signUp.isPending || cancel.isPending;

  const openPaidWeb = () => {
    const base = tenantWebBase();
    if (!base) {
      Alert.alert('Niedostępne', 'Nie udało się ustalić adresu strony wydarzenia.');
      return;
    }
    Linking.openURL(`${base}/wydarzenie/${rid}`);
  };
  const doSignUp = (g: number) =>
    signUp.mutate(
      { guests: g, fullName: user?.full_name ?? '' },
      { onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać.') },
    );
  const doCancel = () =>
    cancel.mutate(undefined, {
      onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się wypisać.'),
    });
  const toggleMinistry = () => (myReg ? doCancel() : doSignUp(0));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={[styles.iconLg, { backgroundColor: meta.bg }]}>
              <meta.Icon size={22} color={meta.tint} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={[styles.tag, { backgroundColor: meta.bg }]}>
                <Text style={[styles.tagText, { color: meta.tint }]}>
                  {meta.label.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={3}>
                {event.title}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={18} color="#2A2312" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.row}>
              <View style={styles.iconSm}>
                <Calendar size={16} color="#6B6557" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>DATA</Text>
                <Text style={styles.rowValue}>{dateLabelCap}</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.iconSm}>
                <Clock size={16} color="#6B6557" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>GODZINA</Text>
                <Text style={styles.rowValue}>{timeRange}</Text>
              </View>
            </View>

            {event.location ? (
              <View style={styles.row}>
                <View style={styles.iconSm}>
                  <MapPin size={16} color="#6B6557" strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>LOKALIZACJA</Text>
                  <Text style={styles.rowValue}>{event.location}</Text>
                </View>
              </View>
            ) : null}

            {event.description ? (
              <View style={styles.descBlock}>
                <Text style={styles.rowLabel}>OPIS</Text>
                <Text style={styles.descText}>{event.description}</Text>
              </View>
            ) : null}

            {event.isMine ? (
              <View style={styles.mineBanner}>
                <Text style={styles.mineBannerText}>Masz przypisanie w tym programie.</Text>
              </View>
            ) : null}

            {event.source === 'program' && event.programId ? (
              <Pressable onPress={goToProgram} style={styles.primaryBtn}>
                <ExternalLink size={16} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.primaryBtnText}>Otwórz program</Text>
              </Pressable>
            ) : null}

            {paidWeb ? (
              <Pressable onPress={openPaidWeb} style={styles.primaryBtn}>
                <Ticket size={16} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.primaryBtnText}>Zapisy i płatność</Text>
              </Pressable>
            ) : null}

            {showRsvp ? (
              <View style={styles.rsvpBox}>
                <View style={styles.rsvpHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Users size={15} color="#8A6606" />
                    <Text style={styles.rsvpCount}>
                      {isMinistry
                        ? `Potwierdzeni: ${regs.length}`
                        : `Zapisani: ${going}${cap != null ? ` / ${cap}` : ''}`}
                    </Text>
                  </View>
                  {isFull && !myReg ? (
                    <View style={styles.fullBadge}>
                      <Text style={styles.fullBadgeText}>Brak miejsc</Text>
                    </View>
                  ) : null}
                </View>

                {cap != null ? (
                  <View style={styles.capBarBg}>
                    <View
                      style={[
                        styles.capBarFill,
                        {
                          width: `${Math.min(100, Math.round((going / cap) * 100))}%`,
                          backgroundColor: isFull ? '#ef4444' : '#2A2312',
                        },
                      ]}
                    />
                  </View>
                ) : null}

                {regsQuery.isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                    <ActivityIndicator size="small" color="#2A2312" />
                    <Text style={styles.rsvpMuted}>Ładowanie…</Text>
                  </View>
                ) : !userEmail ? (
                  <Text style={styles.rsvpMuted}>Zaloguj się, aby się zapisać.</Text>
                ) : isMinistry ? (
                  <Pressable
                    onPress={toggleMinistry}
                    disabled={rsvpBusy}
                    style={[styles.rsvpToggle, { backgroundColor: myReg ? '#16a34a' : '#ECE8DE' }]}
                  >
                    {rsvpBusy ? (
                      <ActivityIndicator size="small" color={myReg ? '#ffffff' : '#4A463E'} />
                    ) : (
                      <>
                        {myReg ? <Check size={15} color="#ffffff" /> : <Users size={15} color="#4A463E" />}
                        <Text style={[styles.rsvpToggleText, { color: myReg ? '#ffffff' : '#4A463E' }]}>
                          {myReg ? 'Będę' : 'Potwierdź obecność'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : myReg ? (
                  <View style={styles.rsvpSignedRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Check size={16} color="#16a34a" />
                      <Text style={styles.rsvpSignedText}>
                        Jesteś zapisany/a{myReg.guests_count ? ` (+${myReg.guests_count})` : ''}
                      </Text>
                    </View>
                    <Pressable onPress={doCancel} disabled={rsvpBusy} style={styles.rsvpCancelBtn}>
                      {rsvpBusy ? (
                        <ActivityIndicator size="small" color="#dc2626" />
                      ) : (
                        <UserMinus size={15} color="#dc2626" />
                      )}
                      <Text style={styles.rsvpCancelText}>Wypisz się</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.rsvpMuted}>Osoby towarzyszące</Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <Pressable
                          key={n}
                          onPress={() => setGuests(n)}
                          style={[
                            styles.guestChip,
                            {
                              backgroundColor: guests === n ? '#2A2312' : '#ECE8DE',
                              borderColor: guests === n ? '#2A2312' : '#E6E1D5',
                            },
                          ]}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              color: guests === n ? '#ffffff' : '#2A2312',
                              fontFamily: 'Manrope_600SemiBold',
                            }}
                          >
                            {n === 0 ? 'Sam/a' : `+${n}`}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      onPress={() => doSignUp(guests)}
                      disabled={rsvpBusy || isFull}
                      style={[styles.primaryBtn, { marginTop: 0, opacity: isFull ? 0.5 : 1 }]}
                    >
                      {rsvpBusy ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <UserPlus size={16} color="#ffffff" strokeWidth={2.4} />
                      )}
                      <Text style={styles.primaryBtnText}>{isFull ? 'Brak miejsc' : 'Zapisz się'}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null}

            <Pressable onPress={addToCalendar} style={styles.secondaryBtn}>
              <CalendarPlus size={16} color="#8A6606" strokeWidth={2.4} />
              <Text style={styles.secondaryBtnText}>Dodaj do kalendarza</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#F6F4EE',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E3DDD0',
    marginBottom: 12,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconLg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1EEE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 10, letterSpacing: 0.8, fontFamily: 'Manrope_700Bold' },
  title: {
    marginTop: 6,
    fontSize: 19,
    color: '#2A2312',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
    lineHeight: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECE8DE',
  },
  iconSm: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1EEE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#6B6557',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 2,
  },
  rowValue: { fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_500Medium' },
  descBlock: { paddingTop: 12, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#ECE8DE' },
  descText: {
    marginTop: 6,
    fontSize: 14,
    color: '#2A2312',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  mineBanner: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#F3E3B0',
  },
  mineBannerText: { fontSize: 13, color: '#8A6606', fontFamily: 'Manrope_600SemiBold' },
  primaryBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#2A2312',
    shadowColor: '#2A2312',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },
  secondaryBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#F3E3B0',
    backgroundColor: '#F6F4EE',
  },
  secondaryBtnText: {
    fontSize: 14,
    color: '#8A6606',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },
  rsvpBox: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E1D5',
  },
  rsvpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rsvpCount: { fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_700Bold' },
  fullBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#fee2e2',
  },
  fullBadgeText: { fontSize: 11, color: '#dc2626', fontFamily: 'Manrope_700Bold' },
  capBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E3DDD0',
    overflow: 'hidden',
    marginBottom: 12,
  },
  capBarFill: { height: '100%', borderRadius: 3 },
  rsvpMuted: { fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_400Regular' },
  rsvpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rsvpToggleText: { fontSize: 14, fontFamily: 'Manrope_700Bold', letterSpacing: -0.2 },
  rsvpSignedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rsvpSignedText: { fontSize: 14, color: '#15803d', fontFamily: 'Manrope_600SemiBold' },
  rsvpCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  rsvpCancelText: { fontSize: 13, color: '#dc2626', fontFamily: 'Manrope_700Bold' },
  guestChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
});

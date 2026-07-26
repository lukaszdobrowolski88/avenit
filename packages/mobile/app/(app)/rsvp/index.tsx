import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import {
  CalendarCheck,
  Clock,
  Info,
  MapPin,
  Minus,
  Plus,
  Users,
} from 'lucide-react-native';
import { useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { useAuthSession } from '../../../src/lib/auth';
import {
  respondToInvitation,
  useMyInvitations,
  type Invitation,
  type RsvpAnswer,
} from '../../../src/features/rsvp/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  yes: { label: 'Będę', color: '#16a34a', bg: '#dcfce7' },
  maybe: { label: 'Może', color: '#d97706', bg: '#fef3c7' },
  no: { label: 'Nie będę', color: '#e11d48', bg: '#fee2e2' },
  pending: { label: 'Bez odpowiedzi', color: '#78716c', bg: '#f1f5f9' },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  event: 'Wydarzenie',
  home_group: 'Grupa domowa',
  kids: 'Szkółka',
  service: 'Nabożeństwo',
  custom: 'Spotkanie',
};

const ANSWERS: { key: RsvpAnswer; label: string; color: string; bg: string }[] = [
  { key: 'yes', label: 'Będę', color: '#16a34a', bg: '#dcfce7' },
  { key: 'maybe', label: 'Może', color: '#d97706', bg: '#fef3c7' },
  { key: 'no', label: 'Nie będę', color: '#e11d48', bg: '#fee2e2' },
];

const InvitationCard = ({
  invitation,
  onRespond,
}: {
  invitation: Invitation;
  onRespond: (token: string, answer: RsvpAnswer, guests: number) => Promise<void>;
}) => {
  const camp = invitation.campaign;
  const status = String(invitation.status ?? 'pending');
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending;
  const eventTypeLabel = camp?.event_type
    ? EVENT_TYPE_LABELS[camp.event_type] ?? camp.event_type
    : null;

  const [guests, setGuests] = useState<number>(invitation.guests_count ?? 0);
  const [submitting, setSubmitting] = useState<RsvpAnswer | null>(null);

  const handle = async (answer: RsvpAnswer) => {
    if (submitting) return;
    setSubmitting(answer);
    try {
      await onRespond(invitation.token, answer, answer === 'yes' ? guests : 0);
    } catch (e) {
      Alert.alert('Nie udało się zapisać', (e as Error)?.message ?? 'Spróbuj ponownie.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <View
      className="mb-3"
      style={{
        borderRadius: 20,
        backgroundColor: '#ffffff',
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 14,
        elevation: 2,
      }}
    >
      <View
        className="overflow-hidden p-4"
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' }}
      >
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            {eventTypeLabel ? (
              <Text
                className="text-[11px] uppercase mb-1"
                style={{ color: '#78716c', letterSpacing: 0.4, fontFamily: 'Inter_600SemiBold' }}
              >
                {eventTypeLabel}
              </Text>
            ) : null}
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', letterSpacing: -0.3, fontFamily: 'Inter_700Bold' }}
            >
              {camp?.title ?? 'Zaproszenie'}
            </Text>
          </View>
          <View className="px-2.5 py-1" style={{ borderRadius: 999, backgroundColor: statusMeta.bg }}>
            <Text
              className="text-[11px]"
              style={{ color: statusMeta.color, fontFamily: 'Inter_700Bold' }}
            >
              {statusMeta.label}
            </Text>
          </View>
        </View>

        <View className="mt-3 gap-1.5">
          {camp?.event_date ? (
            <View className="flex-row items-center gap-2">
              <CalendarCheck size={14} color="#78716c" />
              <Text
                className="text-[13px]"
                style={{ color: '#44403c', fontFamily: 'Inter_500Medium' }}
              >
                {formatDate(camp.event_date, 'EEEE, d MMM yyyy')}
                {camp.event_time ? ` · ${camp.event_time}` : ''}
              </Text>
            </View>
          ) : camp?.event_time ? (
            <View className="flex-row items-center gap-2">
              <Clock size={14} color="#78716c" />
              <Text
                className="text-[13px]"
                style={{ color: '#44403c', fontFamily: 'Inter_500Medium' }}
              >
                {camp.event_time}
              </Text>
            </View>
          ) : null}
          {camp?.location ? (
            <View className="flex-row items-center gap-2">
              <MapPin size={14} color="#78716c" />
              <Text
                className="text-[13px]"
                style={{ color: '#44403c', fontFamily: 'Inter_500Medium' }}
              >
                {camp.location}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Stepper liczby osób towarzyszących — dla odpowiedzi „Będę". */}
        {status === 'yes' ? (
          <View
            className="mt-3 p-3 flex-row items-center justify-between"
            style={{ borderRadius: 14, backgroundColor: '#f8fafc' }}
          >
            <View className="flex-row items-center gap-2 flex-1">
              <Users size={16} color="#64748b" />
              <Text
                className="text-[13px]"
                style={{ color: '#334155', fontFamily: 'Inter_500Medium' }}
              >
                Osoby towarzyszące
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <Pressable
                onPress={() => setGuests((g) => Math.max(0, g - 1))}
                disabled={guests <= 0 || submitting !== null}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: guests <= 0 ? 0.4 : 1,
                }}
              >
                <Minus size={16} color="#334155" />
              </Pressable>
              <Text
                className="text-[16px]"
                style={{ color: '#0c0a09', minWidth: 20, textAlign: 'center', fontFamily: 'Inter_700Bold' }}
              >
                {guests}
              </Text>
              <Pressable
                onPress={() => setGuests((g) => Math.min(20, g + 1))}
                disabled={submitting !== null}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#ffffff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Plus size={16} color="#334155" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Przyciski odpowiedzi */}
        <View className="mt-3 flex-row gap-2">
          {ANSWERS.map((a) => {
            const active = status === a.key;
            const isBusy = submitting === a.key;
            return (
              <Pressable
                key={a.key}
                onPress={() => handle(a.key)}
                disabled={submitting !== null}
                className="flex-1 active:opacity-70"
                style={{
                  height: 42,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? a.bg : '#f8fafc',
                  borderWidth: 1,
                  borderColor: active ? a.color : '#e7e5e4',
                }}
              >
                {isBusy ? (
                  <ActivityIndicator size="small" color={a.color} />
                ) : (
                  <Text
                    className="text-[13px]"
                    style={{
                      color: active ? a.color : '#57534e',
                      fontFamily: active ? 'Inter_700Bold' : 'Inter_600SemiBold',
                    }}
                  >
                    {status === 'yes' && a.key === 'yes' ? 'Zapisz' : a.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
};

export default function RsvpScreen() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyInvitations(
    user?.email ?? null,
  );

  const summary = data ?? { memberResolved: false, invitations: [] };

  const handleRespond = async (token: string, answer: RsvpAnswer, guests: number) => {
    await respondToInvitation({ token, answer, guests });
    await queryClient.invalidateQueries({ queryKey: ['rsvp', 'mine', user?.email ?? null] });
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Moje zaproszenia"
          subtitle="Potwierdź obecność"
          Icon={CalendarCheck}
          showBack
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#ec4899" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Inter_500Medium' }}
            >
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {summary.invitations.length === 0 ? (
              <View className="items-center justify-center p-8" style={{ borderRadius: 20 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#fce7f3',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <CalendarCheck size={28} color="#ec4899" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak zaproszeń
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  {summary.memberResolved
                    ? 'Nie masz teraz żadnych nadchodzących zaproszeń.'
                    : 'Twoje zaproszenia na wydarzenia pojawią się tutaj.'}
                </Text>
              </View>
            ) : (
              <>
                {!summary.memberResolved ? (
                  <View
                    className="mb-4 p-4 flex-row items-start gap-3"
                    style={{
                      borderRadius: 20,
                      backgroundColor: '#fffbeb',
                      borderWidth: 1,
                      borderColor: '#fde68a',
                    }}
                  >
                    <Info size={18} color="#d97706" style={{ marginTop: 1 }} />
                    <Text
                      className="flex-1 text-[13px]"
                      style={{ color: '#92400e', fontFamily: 'Inter_400Regular', lineHeight: 19 }}
                    >
                      Poniższe zaproszenia dopasowaliśmy po Twoim adresie e-mail. Aby zawsze widzieć
                      wszystkie, poproś koordynatora o powiązanie konta z profilem członka.
                    </Text>
                  </View>
                ) : null}
                <Text
                  className="text-[11px] uppercase mb-2 mx-1"
                  style={{ color: '#78716c', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' }}
                >
                  Nadchodzące
                </Text>
                {summary.invitations.map((inv) => (
                  <InvitationCard key={inv.id} invitation={inv} onRespond={handleRespond} />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}

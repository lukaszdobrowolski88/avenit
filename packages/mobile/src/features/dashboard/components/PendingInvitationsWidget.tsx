import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDate } from '../../../lib/domain';
import { useRespondToAssignment } from '../respond';
import { WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import type { PendingInvitation } from '../api';

// Nazwy służb jak moduły w menu (bez angielskiego „Worship”).
const TEAM_LABELS: Record<string, string> = {
  worship: 'Uwielbienie',
  media: 'MediaTeam',
  atmosfera: 'Atmosfera Team',
  kids: 'Dzieci',
  mlodziezowka: 'Młodzieżówka',
  scena: 'Scena',
  produkcja: 'Produkcja',
};

const InvitationCard = ({ inv, answer }: { inv: PendingInvitation; answer: ReturnType<typeof useRespondToAssignment> }) => {
  const router = useRouter();
  const teamLabel = TEAM_LABELS[inv.teamType] || inv.teamType;
  const title = inv.programTitle || inv.typeName || 'Nabożeństwo';
  const busy = answer.pendingId === inv.id;

  const open = () => {
    if (inv.eventId) router.push({ pathname: '/(app)/events/[id]', params: { id: String(inv.eventId) } });
    else if (inv.programId != null) router.push({ pathname: '/(app)/programs/[id]', params: { id: String(inv.programId) } });
  };

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 10, borderRadius: 24, backgroundColor: D.card, padding: 16 }}>
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${title}, ${formatDate(inv.date, 'EEEE, d MMMM')}`} className="active:opacity-70">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: inv.typeColor || D.accent }} />
          <Text style={{ fontSize: 12, color: D.ink2, fontFamily: F.medium }}>{formatDate(inv.date, 'EEEE, d MMM')}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: 18, color: D.ink, marginTop: 4, letterSpacing: -0.5, fontFamily: F.bold }}>
          {title}
        </Text>
        <Text style={{ fontSize: 13, color: D.ink2, marginTop: 4, fontFamily: F.medium }}>
          {[teamLabel, inv.roleKey, inv.assignedByName ? `zaprasza ${inv.assignedByName}` : null].filter(Boolean).join(' · ')}
        </Text>
      </Pressable>

      {busy ? (
        <View style={{ height: 46, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={D.ink} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable
            onPress={() => answer.reject(inv.id, title)}
            disabled={!!answer.pendingId}
            accessibilityRole="button"
            accessibilityLabel={`Odrzucam: ${title}`}
            className="active:opacity-70"
            style={{ flex: 1, height: 46, borderRadius: 23, backgroundColor: D.well, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.semibold }}>Odrzucam</Text>
          </Pressable>
          <Pressable
            onPress={() => answer.accept(inv.id)}
            disabled={!!answer.pendingId}
            accessibilityRole="button"
            accessibilityLabel={`Akceptuję: ${title}`}
            className="active:opacity-80"
            style={{ flex: 1, height: 46, borderRadius: 23, backgroundColor: D.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.bold }}>Akceptuję</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

// Zaproszenia do służby czekające na odpowiedź — odpowiedź przez serwer
// (/api/assignment/:id/respond), odmowa z potwierdzeniem i skutkiem (jak web).
export const PendingInvitationsWidget = ({ invitations }: { invitations: PendingInvitation[] }) => {
  const answer = useRespondToAssignment();
  if (invitations.length === 0) return null;
  return (
    <WidgetCard title="Zaproszenia do służby" count={invitations.length} bare>
      {invitations.map((inv) => (
        <InvitationCard key={inv.id} inv={inv} answer={answer} />
      ))}
    </WidgetCard>
  );
};

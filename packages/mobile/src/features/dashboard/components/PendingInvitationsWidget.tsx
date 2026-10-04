import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { formatDate } from '../../../lib/domain';
import { useUpdateAssignmentStatus } from '../../programs/api';
import { WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import type { PendingInvitation } from '../api';

const TEAM_LABELS: Record<string, string> = {
  worship: 'Worship',
  media: 'Media',
  atmosfera: 'Atmosfera',
  kids: 'Dzieci',
  scena: 'Scena',
  produkcja: 'Produkcja',
};

const InvitationCard = ({ inv }: { inv: PendingInvitation }) => {
  const update = useUpdateAssignmentStatus();
  const teamLabel = TEAM_LABELS[inv.teamType] || inv.teamType;

  const handleAccept = () => {
    update.mutate({ id: inv.id, status: 'accepted' });
  };

  const handleReject = () => {
    Alert.alert(
      'Odrzucić zaproszenie?',
      'Po odrzuceniu organizator dostanie powiadomienie i będzie musiał znaleźć kogoś innego.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Odrzuć',
          style: 'destructive',
          onPress: () => update.mutate({ id: inv.id, status: 'rejected' }),
        },
      ],
    );
  };

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 10, borderRadius: 24, backgroundColor: D.card, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: inv.typeColor || D.accent }} />
        <Text style={{ fontSize: 12, color: D.ink2, fontFamily: F.medium }}>{formatDate(inv.date, 'EEEE, d MMM')}</Text>
      </View>
      <Link
        href={
          inv.programId != null
            ? { pathname: '/(app)/programs/[id]', params: { id: String(inv.programId) } }
            : '/(app)/calendar'
        }
        asChild
      >
        <Pressable>
          <Text
            numberOfLines={2}
            style={{ fontSize: 18, color: D.ink, marginTop: 4, letterSpacing: -0.5, fontFamily: F.bold }}
          >
            {inv.programTitle || inv.typeName || 'Nabożeństwo'}
          </Text>
        </Pressable>
      </Link>
      <Text style={{ fontSize: 13, color: D.ink2, marginTop: 4, fontFamily: F.medium }}>
        {[teamLabel, inv.roleKey, inv.assignedByName ? `od ${inv.assignedByName}` : null].filter(Boolean).join(' · ')}
      </Text>

      {update.isPending ? (
        <View style={{ height: 46, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={D.ink} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Pressable
            onPress={handleReject}
            className="active:opacity-70"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 23,
              backgroundColor: D.well,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.semibold }}>Odrzucam</Text>
          </Pressable>
          <Pressable
            onPress={handleAccept}
            className="active:opacity-80"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 23,
              backgroundColor: D.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.bold }}>Akceptuję</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export const PendingInvitationsWidget = ({ invitations }: { invitations: PendingInvitation[] }) => {
  if (invitations.length === 0) return null;
  return (
    <WidgetCard title="Zaproszenia do służby" count={invitations.length} bare>
      {invitations.map((inv) => (
        <InvitationCard key={inv.id} inv={inv} />
      ))}
    </WidgetCard>
  );
};

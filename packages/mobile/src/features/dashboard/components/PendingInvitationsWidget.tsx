import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Bell, Check, Clock, X } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { GradientIcon } from '../../../components/ui/GradientIcon';
import { useUpdateAssignmentStatus } from '../../programs/api';
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
  const accent = inv.typeColor || '#ec4899';
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
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#eef0f3',
        backgroundColor: '#ffffff',
        padding: 12,
        marginBottom: 8,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: 10 }}
      >
        <View style={{ width: 4, borderRadius: 2, backgroundColor: accent }} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              color: '#78716c',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {formatDate(inv.date, 'EEEE, d MMM')}
          </Text>
          <Link
            href={{ pathname: '/(app)/programs/[id]', params: { id: String(inv.programId) } }}
            asChild
          >
            <Pressable>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 15,
                  color: '#0c0a09',
                  marginTop: 2,
                  letterSpacing: -0.3,
                  fontFamily: 'Inter_700Bold',
                }}
              >
                {inv.programTitle || inv.typeName || 'Nabożeństwo'}
              </Text>
            </Pressable>
          </Link>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}
          >
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: '#f5f5f4',
              }}
            >
              <Text style={{ fontSize: 11, color: '#1c1917', fontFamily: 'Inter_600SemiBold' }}>
                {teamLabel}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_500Medium' }}>
              {inv.roleKey}
            </Text>
          </View>
          {inv.assignedByName ? (
            <Text
              style={{
                fontSize: 11,
                color: '#78716c',
                marginTop: 4,
                fontFamily: 'Inter_400Regular',
              }}
            >
              Od: {inv.assignedByName}
            </Text>
          ) : null}
        </View>
      </View>

      {update.isPending ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 8 }}>
          <ActivityIndicator color="#ec4899" />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
          <Pressable
            onPress={handleReject}
            className="active:opacity-70"
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#f5f5f4',
            }}
          >
            <X size={14} color="#be123c" />
            <Text style={{ fontSize: 13, color: '#be123c', fontFamily: 'Inter_700Bold' }}>
              Odrzucam
            </Text>
          </Pressable>
          <Pressable
            onPress={handleAccept}
            className="active:opacity-80"
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: '#10b981',
            }}
          >
            <Check size={14} color="white" />
            <Text style={{ fontSize: 13, color: '#ffffff', fontFamily: 'Inter_700Bold' }}>
              Akceptuję
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

export const PendingInvitationsWidget = ({
  invitations,
}: {
  invitations: PendingInvitation[];
}) => {
  if (invitations.length === 0) return null;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 12,
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
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: '#eef0f3',
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          <GradientIcon Icon={Bell} size={36} iconSize={18} from="#f97316" to="#ec4899" />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                color: '#0c0a09',
                letterSpacing: -0.3,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              Zaproszenia do służby
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#78716c',
                marginTop: 1,
                fontFamily: 'Inter_400Regular',
              }}
            >
              Wymagają Twojej odpowiedzi
            </Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: '#fef3c7',
            }}
          >
            <Clock size={10} color="#b45309" strokeWidth={2.6} />
            <Text style={{ fontSize: 11, color: '#92400e', fontFamily: 'Inter_700Bold' }}>
              {invitations.length}
            </Text>
          </View>
        </View>

        <View style={{ padding: 12, paddingTop: 0 }}>
          {invitations.map((inv) => (
            <InvitationCard key={inv.id} inv={inv} />
          ))}
        </View>
      </View>
    </View>
  );
};

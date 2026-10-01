import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Crown, Phone } from 'lucide-react-native';
import type { RosterMember } from '../api';

// Wiersz składu zespołu. Tap-to-call: dotknięcie telefonu otwiera dialer (tel:).
// Telefon widoczny tylko gdy serwer go zwrócił (należę do służby / jestem liderem).
export const RosterRow = ({ member, tint }: { member: RosterMember; tint: string }) => {
  const initial = member.name.charAt(0).toUpperCase();

  const call = () => {
    if (!member.phone) return;
    const tel = member.phone.replace(/\s+/g, '');
    Linking.openURL(`tel:${tel}`).catch(() =>
      Alert.alert('Nie udało się zadzwonić', member.phone ?? ''),
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: member.is_me ? '#fbcfe8' : '#eef0f3',
        backgroundColor: member.is_me ? '#fdf2f8' : '#ffffff',
      }}
    >
      {member.avatar_url ? (
        <Image
          source={{ uri: member.avatar_url }}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#f5f5f4' }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: '#f5f5f4',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 16, color: '#78716c', fontFamily: 'Inter_700Bold' }}>{initial}</Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>
            {member.name}
            {member.is_me ? ' (Ty)' : ''}
          </Text>
          {member.is_leader ? <Crown size={13} color="#d97706" /> : null}
        </View>
        <Text style={{ fontSize: 12, color: '#78716c', marginTop: 1, fontFamily: 'Inter_500Medium' }}>
          {member.is_leader ? 'Lider' : 'Członek zespołu'}
          {member.phone ? ` · ${member.phone}` : ''}
        </Text>
      </View>

      {member.phone ? (
        <Pressable
          onPress={call}
          hitSlop={8}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: tint + '1a',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Phone size={17} color={tint} />
        </Pressable>
      ) : null}
    </View>
  );
};

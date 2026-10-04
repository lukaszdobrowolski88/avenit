import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthSession } from '../../../lib/auth';
import { findOrCreateDirect } from '../../messenger/start';
import { D, F } from '../theme';
import { WidgetCard } from './WidgetCard';
import type { OnlineUser } from '../api';
import { goToTab } from '../../../lib/navigation';

interface Props {
  users: OnlineUser[];
  offlineCount: number;
}

const initialsFor = (u: OnlineUser): string => {
  const first = u.firstName?.charAt(0).toUpperCase() ?? '';
  const last = u.lastName?.charAt(0).toUpperCase() ?? '';
  if (first || last) return first + last;
  return u.email.charAt(0).toUpperCase();
};

const displayName = (u: OnlineUser): string => {
  const parts = [u.firstName, u.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  return u.email.split('@')[0];
};

const UserAvatar = ({ user, onPress }: { user: OnlineUser; onPress: () => void }) => {
  const isOnline = user.status === 'online';
  const content = (
    <View style={{ alignItems: 'center', width: 64 }}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: D.well,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 14, color: D.ink, fontFamily: F.bold }}>
            {initialsFor(user)}
          </Text>
        </View>
        <View
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: '#ffffff',
            backgroundColor: isOnline ? '#10b981' : '#FFBE0B',
          }}
        />
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          color: D.ink2,
          marginTop: 6,
          textAlign: 'center',
          fontFamily: F.medium,
        }}
      >
        {displayName(user)}
      </Text>
    </View>
  );
  // Jak na webie: stuknięcie osoby otwiera (lub zakłada) rozmowę 1:1.
  return (
    <Pressable onPress={onPress} className="active:opacity-70" accessibilityLabel={`Napisz do: ${displayName(user)}`}>
      {content}
    </Pressable>
  );
};

export const OnlineUsersWidget = ({ users, offlineCount }: Props) => {
  const router = useRouter();
  const { user: me } = useAuthSession();
  const startChat = async (email: string) => {
    if (!me?.email) return;
    try {
      const id = await findOrCreateDirect(me.email, email);
      router.push({ pathname: '/(app)/messenger/[conversationId]', params: { conversationId: id } });
    } catch (e: any) {
      Alert.alert('Nie udało się otworzyć rozmowy', e?.message ?? 'Spróbuj ponownie.');
    }
  };
  const onlineCount = users.filter((u) => u.status === 'online').length;
  if (users.length === 0) return null;

  return (
    <WidgetCard
      title="Kto jest online"
      count={onlineCount}
      actionLabel="Czat"
      onAction={() => goToTab(router, 'messenger')}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 16, gap: 4 }}
      >
        {users.map((u) => (
          <UserAvatar key={u.email} user={u} onPress={() => startChat(u.email)} />
        ))}
      </ScrollView>

      {offlineCount > 0 ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: D.hair,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: D.ink2,
              textAlign: 'center',
              fontFamily: F.medium,
            }}
          >
            + {offlineCount} offline
          </Text>
        </View>
      ) : null}

    </WidgetCard>
  );
};

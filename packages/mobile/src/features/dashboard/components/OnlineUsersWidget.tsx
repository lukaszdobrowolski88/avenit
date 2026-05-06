import { Pressable, ScrollView, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { MessageCircle, Users, UserX } from 'lucide-react-native';
import { WidgetCard } from './WidgetCard';
import type { OnlineUser } from '../api';

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

const UserAvatar = ({ user }: { user: OnlineUser }) => {
  const isOnline = user.status === 'online';
  const content = (
    <View style={{ alignItems: 'center', width: 64 }}>
      <View style={{ position: 'relative' }}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: '#fef3f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 13, color: '#be185d', fontFamily: 'Inter_700Bold' }}>
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
            backgroundColor: isOnline ? '#10b981' : '#f59e0b',
          }}
        />
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          color: '#57534e',
          marginTop: 6,
          textAlign: 'center',
          fontFamily: 'Inter_500Medium',
        }}
      >
        {displayName(user)}
      </Text>
    </View>
  );
  if (user.memberId) {
    return (
      <Link
        href={{ pathname: '/(app)/members/[id]', params: { id: String(user.memberId) } }}
        asChild
      >
        <Pressable className="active:opacity-70">{content}</Pressable>
      </Link>
    );
  }
  return content;
};

export const OnlineUsersWidget = ({ users, offlineCount }: Props) => {
  const onlineCount = users.filter((u) => u.status === 'online').length;
  const hasUsers = users.length > 0;

  return (
    <WidgetCard title="Kto jest online" Icon={Users}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 4,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
        <Text style={{ fontSize: 13, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>
          {onlineCount} online
        </Text>
      </View>

      {hasUsers ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}
        >
          {users.map((u) => (
            <UserAvatar key={u.email} user={u} />
          ))}
        </ScrollView>
      ) : (
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: '#f5f5f4',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <UserX size={20} color="#a8a29e" />
          </View>
          <Text style={{ fontSize: 13, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
            Brak aktywnych użytkowników
          </Text>
        </View>
      )}

      {offlineCount > 0 ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderTopWidth: 1,
            borderTopColor: '#f5f5f4',
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: '#78716c',
              textAlign: 'center',
              fontFamily: 'Inter_500Medium',
            }}
          >
            + {offlineCount} offline
          </Text>
        </View>
      ) : null}

      <Link href="/(app)/messenger" asChild>
        <Pressable
          className="active:opacity-70"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: '#f5f5f4',
          }}
        >
          <MessageCircle size={14} color="#ec4899" />
          <Text style={{ fontSize: 13, color: '#be185d', fontFamily: 'Inter_600SemiBold' }}>
            Otwórz komunikator
          </Text>
        </Pressable>
      </Link>
    </WidgetCard>
  );
};

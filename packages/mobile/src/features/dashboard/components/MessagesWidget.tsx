import { Pressable, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { Hash, Inbox, MessageCircle } from 'lucide-react-native';
import { formatRelative } from '../../../lib/domain';
import { WidgetCard } from './WidgetCard';
import type { UnreadConversation } from '../api';

interface Props {
  conversations: UnreadConversation[];
  totalUnread: number;
}

export const MessagesWidget = ({ conversations, totalUnread }: Props) => {
  return (
    <WidgetCard
      title="Nieprzeczytane"
      Icon={MessageCircle}
      badge={totalUnread > 0 ? String(totalUnread) : undefined}
    >
      {conversations.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 32, alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: '#ecfdf5',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
            }}
          >
            <Inbox size={24} color="#047857" />
          </View>
          <Text style={{ fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>
            Wszystko przeczytane!
          </Text>
          <Text
            style={{ fontSize: 12, color: '#78716c', marginTop: 4, fontFamily: 'Inter_400Regular' }}
          >
            Nie masz nowych wiadomości
          </Text>
          <Link href="/(app)/messenger" asChild>
            <Pressable
              className="active:opacity-70"
              style={{
                marginTop: 12,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: '#fafaf9',
                borderWidth: 1,
                borderColor: '#eef0f3',
              }}
            >
              <Text style={{ fontSize: 13, color: '#be185d', fontFamily: 'Inter_600SemiBold' }}>
                Otwórz komunikator →
              </Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        conversations.slice(0, 4).map((c, idx, arr) => {
          const Icon = c.type === 'ministry' ? Hash : MessageCircle;
          const title =
            c.name || (c.type === 'ministry' ? c.ministry_key ?? 'Kanał' : 'Rozmowa');
          return (
            <Link
              key={c.id}
              href={{
                pathname: '/(app)/messenger/[conversationId]',
                params: { conversationId: c.id },
              }}
              asChild
            >
              <Pressable
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                  borderBottomColor: '#f5f5f4',
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#dbeafe',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={16} color="#1d4ed8" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: '#0c0a09',
                        letterSpacing: -0.2,
                        fontFamily: 'Inter_700Bold',
                      }}
                    >
                      {title}
                    </Text>
                    {c.last_message_at ? (
                      <Text
                        style={{ fontSize: 10, color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
                      >
                        {formatRelative(c.last_message_at)}
                      </Text>
                    ) : null}
                  </View>
                  {c.last_message ? (
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 12,
                        color: '#78716c',
                        marginTop: 2,
                        fontFamily: 'Inter_400Regular',
                      }}
                    >
                      {c.last_message}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    minWidth: 22,
                    height: 22,
                    paddingHorizontal: 6,
                    borderRadius: 11,
                    backgroundColor: '#ec4899',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: '#ffffff', fontFamily: 'Inter_700Bold' }}
                  >
                    {c.unread_count > 99 ? '99+' : c.unread_count}
                  </Text>
                </View>
              </Pressable>
            </Link>
          );
        })
      )}
    </WidgetCard>
  );
};

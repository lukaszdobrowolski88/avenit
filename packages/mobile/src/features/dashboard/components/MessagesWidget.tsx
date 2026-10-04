import { Pressable, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Hash, MessageCircle } from 'lucide-react-native';
import { D, F } from '../theme';
import { formatRelative } from '../../../lib/domain';
import { EmptyRow, WidgetCard } from './WidgetCard';
import type { UnreadConversation } from '../api';
import { goToTab } from '../../../lib/navigation';

interface Props {
  conversations: UnreadConversation[];
  totalUnread: number;
}

export const MessagesWidget = ({ conversations, totalUnread }: Props) => {
  const router = useRouter();
  return (
    <WidgetCard
      title="Wiadomości"
      count={totalUnread}
      actionLabel="Czat"
      onAction={() => goToTab(router, 'messenger')}
    >
      {conversations.length === 0 ? (
        <EmptyRow text="Wszystko przeczytane" actionLabel="Otwórz czat" onAction={() => goToTab(router, 'messenger')} />
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
                  paddingBottom: idx < arr.length - 1 ? 8 : 14,
                  paddingTop: idx === 0 ? 14 : 8,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    backgroundColor: D.well,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={18} color={D.ink} strokeWidth={1.9} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        flex: 1,
                        fontSize: 14,
                        color: D.ink,
                        letterSpacing: -0.2,
                        fontFamily: F.bold,
                      }}
                    >
                      {title}
                    </Text>
                    {c.last_message_at ? (
                      <Text
                        style={{ fontSize: 10, color: D.ink3, fontFamily: F.medium }}
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
                        color: D.ink2,
                        marginTop: 2,
                        fontFamily: F.regular,
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
                    backgroundColor: D.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: D.ink, fontFamily: F.bold }}
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

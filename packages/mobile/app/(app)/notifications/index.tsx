import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  Calendar,
  CheckCheck,
  CheckSquare,
  Info,
  MessageCircle,
  AtSign,
} from 'lucide-react-native';
import { formatRelative } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import {
  useNotifications,
  useMarkAllRead,
  useMarkRead,
  TYPE_META,
  type NotificationType,
} from '../../../src/features/notifications/api';
import { useAuthSession } from '../../../src/lib/auth';
import { navigateFromDeepLink } from '../../../src/lib/deep-links';

const ICONS: Record<NotificationType, typeof Bell> = {
  message: MessageCircle,
  mention: AtSign,
  task: CheckSquare,
  event: Calendar,
  system: Info,
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const { data, isLoading, isError, error, refetch, isRefetching } = useNotifications(
    user?.email ?? null,
  );
  const markAll = useMarkAllRead(user?.email ?? null);
  const markOne = useMarkRead();

  const unreadCount = (data ?? []).filter((n) => !n.read).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Powiadomienia"
          subtitle={unreadCount > 0 ? `${unreadCount} nieprzeczytanych` : 'Wszystko odczytane'}
          showBack
          right={
            unreadCount > 0 ? (
              <Pressable
                onPress={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="flex-row items-center gap-1 active:opacity-80"
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: '#0c0a09',
                }}
              >
                <CheckCheck size={14} color="white" />
                <Text
                  className="text-[12px]"
                  style={{ color: '#ffffff', fontFamily: 'Inter_700Bold' }}
                >
                  Odczytane
                </Text>
              </Pressable>
            ) : null
          }
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
          <FlatList
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 }}
            data={data ?? []}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#fef3f2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Bell size={28} color="#ec4899" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Brak powiadomień
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                >
                  Powiadomienia o wiadomościach, zadaniach i wydarzeniach pojawią się tutaj.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const meta = TYPE_META[item.type];
              const Icon = ICONS[item.type] ?? Bell;
              return (
                <Pressable
                  onPress={() => {
                    if (!item.read) markOne.mutate(item.id);
                    if (item.link) navigateFromDeepLink(router, item.link);
                  }}
                  className="flex-row items-start gap-3 p-3.5 active:opacity-80"
                  style={{
                    borderRadius: 16,
                    backgroundColor: item.read ? '#ffffff' : '#fffbeb',
                    borderWidth: 1,
                    borderColor: item.read ? '#eef0f3' : '#fde68a',
                    shadowColor: '#0f172a',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: item.read ? 0.04 : 0.06,
                    shadowRadius: 10,
                    elevation: 1,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: meta.bg,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={16} color={meta.tint} strokeWidth={2.2} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="flex-1 text-[14px]"
                        style={{
                          color: '#0c0a09',
                          letterSpacing: -0.2,
                          fontFamily: item.read ? 'Inter_500Medium' : 'Inter_700Bold',
                        }}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        className="text-[10px]"
                        style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
                      >
                        {formatRelative(item.created_at)}
                      </Text>
                    </View>
                    {item.body ? (
                      <Text
                        className="text-[12px] mt-0.5"
                        style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
                        numberOfLines={2}
                      >
                        {item.body}
                      </Text>
                    ) : null}
                  </View>
                  {!item.read ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: '#ec4899',
                        marginTop: 6,
                      }}
                    />
                  ) : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

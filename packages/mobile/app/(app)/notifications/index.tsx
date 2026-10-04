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
  type NotificationRow,
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

  const unreadCount = (data ?? []).filter((n: NotificationRow) => !n.read).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
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
                  backgroundColor: '#2A2312',
                }}
              >
                <CheckCheck size={14} color="white" />
                <Text
                  className="text-[12px]"
                  style={{ color: '#ffffff', fontFamily: 'Manrope_700Bold' }}
                >
                  Odczytane
                </Text>
              </Pressable>
            ) : null
          }
        />

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#e11d48', fontFamily: 'Manrope_500Medium' }}
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            ListEmptyComponent={
              <View className="items-center mt-12 px-6">
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#FFF8E1',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Bell size={28} color="#8A6606" />
                </View>
                <Text
                  className="text-[16px]"
                  style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Brak powiadomień
                </Text>
                <Text
                  className="text-[13px] text-center mt-1"
                  style={{ color: '#7A7466', fontFamily: 'Manrope_400Regular' }}
                >
                  Powiadomienia o wiadomościach, zadaniach i wydarzeniach pojawią się tutaj.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              // Serwer może przysłać typ spoza znanych enumów — fallback na 'system',
              // inaczej meta === undefined i meta.bg wywala całą listę.
              const meta = TYPE_META[item.type as NotificationType] ?? TYPE_META.system;
              const Icon = ICONS[item.type as NotificationType] ?? Bell;
              return (
                <Pressable
                  onPress={() => {
                    if (!item.read) markOne.mutate(item.id);
                    if (item.link) navigateFromDeepLink(router, item.link);
                  }}
                  className="flex-row items-start gap-3 p-3.5 active:opacity-80"
                  style={{
                    borderRadius: 16,
                    backgroundColor: item.read ? '#F6F4EE' : '#fffbeb',
                    borderWidth: 1,
                    borderColor: item.read ? '#E6E1D5' : '#fde68a',
                    shadowColor: '#2A2312',
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
                          color: '#2A2312',
                          letterSpacing: -0.2,
                          fontFamily: item.read ? 'Manrope_500Medium' : 'Manrope_700Bold',
                        }}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        className="text-[10px]"
                        style={{ color: '#A8A59E', fontFamily: 'Manrope_500Medium' }}
                      >
                        {formatRelative(item.created_at)}
                      </Text>
                    </View>
                    {item.body ? (
                      <Text
                        className="text-[12px] mt-0.5"
                        style={{ color: '#7A7466', fontFamily: 'Manrope_400Regular' }}
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
                        backgroundColor: '#2A2312',
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

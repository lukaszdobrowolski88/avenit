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
import { B, Monogram } from '../../../src/components/ui/brand';
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
            ItemSeparatorComponent={() => (
              <View style={{ backgroundColor: B.card }}>
                <View style={{ height: 1, marginLeft: 76, backgroundColor: B.line }} />
              </View>
            )}
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
                  style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
                >
                  Powiadomienia o wiadomościach, zadaniach i wydarzeniach pojawią się tutaj.
                </Text>
              </View>
            }
            renderItem={({ item, index }) => {
              // Serwer może przysłać typ spoza znanych enumów — fallback na 'system'.
              const Icon = ICONS[item.type as NotificationType] ?? Bell;
              const total = (data ?? []).length;
              const first = index === 0;
              const last = index === total - 1;
              return (
                <Pressable
                  onPress={() => {
                    if (!item.read) markOne.mutate(item.id);
                    if (item.link) navigateFromDeepLink(router, item.link);
                  }}
                  className="active:opacity-80"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    // Nieprzeczytane — jasna kurkuma w białej grupie.
                    backgroundColor: item.read ? B.card : '#FFF8E1',
                    borderTopLeftRadius: first ? 22 : 0,
                    borderTopRightRadius: first ? 22 : 0,
                    borderBottomLeftRadius: last ? 22 : 0,
                    borderBottomRightRadius: last ? 22 : 0,
                  }}
                >
                  <View>
                    <Monogram name={item.title || 'Avenit'} size={46} />
                    <View
                      style={{
                        position: 'absolute',
                        right: -3,
                        bottom: -3,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: item.read ? B.card : '#FFF8E1',
                        backgroundColor: B.kurkuma,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={11} color={B.ink} strokeWidth={2.4} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, fontSize: 15, color: B.ink, letterSpacing: -0.2, fontFamily: item.read ? 'Manrope_600SemiBold' : 'Manrope_700Bold' }}
                      >
                        {item.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>{formatRelative(item.created_at)}</Text>
                      {!item.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.kurkuma }} /> : null}
                    </View>
                    {item.body ? (
                      <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: B.ink3, marginTop: 2, fontFamily: 'Manrope_500Medium' }}>
                        {item.body}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </>
  );
}

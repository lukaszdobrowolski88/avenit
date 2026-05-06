import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Heart, Plus, Sparkles } from 'lucide-react-native';
import { formatRelative } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import {
  usePrayerRequests,
  useTogglePrayer,
  CATEGORY_META,
  type PrayerRequest,
  type PrayerStatus,
} from '../../../src/features/prayers/api';
import { useAuthSession } from '../../../src/lib/auth';

const Filter = ({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-80"
    style={{
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: active ? '#0c0a09' : '#fafaf9',
      borderWidth: 1,
      borderColor: active ? '#0c0a09' : '#eef0f3',
    }}
  >
    <Text
      className="text-[13px]"
      style={{ color: active ? '#ffffff' : '#1c1917', fontFamily: 'Inter_600SemiBold' }}
    >
      {label}
    </Text>
  </Pressable>
);

const PrayerCard = ({
  prayer,
  userEmail,
}: {
  prayer: PrayerRequest;
  userEmail: string | null;
}) => {
  const meta = CATEGORY_META[prayer.category];
  const toggle = useTogglePrayer(userEmail);
  const iAmPraying = !!userEmail && prayer.praying_users?.includes(userEmail);
  const displayName = prayer.is_anonymous
    ? 'Anonimowo'
    : prayer.requester_name || prayer.user_name || prayer.user_email;

  return (
    <View
      className="mb-3"
      style={{
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
        className="overflow-hidden p-4"
        style={{ borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          <View className="px-2 py-0.5" style={{ borderRadius: 999, backgroundColor: meta.bg }}>
            <Text
              className="text-[11px]"
              style={{ color: meta.tint, fontFamily: 'Inter_700Bold' }}
            >
              {meta.emoji} {meta.label}
            </Text>
          </View>
          <Text
            className="text-[11px]"
            style={{ color: '#a8a29e', fontFamily: 'Inter_500Medium' }}
          >
            {formatRelative(prayer.created_at)}
          </Text>
          {prayer.status === 'answered' && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5"
              style={{ borderRadius: 999, backgroundColor: '#d1fae5' }}
            >
              <Sparkles size={10} color="#059669" />
              <Text
                className="text-[10px]"
                style={{ color: '#047857', fontFamily: 'Inter_700Bold' }}
              >
                Wysłuchana
              </Text>
            </View>
          )}
        </View>

        <Text
          className="text-[15px] mb-2"
          style={{ color: '#0c0a09', lineHeight: 22, fontFamily: 'Inter_400Regular' }}
        >
          {prayer.content}
        </Text>

        {prayer.answered_testimony ? (
          <View
            className="p-3 mb-2"
            style={{
              borderRadius: 12,
              backgroundColor: '#ecfdf5',
              borderLeftWidth: 3,
              borderLeftColor: '#10b981',
            }}
          >
            <Text
              className="text-[11px] mb-1"
              style={{ color: '#047857', fontFamily: 'Inter_700Bold' }}
            >
              Świadectwo:
            </Text>
            <Text
              className="text-[13px]"
              style={{ color: '#064e3b', fontFamily: 'Inter_400Regular' }}
            >
              {prayer.answered_testimony}
            </Text>
          </View>
        ) : null}

        <Text
          className="text-[12px] mb-3"
          style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
        >
          {displayName}
        </Text>

        <View className="flex-row items-center justify-between">
          <Text
            className="text-[12px]"
            style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
          >
            {prayer.prayer_count > 0
              ? `${prayer.prayer_count} ${prayer.prayer_count === 1 ? 'osoba modli się' : 'osób modli się'}`
              : 'Bądź pierwszą osobą modlącą się'}
          </Text>
          <Pressable
            onPress={() =>
              toggle.mutate({ requestId: prayer.id, currentlyPraying: !!iAmPraying })
            }
            disabled={toggle.isPending || !userEmail || prayer.status !== 'active'}
            className="flex-row items-center gap-1.5 active:opacity-80"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: iAmPraying ? '#ec4899' : '#fef3f2',
              borderWidth: 1,
              borderColor: iAmPraying ? '#ec4899' : '#fbcfe8',
            }}
          >
            <Heart
              size={13}
              color={iAmPraying ? 'white' : '#ec4899'}
              fill={iAmPraying ? 'white' : 'none'}
            />
            <Text
              className="text-[12px]"
              style={{
                color: iAmPraying ? '#ffffff' : '#be185d',
                fontFamily: 'Inter_700Bold',
              }}
            >
              {iAmPraying ? 'Modlę się' : 'Modlę się też'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default function PrayersScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const [filter, setFilter] = useState<PrayerStatus | 'all'>('active');
  const { data, isLoading, isError, error, refetch, isRefetching } = usePrayerRequests(filter);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Modlitwy"
          subtitle="Intencje społeczności"
          showBack
          right={
            <Pressable
              onPress={() => router.push('/(app)/prayers/new')}
              className="active:opacity-80"
            >
              <GradientIcon
                Icon={Plus}
                size={40}
                iconSize={20}
                from="#f97316"
                to="#ec4899"
                rounded
              />
            </Pressable>
          }
        />

        <View className="flex-row gap-2 px-4 pb-3">
          <Filter
            label="Aktywne"
            active={filter === 'active'}
            onPress={() => setFilter('active')}
          />
          <Filter
            label="Wysłuchane"
            active={filter === 'answered'}
            onPress={() => setFilter('answered')}
          />
          <Filter
            label="Wszystkie"
            active={filter === 'all'}
            onPress={() => setFilter('all')}
          />
        </View>

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
        ) : (data ?? []).length === 0 ? (
          <ScrollView
            contentContainerStyle={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
            }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
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
              <Heart size={28} color="#ec4899" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
            >
              Brak intencji
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              Bądź pierwszą osobą, która podzieli się intencją.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {data!.map((p) => (
              <PrayerCard key={p.id} prayer={p} userEmail={user?.email ?? null} />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

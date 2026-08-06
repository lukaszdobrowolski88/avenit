import { useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StatusBar, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Heart, Plus, Sparkles } from 'lucide-react-native';
import { formatRelative } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { useDS, font, radius, cardShadow, space } from '../../../src/theme/ds';
import {
  usePrayerRequests, useTogglePrayer, CATEGORY_META,
  type PrayerRequest, type PrayerStatus,
} from '../../../src/features/prayers/api';
import { useAuthSession } from '../../../src/lib/auth';

const Filter = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => {
  const { c } = useDS();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999,
        backgroundColor: active ? c.ink : c.card,
        borderWidth: 1, borderColor: active ? c.ink : c.line, opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ fontSize: 13, color: active ? c.ground : c.ink, fontFamily: font.semibold }}>{label}</Text>
    </Pressable>
  );
};

const PrayerCard = ({ prayer, userEmail }: { prayer: PrayerRequest; userEmail: string | null }) => {
  const { dark, c } = useDS();
  const meta = CATEGORY_META[prayer.category];
  const toggle = useTogglePrayer(userEmail);
  const iAmPraying = !!userEmail && prayer.praying_users?.includes(userEmail);
  const displayName = prayer.is_anonymous ? 'Anonimowo' : prayer.requester_name || prayer.user_name || prayer.user_email;

  return (
    <View style={[{ marginBottom: space.gap, borderRadius: radius.card, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, padding: 16 }, cardShadow(dark)]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: meta.bg }}>
          <Text style={{ fontSize: 11, color: meta.tint, fontFamily: font.bold }}>{meta.emoji} {meta.label}</Text>
        </View>
        <Text style={{ fontSize: 11, color: c.inkSoft, fontFamily: font.medium }}>{formatRelative(prayer.created_at)}</Text>
        {prayer.status === 'answered' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: c.green }}>
            <Sparkles size={10} color={c.greenInk} />
            <Text style={{ fontSize: 10, color: c.greenInk, fontFamily: font.bold }}>Wysłuchana</Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: 15, marginBottom: 10, color: c.ink, lineHeight: 22, fontFamily: font.regular }}>{prayer.content}</Text>

      {prayer.answered_testimony ? (
        <View style={{ padding: 12, marginBottom: 10, borderRadius: 14, backgroundColor: c.green, borderLeftWidth: 3, borderLeftColor: c.greenInk }}>
          <Text style={{ fontSize: 11, marginBottom: 3, color: c.greenInk, fontFamily: font.bold }}>Świadectwo:</Text>
          <Text style={{ fontSize: 13, color: c.greenInk, fontFamily: font.regular }}>{prayer.answered_testimony}</Text>
        </View>
      ) : null}

      <Text style={{ fontSize: 12, marginBottom: 12, color: c.inkSoft, fontFamily: font.medium }}>{displayName}</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: c.inkSoft, fontFamily: font.regular }}>
          {prayer.prayer_count > 0
            ? `${prayer.prayer_count} ${prayer.prayer_count === 1 ? 'osoba modli się' : 'osób modli się'}`
            : 'Bądź pierwszą osobą'}
        </Text>
        <Pressable
          onPress={() => toggle.mutate({ requestId: prayer.id, currentlyPraying: !!iAmPraying })}
          disabled={toggle.isPending || !userEmail || prayer.status !== 'active'}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.sm,
            backgroundColor: iAmPraying ? c.amber : c.rose, opacity: pressed ? 0.85 : 1,
          })}
        >
          <Heart size={14} color={iAmPraying ? c.onAccent : c.roseInk} fill={iAmPraying ? c.onAccent : 'none'} strokeWidth={2.1} />
          <Text style={{ fontSize: 13, color: iAmPraying ? c.onAccent : c.roseInk, fontFamily: font.bold }}>
            {iAmPraying ? 'Modlę się' : 'Modlę się też'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

export default function PrayersScreen() {
  const router = useRouter();
  const { dark, c } = useDS();
  const { user } = useAuthSession();
  const [filter, setFilter] = useState<PrayerStatus | 'all'>('active');
  const { data, isLoading, isError, error, refetch, isRefetching } = usePrayerRequests(filter);

  return (
    <>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: c.ground }}>
        <PageHeader
          title="Modlitwy"
          subtitle="Intencje społeczności"
          showBack
          right={
            <Pressable onPress={() => router.push('/(app)/prayers/new')}>
              <GradientIcon Icon={Plus} size={44} iconSize={22} from="#FFB24D" to="#F5911F" rounded />
            </Pressable>
          }
        />

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: space.screen, paddingBottom: 12 }}>
          <Filter label="Aktywne" active={filter === 'active'} onPress={() => setFilter('active')} />
          <Filter label="Wysłuchane" active={filter === 'answered'} onPress={() => setFilter('answered')} />
          <Filter label="Wszystkie" active={filter === 'all'} onPress={() => setFilter('all')} />
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.amber} />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <Text style={{ textAlign: 'center', color: c.roseInk, fontFamily: font.medium }}>{(error as Error)?.message ?? 'Błąd'}</Text>
          </View>
        ) : (data ?? []).length === 0 ? (
          <ScrollView
            contentContainerStyle={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.amber} />}
          >
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.rose, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Heart size={28} color={c.roseInk} />
            </View>
            <Text style={{ fontSize: 16, color: c.ink, fontFamily: font.semibold }}>Brak intencji</Text>
            <Text style={{ fontSize: 13, textAlign: 'center', marginTop: 4, color: c.inkSoft, fontFamily: font.regular }}>
              Bądź pierwszą osobą, która podzieli się intencją.
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: space.screen, paddingBottom: 120 }}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={c.amber} />}
          >
            {data!.map((p: PrayerRequest) => (
              <PrayerCard key={p.id} prayer={p} userEmail={user?.email ?? null} />
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

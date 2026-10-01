import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CheckCircle2,
  Heart,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { formatRelative } from '../../../src/lib/domain';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import {
  usePrayerRequests,
  useTogglePrayer,
  useMarkAnswered,
  useDeletePrayer,
  CATEGORY_META,
  type PrayerRequest,
  type PrayerCategory,
} from '../../../src/features/prayers/api';
import { useAuthSession } from '../../../src/lib/auth';

type Scope = 'active' | 'answered' | 'mine' | 'all';

const Chip = ({
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

const OwnerAction = ({
  Icon,
  label,
  tint,
  onPress,
  disabled,
}: {
  Icon: typeof Pencil;
  label: string;
  tint: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    className="flex-row items-center gap-1.5 active:opacity-70"
    style={{ paddingVertical: 6, paddingHorizontal: 4, opacity: disabled ? 0.4 : 1 }}
  >
    <Icon size={14} color={tint} />
    <Text className="text-[12px]" style={{ color: tint, fontFamily: 'Inter_600SemiBold' }}>
      {label}
    </Text>
  </Pressable>
);

const PrayerCard = ({
  prayer,
  userEmail,
  onEdit,
  onDelete,
  onMarkAnswered,
  onReopen,
}: {
  prayer: PrayerRequest;
  userEmail: string | null;
  onEdit: (p: PrayerRequest) => void;
  onDelete: (p: PrayerRequest) => void;
  onMarkAnswered: (p: PrayerRequest) => void;
  onReopen: (p: PrayerRequest) => void;
}) => {
  const meta = CATEGORY_META[prayer.category];
  const toggle = useTogglePrayer(userEmail);
  const iAmPraying = prayer.i_am_praying;
  const displayName = prayer.is_anonymous
    ? 'Anonimowo'
    : prayer.requester_name || prayer.user_name || 'Ktoś ze wspólnoty';

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
          {prayer.visibility === 'leaders_only' && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5"
              style={{ borderRadius: 999, backgroundColor: '#ede9fe' }}
            >
              <Lock size={9} color="#7c3aed" />
              <Text className="text-[10px]" style={{ color: '#6d28d9', fontFamily: 'Inter_700Bold' }}>
                Liderzy
              </Text>
            </View>
          )}
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
              opacity: prayer.status !== 'active' ? 0.5 : 1,
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

        {prayer.is_author && (
          <View
            className="flex-row items-center gap-4 mt-3 pt-3"
            style={{ borderTopWidth: 1, borderTopColor: '#f1f0ee', flexWrap: 'wrap' }}
          >
            {prayer.status === 'answered' ? (
              <OwnerAction
                Icon={RotateCcw}
                label="Przywróć"
                tint="#0e7490"
                onPress={() => onReopen(prayer)}
              />
            ) : (
              <OwnerAction
                Icon={CheckCircle2}
                label="Wysłuchana"
                tint="#059669"
                onPress={() => onMarkAnswered(prayer)}
              />
            )}
            <OwnerAction Icon={Pencil} label="Edytuj" tint="#57534e" onPress={() => onEdit(prayer)} />
            <OwnerAction Icon={Trash2} label="Usuń" tint="#dc2626" onPress={() => onDelete(prayer)} />
          </View>
        )}
      </View>
    </View>
  );
};

const CATEGORIES: PrayerCategory[] = ['zdrowie', 'rodzina', 'finanse', 'duchowe', 'inne'];

export default function PrayersScreen() {
  const router = useRouter();
  const { user } = useAuthSession();
  const [scope, setScope] = useState<Scope>('active');
  const [category, setCategory] = useState<PrayerCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [answeredFor, setAnsweredFor] = useState<PrayerRequest | null>(null);
  const [testimony, setTestimony] = useState('');

  const { data, isLoading, isError, error, refetch, isRefetching } = usePrayerRequests();
  const markAnswered = useMarkAnswered();
  const del = useDeletePrayer();

  const list = useMemo(() => {
    const all: PrayerRequest[] = data ?? [];
    const q = search.trim().toLowerCase();
    return all.filter((p: PrayerRequest) => {
      if (scope === 'active' && p.status !== 'active') return false;
      if (scope === 'answered' && p.status !== 'answered') return false;
      if (scope === 'mine' && !p.is_author) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (q) {
        const hay = `${p.content} ${p.requester_name ?? ''} ${p.user_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, scope, category, search]);

  const openEdit = (p: PrayerRequest) => {
    router.push({
      pathname: '/(app)/prayers/new',
      params: {
        id: p.id,
        content: p.content,
        category: p.category,
        requester_name: p.requester_name ?? '',
        is_anonymous: p.is_anonymous ? 'true' : 'false',
        visibility: p.visibility,
      },
    });
  };

  const confirmDelete = (p: PrayerRequest) => {
    Alert.alert('Usunąć intencję?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(p.id, {
            onError: (e: any) =>
              Alert.alert('Błąd', e?.message ?? 'Nie udało się usunąć intencji.'),
          }),
      },
    ]);
  };

  const openAnswered = (p: PrayerRequest) => {
    setTestimony('');
    setAnsweredFor(p);
  };

  const confirmAnswered = () => {
    if (!answeredFor) return;
    markAnswered.mutate(
      { id: answeredFor.id, answered: true, testimony: testimony.trim() || null },
      {
        onSuccess: () => setAnsweredFor(null),
        onError: (e: any) =>
          Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać.'),
      }
    );
  };

  const reopen = (p: PrayerRequest) => {
    markAnswered.mutate(
      { id: p.id, answered: false },
      {
        onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać.'),
      }
    );
  };

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

        <View className="flex-row gap-2 px-4 pb-2">
          <Chip label="Aktywne" active={scope === 'active'} onPress={() => setScope('active')} />
          <Chip label="Wysłuchane" active={scope === 'answered'} onPress={() => setScope('answered')} />
          <Chip label="Moje" active={scope === 'mine'} onPress={() => setScope('mine')} />
          <Chip label="Wszystkie" active={scope === 'all'} onPress={() => setScope('all')} />
        </View>

        <View className="px-4 pb-2">
          <View
            className="flex-row items-center gap-2 px-3"
            style={{
              borderRadius: 999,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#eef0f3',
              height: 40,
            }}
          >
            <Search size={16} color="#a8a29e" />
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: '#0c0a09',
                fontFamily: 'Inter_400Regular',
                paddingVertical: 0,
              }}
              placeholder="Szukaj w intencjach…"
              placeholderTextColor="#a8a29e"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={15} color="#a8a29e" />
              </Pressable>
            )}
          </View>
        </View>

        <View className="pb-3" style={{ maxHeight: 44 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
          >
            <Chip label="Wszystkie" active={category === 'all'} onPress={() => setCategory('all')} />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`}
                active={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </ScrollView>
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
        ) : list.length === 0 ? (
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
              {search || category !== 'all' || scope !== 'active' ? 'Brak wyników' : 'Brak intencji'}
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
            >
              {search || category !== 'all' || scope !== 'active'
                ? 'Zmień filtry lub wyczyść wyszukiwanie.'
                : 'Bądź pierwszą osobą, która podzieli się intencją.'}
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#ec4899" />
            }
          >
            {list.map((p: PrayerRequest) => (
              <PrayerCard
                key={p.id}
                prayer={p}
                userEmail={user?.email ?? null}
                onEdit={openEdit}
                onDelete={confirmDelete}
                onMarkAnswered={openAnswered}
                onReopen={reopen}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Modal „Wysłuchana" + świadectwo */}
      <Modal
        visible={!!answeredFor}
        transparent
        animationType="slide"
        onRequestClose={() => setAnsweredFor(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setAnsweredFor(null)}
        >
          <Pressable
            style={{
              backgroundColor: '#ffffff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: 32,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center gap-2 mb-1">
              <Sparkles size={18} color="#059669" />
              <Text style={{ fontSize: 18, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>
                Modlitwa wysłuchana 🙌
              </Text>
            </View>
            <Text
              style={{ fontSize: 13, color: '#78716c', marginBottom: 14, fontFamily: 'Inter_400Regular' }}
            >
              Możesz dodać krótkie świadectwo (opcjonalnie) — zbuduje wiarę wspólnoty.
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#eef0f3',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                minHeight: 96,
                textAlignVertical: 'top',
                fontSize: 15,
                color: '#0c0a09',
                backgroundColor: '#fafaf9',
                marginBottom: 16,
                fontFamily: 'Inter_400Regular',
              }}
              placeholder="Jak Bóg odpowiedział na tę modlitwę?"
              placeholderTextColor="#a8a29e"
              multiline
              value={testimony}
              onChangeText={setTestimony}
              editable={!markAnswered.isPending}
            />
            <GradientButton onPress={confirmAnswered} loading={markAnswered.isPending}>
              Oznacz jako wysłuchaną
            </GradientButton>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

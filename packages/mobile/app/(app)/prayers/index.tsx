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
import { useT } from '../../../src/i18n';
import { friendlyError, showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';

// Krótki cytat intencji do potwierdzeń.
const excerpt = (text: string | null | undefined, max = 60) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const prayingLabel = (n: number) => {
  if (n === 1) return 'osoba modli się';
  const d = n % 10;
  const h = n % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? 'osoby modlą się' : 'osób modli się';
};

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
      backgroundColor: active ? '#2A2312' : '#ECE8DE',
    }}
  >
    <Text
      className="text-[13px]"
      style={{ color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
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
    <Text className="text-[12px]" style={{ color: tint, fontFamily: 'Manrope_600SemiBold' }}>
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
  const t = useT();
  const meta = CATEGORY_META[prayer.category];
  const toggle = useTogglePrayer(userEmail);
  const iAmPraying = prayer.i_am_praying;
  const displayName = prayer.is_anonymous
    ? t('Anonimowo')
    : prayer.requester_name || prayer.user_name || t('Ktoś ze wspólnoty');

  return (
    <View
      className="mb-3"
      style={{
        borderRadius: 20,
        backgroundColor: '#FFFFFF',
      }}
    >
      <View
        className="overflow-hidden p-4"
        style={{ borderRadius: 20 }}
      >
        <View className="flex-row items-center gap-2 mb-2">
          <View className="px-2 py-0.5" style={{ borderRadius: 999, backgroundColor: meta.bg }}>
            <Text
              className="text-[11px]"
              style={{ color: meta.tint, fontFamily: 'Manrope_700Bold' }}
            >
              {t(meta.label)}
            </Text>
          </View>
          <Text
            className="text-[11px]"
            style={{ color: '#6E685A', fontFamily: 'Manrope_500Medium' }}
          >
            {formatRelative(prayer.created_at)}
          </Text>
          {prayer.visibility === 'leaders_only' && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5"
              style={{ borderRadius: 999, backgroundColor: '#ECE8DE' }}
            >
              <Lock size={9} color="#2A2312" />
              <Text className="text-[10px]" style={{ color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                {t('Liderzy')}
              </Text>
            </View>
          )}
          {prayer.status === 'answered' && (
            <View
              className="flex-row items-center gap-1 px-2 py-0.5"
              style={{ borderRadius: 999, backgroundColor: '#FFF1C2' }}
            >
              <Sparkles size={10} color="#6B4F05" />
              <Text
                className="text-[10px]"
                style={{ color: '#6B4F05', fontFamily: 'Manrope_700Bold' }}
              >
                {t('Wysłuchana')}
              </Text>
            </View>
          )}
        </View>

        <Text
          className="text-[15px] mb-2"
          style={{ color: '#2A2312', lineHeight: 22, fontFamily: 'Manrope_400Regular' }}
        >
          {prayer.content}
        </Text>

        {prayer.answered_testimony ? (
          <View
            className="p-3 mb-2"
            style={{
              borderRadius: 12,
              backgroundColor: '#FFF1C2',
            }}
          >
            <Text
              className="text-[11px] mb-1"
              style={{ color: '#6B4F05', fontFamily: 'Manrope_700Bold' }}
            >
              {t('Świadectwo:')}
            </Text>
            <Text
              className="text-[13px]"
              style={{ color: '#2A2312', fontFamily: 'Manrope_400Regular' }}
            >
              {prayer.answered_testimony}
            </Text>
          </View>
        ) : null}

        <Text
          className="text-[12px] mb-3"
          style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}
        >
          {displayName}
        </Text>

        <View className="flex-row items-center justify-between">
          <Text
            className="text-[12px]"
            style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
          >
            {prayer.prayer_count > 0
              ? `${prayer.prayer_count} ${t(prayingLabel(prayer.prayer_count))}`
              : t('Bądź pierwszą osobą modlącą się')}
          </Text>
          <Pressable
            onPress={() => {
              if (toggle.isPending) return;
              toggle.mutate(
                { requestId: prayer.id, currentlyPraying: !!iAmPraying },
                { onError: (e) => showError('Nie udało się zapisać', e, 'Spróbuj ponownie.') },
              );
            }}
            accessibilityLabel={iAmPraying ? t('Przestań się modlić za tę intencję') : t('Modlę się za tę intencję')}
            disabled={toggle.isPending || !userEmail || prayer.status !== 'active'}
            className="flex-row items-center gap-1.5 active:opacity-80"
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              backgroundColor: iAmPraying ? '#2A2312' : '#FFF8E1',
              borderWidth: 1,
              borderColor: iAmPraying ? '#FFBE0B' : '#F3E3B0',
              opacity: prayer.status !== 'active' ? 0.5 : 1,
            }}
          >
            <Heart
              size={13}
              color={iAmPraying ? 'white' : '#8A6606'}
              fill={iAmPraying ? 'white' : 'none'}
            />
            <Text
              className="text-[12px]"
              style={{
                color: iAmPraying ? '#ffffff' : '#8A6606',
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {iAmPraying ? t('Modlę się') : t('Modlę się też')}
            </Text>
          </Pressable>
        </View>

        {prayer.is_author && (
          <View
            className="flex-row items-center gap-4 mt-3 pt-3"
            style={{ borderTopWidth: 1, borderTopColor: '#ECE8DE', flexWrap: 'wrap' }}
          >
            {prayer.status === 'answered' ? (
              <OwnerAction
                Icon={RotateCcw}
                label={t("Przywróć")}
                tint="#2A2312"
                onPress={() => onReopen(prayer)}
              />
            ) : (
              <OwnerAction
                Icon={CheckCircle2}
                label={t("Wysłuchana")}
                tint="#6B4F05"
                onPress={() => onMarkAnswered(prayer)}
              />
            )}
            <OwnerAction Icon={Pencil} label={t("Edytuj")} tint="#4A463E" onPress={() => onEdit(prayer)} />
            <OwnerAction Icon={Trash2} label={t("Usuń")} tint="#B42318" onPress={() => onDelete(prayer)} />
          </View>
        )}
      </View>
    </View>
  );
};

const CATEGORIES: PrayerCategory[] = ['zdrowie', 'rodzina', 'finanse', 'duchowe', 'inne'];

export default function PrayersScreen() {
  const router = useRouter();
  const t = useT();
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
    Alert.alert(
      `${t('Usunąć intencję')} „${excerpt(p.content)}”?`,
      t('Zniknie ze ściany modlitwy dla wszystkich, razem z liczbą modlących się. Tego nie można cofnąć.'),
      [
        { text: t('Anuluj'), style: 'cancel' },
        {
          text: t('Usuń'),
          style: 'destructive',
          onPress: () => {
            if (del.isPending) return;
            del.mutate(p.id, {
              onSuccess: () => toast.success('Usunięto intencję'),
              onError: (e) => showError('Nie udało się usunąć', e, 'Nie udało się usunąć intencji. Spróbuj ponownie.'),
            });
          },
        },
      ],
    );
  };

  const openAnswered = (p: PrayerRequest) => {
    setTestimony('');
    setAnsweredFor(p);
  };

  const confirmAnswered = () => {
    if (!answeredFor || markAnswered.isPending) return;
    markAnswered.mutate(
      { id: answeredFor.id, answered: true, testimony: testimony.trim() || null },
      {
        onSuccess: () => {
          setAnsweredFor(null);
          toast.success('Oznaczono jako wysłuchaną');
        },
        onError: (e) => showError('Nie udało się zapisać', e, 'Spróbuj ponownie.'),
      }
    );
  };

  const reopen = (p: PrayerRequest) => {
    if (markAnswered.isPending) return;
    markAnswered.mutate(
      { id: p.id, answered: false },
      {
        onSuccess: () => toast.success('Intencja znów jest aktywna'),
        onError: (e) => showError('Nie udało się zapisać', e, 'Spróbuj ponownie.'),
      }
    );
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View className="flex-1" style={{ backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title={t("Ściana modlitwy")}
          subtitle={t("Intencje społeczności")}
          showBack
          right={
            <Pressable
              onPress={() => router.push('/(app)/prayers/new')}
              accessibilityLabel={t('Dodaj intencję')}
              className="active:opacity-80"
            >
              <GradientIcon
                Icon={Plus}
                size={40}
                iconSize={20}
                rounded
              />
            </Pressable>
          }
        />

        <View className="flex-row gap-2 px-4 pb-2">
          <Chip label={t("Aktywne")} active={scope === 'active'} onPress={() => setScope('active')} />
          <Chip label={t("Wysłuchane")} active={scope === 'answered'} onPress={() => setScope('answered')} />
          <Chip label={t("Moje")} active={scope === 'mine'} onPress={() => setScope('mine')} />
          <Chip label={t("Wszystkie")} active={scope === 'all'} onPress={() => setScope('all')} />
        </View>

        <View className="px-4 pb-2">
          <View
            className="flex-row items-center gap-2 px-3"
            style={{
              borderRadius: 24,
              backgroundColor: '#FFFFFF',
              height: 40,
            }}
          >
            <Search size={16} color="#6E685A" />
            <TextInput
              style={{
                flex: 1,
                fontSize: 14,
                color: '#2A2312',
                fontFamily: 'Manrope_400Regular',
                paddingVertical: 0,
              }}
              placeholder={t("Szukaj w intencjach…")}
              placeholderTextColor="#6E685A"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={15} color="#6E685A" />
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
            <Chip label={t("Wszystkie")} active={category === 'all'} onPress={() => setCategory('all')} />
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={t(CATEGORY_META[c].label)}
                active={category === c}
                onPress={() => setCategory(c)}
              />
            ))}
          </ScrollView>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text
              className="text-center"
              style={{ color: '#4A463E', fontFamily: 'Manrope_500Medium', lineHeight: 20 }}
            >
              {friendlyError(error, t('Nie udało się wczytać intencji.'))}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="active:opacity-70"
              style={{ marginTop: 14, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#2A2312' }}
            >
              <Text style={{ color: '#F6F4EE', fontFamily: 'Manrope_700Bold', fontSize: 14 }}>{t('Spróbuj ponownie')}</Text>
            </Pressable>
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
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
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
              <Heart size={28} color="#8A6606" />
            </View>
            <Text
              className="text-[16px]"
              style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
            >
              {search || category !== 'all' || scope !== 'active' ? t('Brak wyników') : t('Brak intencji')}
            </Text>
            <Text
              className="text-[13px] text-center mt-1"
              style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
            >
              {search || category !== 'all' || scope !== 'active'
                ? t('Zmień filtry lub wyczyść wyszukiwanie.')
                : t('Bądź pierwszą osobą, która podzieli się intencją.')}
            </Text>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
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
          onPress={() => !markAnswered.isPending && setAnsweredFor(null)}
        >
          <Pressable
            style={{
              backgroundColor: '#F6F4EE',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              paddingBottom: 32,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row items-center gap-2 mb-1">
              <Sparkles size={18} color="#8A6606" />
              <Text style={{ fontSize: 18, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                {t('Modlitwa wysłuchana')}
              </Text>
            </View>
            <Text
              style={{ fontSize: 13, color: '#6B6557', marginBottom: 14, fontFamily: 'Manrope_400Regular' }}
            >
              {t('Możesz dodać krótkie świadectwo (opcjonalnie) — zbuduje wiarę wspólnoty.')}
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E6E1D5',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                minHeight: 96,
                textAlignVertical: 'top',
                fontSize: 15,
                color: '#2A2312',
                backgroundColor: '#FFFFFF',
                marginBottom: 16,
                fontFamily: 'Manrope_400Regular',
              }}
              placeholder={t("Jak Bóg odpowiedział na tę modlitwę?")}
              placeholderTextColor="#6E685A"
              multiline
              value={testimony}
              onChangeText={setTestimony}
              editable={!markAnswered.isPending}
            />
            <GradientButton onPress={confirmAnswered} loading={markAnswered.isPending}>
              {t('Oznacz jako wysłuchaną')}
            </GradientButton>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

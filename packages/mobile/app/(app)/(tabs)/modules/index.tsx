import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, Search, UserCheck, X } from 'lucide-react-native';
import { openModule, useModules, type ModuleItem } from '../../../../src/features/modules/useModules';
import { useAuthSession } from '../../../../src/lib/auth';
import { useUnreadNotificationsCount } from '../../../../src/features/notifications/api';
import { usePendingAccounts } from '../../../../src/features/admin/approvals';
import { B, FeatureCard, IconWell, ListCard, ListRow, SectionLabel } from '../../../../src/components/ui/brand';

const GAP = 10;
const SIDE = 16;

// Kafel siatki (Wspólnota): biały na papierze, ikona u góry, nazwa na dole — jak na pulpicie.
const GridTile = ({ item, width, onPress }: { item: ModuleItem; width: number; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    accessibilityLabel={item.isWeb ? `${item.label}, otwiera się w przeglądarce` : item.label}
    className="active:opacity-70"
    style={{ width, minHeight: 108, borderRadius: 22, backgroundColor: B.card, padding: 12, justifyContent: 'space-between' }}
  >
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <IconWell Icon={item.Icon} size={40} />
      {item.isWeb ? <ArrowUpRight size={15} color={B.ink4} strokeWidth={2} /> : null}
    </View>
    <Text numberOfLines={2} style={{ marginTop: 12, fontSize: 13, lineHeight: 17, color: B.ink, letterSpacing: -0.2, fontFamily: 'Manrope_600SemiBold' }}>
      {item.label}
    </Text>
  </Pressable>
);

export default function ModulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuthSession();
  const { ready, groups, personal, items, perms } = useModules();
  const unread = useUnreadNotificationsCount(user?.email ?? null);
  const canManageUsers = perms.can('action:settings:manage_users');
  const pending = usePendingAccounts(canManageUsers);
  const pendingCount = (pending.data ?? []).filter((a: { kind: string }) => a.kind === 'admin').length;
  const [query, setQuery] = useState('');

  const tileWidth = Math.floor((width - SIDE * 2 - GAP * 2) / 3);
  const q = query.trim().toLowerCase();
  const total = items.length + personal.length;

  // Rola w służbie — lider w słodzie, członek w kurkumie (jak ekran Zespoły).
  const roleOf = (key: string) => {
    const mine = perms.ministries.filter((m) => m.ministry_key === key);
    if (!mine.length) return null;
    return mine.some((m) => m.role === 'leader') ? 'leader' : 'member';
  };

  const results = useMemo(
    () => (q ? items.filter((it) => it.label.toLowerCase().includes(q)) : []),
    [items, q],
  );
  const personalResults = useMemo(
    () => (q ? personal.filter((p) => p.label.toLowerCase().includes(q)) : []),
    [personal, q],
  );
  const byKey = (section: string) => groups.find((g) => g.section === section)?.items ?? [];

  const listRow = (it: ModuleItem, tone?: 'paper' | 'kurkuma' | 'slod', role?: string | null) => (
    <ListRow
      key={it.key}
      leading={<IconWell Icon={it.Icon} size={42} tone={tone} />}
      dividerInset={72}
      title={it.label}
      meta={
        role ? (
          <Text style={{ fontSize: 11, marginTop: 3, letterSpacing: 1, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_700Bold' }}>
            {role}
          </Text>
        ) : null
      }
      right={it.isWeb ? <ArrowUpRight size={17} color={B.ink4} strokeWidth={2} /> : undefined}
      noChevron={it.isWeb}
      onPress={() => openModule(it, router)}
    />
  );

  const community = byKey('community');
  const teams = byKey('teams');
  const manage = byKey('manage');

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: B.paper }}
        contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: insets.top + 18, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => perms.refetch()} tintColor={B.ink} />}
      >
        {/* Nagłówek jak key visual marki: „Cały kościół. / Jedna aplikacja.” */}
        <View style={{ paddingHorizontal: 4, marginBottom: 20 }}>
          <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: B.gold, fontFamily: 'Manrope_600SemiBold' }}>
            {ready ? `Moduły · ${total} dla Ciebie` : 'Moduły · wczytywanie…'}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 34, lineHeight: 39, letterSpacing: -1.3, color: B.ink, fontFamily: 'Manrope_700Bold' }}>
            Cały kościół.
          </Text>
          <Text style={{ fontSize: 34, lineHeight: 39, letterSpacing: -1.3, color: B.ink, fontFamily: 'Manrope_300Light' }}>
            Jedna aplikacja<Text style={{ color: B.kurkuma, fontFamily: 'Manrope_700Bold' }}>.</Text>
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: B.card,
            borderRadius: 24,
            paddingHorizontal: 16,
            height: 48,
          }}
        >
          <Search size={18} color={B.ink3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Szukaj modułu…"
            placeholderTextColor={B.ink4}
            autoCorrect={false}
            style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: 'Manrope_500Medium' }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <X size={16} color={B.ink3} />
            </Pressable>
          ) : null}
        </View>

        {!ready ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator color={B.ink} />
          </View>
        ) : null}

        {/* Wyszukiwanie: jedna lista wyników zamiast sekcji. */}
        {ready && q ? (
          results.length + personalResults.length > 0 ? (
            <>
              <SectionLabel count={results.length + personalResults.length}>Wyniki</SectionLabel>
              <ListCard>
                {personalResults.map((p) => (
                  <ListRow
                    key={p.key}
                    leading={<IconWell Icon={p.Icon} size={42} />}
                    dividerInset={72}
                    title={p.label}
                    onPress={() => router.push(p.route as never)}
                  />
                ))}
                {results.map((it) => listRow(it))}
              </ListCard>
            </>
          ) : (
            <Text style={{ marginTop: 32, textAlign: 'center', color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
              Brak modułu o nazwie „{query.trim()}”
            </Text>
          )
        ) : null}

        {ready && !q ? (
          <>
            {canManageUsers && pendingCount > 0 ? (
              <FeatureCard
                Icon={UserCheck}
                title={`Nowe konta: ${pendingCount}`}
                subtitle="Czekają na zatwierdzenie"
                onPress={() => router.push('/(app)/approvals')}
                style={{ marginTop: 18 }}
              />
            ) : null}

            {personal.length > 0 ? (
              <>
                <SectionLabel count={personal.length}>Dla Ciebie</SectionLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, marginHorizontal: -SIDE }}
                  contentContainerStyle={{ paddingHorizontal: SIDE, gap: 10 }}
                >
                  {personal.map((p) => {
                    const badge = p.key === 'notifications' ? unread.data ?? 0 : 0;
                    return (
                      <Pressable
                        key={p.key}
                        onPress={() => router.push(p.route as never)}
                        accessibilityLabel={p.label}
                        className="active:opacity-70"
                        style={{ width: 76, alignItems: 'center', gap: 8 }}
                      >
                        <View
                          style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <p.Icon size={24} color={B.ink} strokeWidth={1.8} />
                          {badge > 0 ? (
                            <View
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                minWidth: 20,
                                height: 20,
                                paddingHorizontal: 5,
                                borderRadius: 10,
                                backgroundColor: B.kurkuma,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text style={{ fontSize: 11, color: B.ink, fontFamily: 'Manrope_700Bold' }}>{badge > 99 ? '99+' : badge}</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text numberOfLines={1} style={{ fontSize: 12, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
                          {p.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {community.length > 0 ? (
              <>
                <SectionLabel count={community.length}>Wspólnota</SectionLabel>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                  {community.map((it) => (
                    <GridTile key={it.key} item={it} width={tileWidth} onPress={() => openModule(it, router)} />
                  ))}
                </View>
              </>
            ) : null}

            {teams.length > 0 ? (
              <>
                <SectionLabel count={teams.length}>Zespoły i służby</SectionLabel>
                <ListCard>
                  {teams.map((it) => {
                    const role = roleOf(it.key);
                    return listRow(
                      it,
                      role === 'leader' ? 'slod' : role === 'member' ? 'kurkuma' : 'paper',
                      role === 'leader' ? 'Lider' : role === 'member' ? 'Członek zespołu' : null,
                    );
                  })}
                </ListCard>
              </>
            ) : null}

            {manage.length > 0 ? (
              <>
                <SectionLabel count={manage.length}>Zarządzanie</SectionLabel>
                <ListCard>{manage.map((it) => listRow(it))}</ListCard>
              </>
            ) : null}

            <Text style={{ marginTop: 22, paddingHorizontal: 4, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: 'Manrope_500Medium' }}>
              {perms.fallback
                ? 'Nie udało się pobrać Twoich uprawnień, więc widzisz podstawowy zestaw. Pociągnij w dół, aby spróbować ponownie.'
                : 'Moduły ze strzałką ↗ otwierają się na stronie kościoła w przeglądarce, od razu zalogowane. Widzisz to samo co w wersji webowej.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

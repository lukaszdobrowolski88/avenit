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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpRight, Search, SearchX, UserCheck, X } from 'lucide-react-native';
import { openModule, useModules, type ModuleItem } from '../../../../src/features/modules/useModules';
import { wordStartScore } from '../../../../src/features/modules/nav';
import { useAuthSession } from '../../../../src/lib/auth';
import { useUnreadNotificationsCount } from '../../../../src/features/notifications/api';
import { usePendingAccounts } from '../../../../src/features/admin/approvals';
import { B, FeatureCard, IconWell, ListCard, ListRow, SectionLabel } from '../../../../src/components/ui/brand';
import { EmptyState } from '../../../../src/components/ui/EmptyState';

const SIDE = 16;

// Zakładka „Moduły” — to samo menu co web: grupy Start / Ludzie / Służby / Komunikacja /
// Finanse / Narzędzia / Moje moduły (src/features/modules/nav.ts = navConfig weba), w grupie
// kolejność z ustawień kościoła. Moduły bez ekranu w apce (↗) otwierają się w przeglądarce,
// od razu zalogowane (bilet SSO).
export default function ModulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const { ready, groups, settings, personal, items, perms } = useModules();
  const unread = useUnreadNotificationsCount(user?.email ?? null);
  const canManageUsers = perms.can('action:settings:manage_users');
  const pending = usePendingAccounts(canManageUsers);
  const pendingCount = (pending.data ?? []).filter((a: { kind: string }) => a.kind === 'admin').length;
  const [query, setQuery] = useState('');

  const q = query.trim();
  const total = items.length + personal.length;

  // Rola w służbie — lider / członek zespołu (jak ekran Zespoły).
  const roleOf = (key: string) => {
    const mine = perms.ministries.filter((m) => m.ministry_key === key);
    if (!mine.length) return null;
    return mine.some((m) => m.role === 'leader') ? 'leader' : 'member';
  };

  // Wyszukiwanie od początku słowa, także po słowach kluczowych (np. „ccli” → Analityka,
  // „kazania” → Nauczanie) — jak ⌘K na webie. Najpierw trafienia w nazwę.
  const results = useMemo(() => {
    if (!q) return [];
    const pool: ModuleItem[] = settings ? [...items, settings] : items;
    return pool
      .map((it) => ({ it, score: wordStartScore(q, it.label, it.keywords ?? '') }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [items, settings, q]);
  const personalResults = useMemo(
    () => (q ? personal.filter((p) => wordStartScore(q, p.label, p.short) > 0) : []),
    [personal, q],
  );

  const moduleRow = (it: ModuleItem) => {
    const role = it.group === 'ministries' ? roleOf(it.key) : null;
    return (
      <ListRow
        key={it.key}
        leading={<IconWell Icon={it.Icon} size={42} tone={role === 'leader' ? 'slod' : role === 'member' ? 'kurkuma' : 'paper'} />}
        dividerInset={72}
        title={it.label}
        subtitle={it.isWeb ? it.hint ?? null : null}
        meta={
          role ? (
            <Text style={{ fontSize: 12, marginTop: 3, color: B.gold, fontFamily: 'Manrope_700Bold' }}>
              {role === 'leader' ? 'Jesteś liderem' : 'Jesteś w zespole'}
            </Text>
          ) : null
        }
        right={it.isWeb ? <ArrowUpRight size={17} color={B.ink4} strokeWidth={2} /> : undefined}
        noChevron={it.isWeb}
        onPress={() => openModule(it, router)}
      />
    );
  };

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
          <Text
            accessibilityRole="header"
            style={{ marginTop: 10, fontSize: 34, lineHeight: 39, letterSpacing: -1.3, color: B.ink, fontFamily: 'Manrope_700Bold' }}
          >
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
            borderWidth: 1,
            borderColor: B.fieldBorder,
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
            accessibilityLabel="Szukaj modułu"
            style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: 'Manrope_500Medium' }}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Wyczyść wyszukiwanie">
              <X size={16} color={B.ink3} />
            </Pressable>
          ) : null}
        </View>

        {!ready ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator color={B.ink} />
          </View>
        ) : null}

        {/* Wyszukiwanie: jedna lista wyników zamiast grup. */}
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
                {results.map(moduleRow)}
              </ListCard>
            </>
          ) : (
            <EmptyState
              Icon={SearchX}
              title={`Nie znaleziono „${q}”`}
              hint="Sprawdź pisownię albo wpisz początek nazwy modułu. Jeśli modułu brakuje, poproś administratora o dostęp."
              actionLabel="Wyczyść wyszukiwanie"
              onAction={() => setQuery('')}
            />
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
                        accessibilityRole="button"
                        accessibilityLabel={badge > 0 ? `${p.label}, ${badge} nowych` : p.label}
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
                        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 12, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
                          {p.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {groups.map((g) => (
              <View key={g.id}>
                <SectionLabel count={g.items.length}>{g.title}</SectionLabel>
                <ListCard>{g.items.map(moduleRow)}</ListCard>
              </View>
            ))}

            {settings ? (
              <ListCard style={{ marginTop: 22 }}>
                <ListRow
                  leading={<IconWell Icon={settings.Icon} size={42} />}
                  dividerInset={72}
                  title="Ustawienia kościoła"
                  subtitle={settings.hint ?? null}
                  right={<ArrowUpRight size={17} color={B.ink4} strokeWidth={2} />}
                  noChevron
                  onPress={() => openModule(settings, router)}
                />
              </ListCard>
            ) : null}

            {groups.length === 0 && !settings ? (
              <EmptyState
                Icon={SearchX}
                title="Nie masz jeszcze dostępu do modułów"
                hint="Poproś administratora kościoła o nadanie uprawnień. Pociągnij w dół, aby odświeżyć."
                actionLabel="Odśwież"
                onAction={() => perms.refetch()}
              />
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

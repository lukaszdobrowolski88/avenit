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
import { ArrowUpRight, Search, SearchX, X } from 'lucide-react-native';
import { openModule, useModules, type ModuleGroup, type ModuleItem } from '../../../../src/features/modules/useModules';
import { wordStartScore, type NavGroupId } from '../../../../src/features/modules/nav';
import { B, IconWell, ListCard, ListRow, SectionLabel } from '../../../../src/components/ui/brand';
import { EmptyState } from '../../../../src/components/ui/EmptyState';

const SIDE = 16;
const FONT = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', light: 'Manrope_300Light' };

// Ton ikon grupy — rytm bez tęczy: każda grupa ma swój odcień z palety marki
// (papier / jasna kurkuma / kurkuma / słód), więc sekcje odróżniają się na pierwszy rzut oka.
type Tone = { bg: string; fg: string };
const GROUP_TONE: Record<NavGroupId, Tone> = {
  start: { bg: B.kurkuma, fg: B.ink },
  people: { bg: B.kurkumaSoft, fg: B.goldDeep },
  ministries: { bg: B.ink, fg: B.kurkuma },
  communication: { bg: B.paper2, fg: B.ink },
  finance: { bg: B.kurkumaSoft, fg: B.goldDeep },
  tools: { bg: B.paper2, fg: B.ink3 },
  custom: { bg: B.paper2, fg: B.ink },
};

// Zakładka „Moduły” — katalog modułów (jak biblioteka aplikacji), NIE drugi pulpit: bez liczników,
// skrótów i bieżących danych. Grupy jak w menu weba (src/features/modules/nav.ts); każda grupa to
// karta z siatką ikon w swoim tonie. Moduły bez ekranu w apce mają znaczek ↗ (otwierają się
// w przeglądarce, od razu zalogowane).
export default function ModulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { ready, groups, items, perms } = useModules();
  const [query, setQuery] = useState('');
  const q = query.trim();

  // Siatka: 4 kolumny na szerszych telefonach, 3 na wąskich.
  const cardInner = width - SIDE * 2 - 24; // karta: padding 12 z każdej strony
  const cols = cardInner >= 340 ? 4 : 3;
  const cell = Math.floor(cardInner / cols);

  // Rola w służbie — lider / członek zespołu: widać ją na ikonie (kropka) i w opisie dostępności.
  const roleOf = (key: string) => {
    const mine = perms.ministries.filter((m) => m.ministry_key === key);
    if (!mine.length) return null;
    return mine.some((m) => m.role === 'leader') ? 'leader' : 'member';
  };

  // Wyszukiwanie od początku słowa, także po słowach kluczowych (jak ⌘K na webie).
  const results = useMemo(() => {
    if (!q) return [];
    return items
      .map((it) => ({ it, score: wordStartScore(q, it.label, it.keywords ?? '') }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.it);
  }, [items, q]);

  const AppIcon = ({ it, tone }: { it: ModuleItem; tone: Tone }) => {
    const role = it.group === 'ministries' ? roleOf(it.key) : null;
    return (
      <Pressable
        onPress={() => openModule(it, router)}
        accessibilityRole="button"
        accessibilityLabel={[
          it.label,
          role === 'leader' ? 'prowadzisz' : role === 'member' ? 'jesteś w zespole' : null,
          it.isWeb ? 'otwiera się w przeglądarce' : null,
        ].filter(Boolean).join(', ')}
        className="active:opacity-70"
        style={{ width: cell, alignItems: 'center', paddingVertical: 8, gap: 7 }}
      >
        <View style={{ width: 58, height: 58, borderRadius: 19, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
          <it.Icon size={25} color={tone.fg} strokeWidth={1.9} />
          {it.isWeb ? (
            <View
              style={{
                position: 'absolute',
                right: -4,
                top: -4,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: B.card,
                borderWidth: 1,
                borderColor: B.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ArrowUpRight size={11} color={B.ink3} strokeWidth={2.4} />
            </View>
          ) : null}
          {role ? (
            <View
              style={{
                position: 'absolute',
                left: -3,
                bottom: -3,
                paddingHorizontal: 6,
                height: 18,
                borderRadius: 9,
                backgroundColor: role === 'leader' ? B.kurkuma : B.card,
                borderWidth: 1,
                borderColor: role === 'leader' ? B.kurkuma : B.line,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 9, letterSpacing: 0.3, color: B.ink, fontFamily: FONT.bold }}>
                {role === 'leader' ? 'LIDER' : 'ZESPÓŁ'}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{ fontSize: 12, lineHeight: 15, textAlign: 'center', color: B.ink, fontFamily: FONT.semibold, paddingHorizontal: 2 }}
        >
          {it.label}
        </Text>
      </Pressable>
    );
  };

  const GroupCard = ({ g }: { g: ModuleGroup }) => {
    const tone = GROUP_TONE[g.id] ?? GROUP_TONE.custom;
    return (
      <View style={{ marginTop: 16, backgroundColor: B.card, borderRadius: 28, paddingTop: 16, paddingBottom: 8, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 6, marginBottom: 4 }}>
          <Text accessibilityRole="header" style={{ fontSize: 17, letterSpacing: -0.4, color: B.ink, fontFamily: FONT.bold }}>
            {g.title}
            <Text style={{ color: B.kurkuma }}>.</Text>
          </Text>
          <Text style={{ fontSize: 12, color: B.ink4, fontFamily: FONT.semibold }}>{g.items.length}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {g.items.map((it) => <AppIcon key={it.key} it={it} tone={tone} />)}
        </View>
      </View>
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
        <View style={{ paddingHorizontal: 4, marginBottom: 18 }}>
          <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: B.gold, fontFamily: FONT.semibold }}>
            {ready ? `Moduły · ${items.length}` : 'Moduły · wczytywanie…'}
          </Text>
          <Text accessibilityRole="header" style={{ marginTop: 10, fontSize: 32, lineHeight: 37, letterSpacing: -1.2, color: B.ink, fontFamily: FONT.bold }}>
            Cały kościół.
          </Text>
          <Text style={{ fontSize: 32, lineHeight: 37, letterSpacing: -1.2, color: B.ink, fontFamily: FONT.light }}>
            Jedna aplikacja<Text style={{ color: B.kurkuma, fontFamily: FONT.bold }}>.</Text>
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
            style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: FONT.medium }}
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
          results.length > 0 ? (
            <>
              <SectionLabel count={results.length}>Wyniki</SectionLabel>
              <ListCard>
                {results.map((it) => (
                  <ListRow
                    key={it.key}
                    leading={<IconWell Icon={it.Icon} size={42} />}
                    dividerInset={72}
                    title={it.label}
                    subtitle={it.isWeb ? it.hint ?? null : null}
                    right={it.isWeb ? <ArrowUpRight size={17} color={B.ink4} strokeWidth={2} /> : undefined}
                    noChevron={it.isWeb}
                    onPress={() => openModule(it, router)}
                  />
                ))}
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
            {groups.map((g) => <GroupCard key={g.id} g={g} />)}

            {groups.length === 0 ? (
              <EmptyState
                Icon={SearchX}
                title="Nie masz jeszcze dostępu do modułów"
                hint="Poproś administratora kościoła o nadanie uprawnień. Pociągnij w dół, aby odświeżyć."
                actionLabel="Odśwież"
                onAction={() => perms.refetch()}
              />
            ) : null}

            <Text style={{ marginTop: 20, paddingHorizontal: 4, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: FONT.medium }}>
              {perms.fallback
                ? 'Nie udało się pobrać Twoich uprawnień, więc widzisz podstawowy zestaw. Pociągnij w dół, aby spróbować ponownie.'
                : 'Moduły ze znaczkiem ↗ otwierają się na stronie kościoła w przeglądarce, od razu zalogowane.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

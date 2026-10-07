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
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ClipboardCheck,
  HandHeart,
  MessageCircle,
  Search,
  SearchX,
  Settings2,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { openModule, useModules, type ModuleGroup, type ModuleItem } from '../../../../src/features/modules/useModules';
import { wordStartScore } from '../../../../src/features/modules/nav';
import { useAuthSession } from '../../../../src/lib/auth';
import { useUnreadNotificationsCount } from '../../../../src/features/notifications/api';
import { usePendingAccounts } from '../../../../src/features/admin/approvals';
import { useDashboard } from '../../../../src/features/dashboard/api';
import { useUpcomingEvents } from '../../../../src/features/dashboard/extras';
import { useCampusQuery } from '../../../../src/hooks/useCampusQuery';
import { goToTab } from '../../../../src/lib/navigation';
import { plural } from '../../../../src/lib/domain';
import { B, FeatureCard, IconWell, ListCard, ListRow, SectionLabel } from '../../../../src/components/ui/brand';
import { EmptyState } from '../../../../src/components/ui/EmptyState';

const SIDE = 16;
const GAP = 10;
const FONT = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', light: 'Manrope_300Light' };
const MONTHS = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const WEEKDAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

// Skróty osobiste pokazane w „Teraz” jako liczniki — w karuzeli „Dla Ciebie” ich nie powtarzamy.
const IN_NOW = new Set(['my-work', 'notifications']);

// Zakładka „Moduły” — to samo menu co web (grupy Start / Ludzie / Służby / Komunikacja / Finanse /
// Narzędzia / Moje moduły, src/features/modules/nav.ts), ale każda część ma swój rytm:
// „Teraz” (żywe dane: wiadomości, najbliższe wydarzenie, liczniki) → karuzela „Dla Ciebie” →
// karty zespołów z Twoją rolą → siatka kafli → spokojna lista narzędzi → ustawienia.
// Kolory tylko z marki: papier, słód, kurkuma (bez tęczy, bez pasków-akcentów).
export default function ModulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuthSession();
  const { ready, groups, settings, personal, items, perms } = useModules();
  const unread = useUnreadNotificationsCount(user?.email ?? null);
  const canManageUsers = perms.can('action:settings:manage_users');
  const pending = usePendingAccounts(canManageUsers);
  const pendingCount = (pending.data ?? []).filter((a: { kind: string }) => a.kind === 'admin').length;
  const { selectedCampusId, withCampusFilter } = useCampusQuery();
  const dash = useDashboard(user?.email ?? null, { selectedCampusId, withCampusFilter });
  const hasChat = ready && perms.moduleVisible('komunikator');
  const hasCalendar = ready && perms.moduleVisible('calendar');
  const events = useUpcomingEvents(hasCalendar);
  const [query, setQuery] = useState('');

  const inner = width - SIDE * 2;
  const half = (inner - GAP) / 2;
  const q = query.trim();

  const unreadMessages = dash.data?.totalUnreadMessages ?? 0;
  const lastConversation = dash.data?.unreadConversations?.[0] ?? null;
  const openTasks = (dash.data?.myTasks ?? []).filter((t: { status?: string | null }) => !['done', 'completed', 'zrobione'].includes(String(t.status))).length;
  const invites = dash.data?.pendingInvitations?.length ?? 0;
  const unreadNotifications = unread.data ?? 0;
  const nextEvent = events.data?.[0] ?? null;
  const hasTasks = personal.some((p) => p.key === 'my-work');

  // Rola w służbie — lider / członek zespołu (jak ekran Zespoły).
  const roleOf = (key: string) => {
    const mine = perms.ministries.filter((m) => m.ministry_key === key);
    if (!mine.length) return null;
    return mine.some((m) => m.role === 'leader') ? 'leader' : 'member';
  };

  // Wyszukiwanie od początku słowa, także po słowach kluczowych (jak ⌘K na webie).
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
  const forYou = personal.filter((p) => !IN_NOW.has(p.key));

  const moduleRow = (it: ModuleItem) => (
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
  );

  // ── Klocki ─────────────────────────────────────────────────────────────────

  const ChatTile = ({ w }: { w: number }) => (
    <Pressable
      onPress={() => goToTab(router, 'messenger')}
      accessibilityRole="button"
      accessibilityLabel={unreadMessages > 0 ? `Komunikator, ${unreadMessages} nieprzeczytanych` : 'Komunikator'}
      className="active:opacity-85"
      style={{ width: w, minHeight: 176, borderRadius: 28, backgroundColor: B.ink, padding: 16, justifyContent: 'space-between' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <IconWell Icon={MessageCircle} tone="kurkuma" size={42} />
        {unreadMessages > 0 ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: B.kurkuma, marginTop: 4 }} /> : null}
      </View>
      <View>
        <Text style={{ fontSize: 34, lineHeight: 38, letterSpacing: -1.2, color: B.onDark, fontFamily: FONT.bold }}>
          {unreadMessages > 99 ? '99+' : unreadMessages}
        </Text>
        <Text style={{ fontSize: 13, color: B.onDarkMuted, fontFamily: FONT.semibold }}>
          {unreadMessages > 0 ? plural(unreadMessages, 'nowa wiadomość', 'nowe wiadomości', 'nowych wiadomości') : 'Wszystko przeczytane'}
        </Text>
        {lastConversation?.name ? (
          <Text numberOfLines={1} style={{ fontSize: 12, color: B.kurkuma, marginTop: 6, fontFamily: FONT.semibold }}>
            {lastConversation.name}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const EventTile = ({ w }: { w: number }) => {
    const d = nextEvent ? new Date(`${nextEvent.date}T12:00:00`) : null;
    return (
      <Pressable
        onPress={() => (nextEvent ? router.push(`/(app)/events/${nextEvent.id}` as never) : goToTab(router, 'calendar'))}
        accessibilityRole="button"
        accessibilityLabel={nextEvent ? `Najbliższe wydarzenie: ${nextEvent.title}` : 'Wydarzenia'}
        className="active:opacity-85"
        style={{ width: w, minHeight: 176, borderRadius: 28, backgroundColor: B.kurkuma, padding: 16, justifyContent: 'space-between' }}
      >
        <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: B.goldDeep, fontFamily: FONT.bold }}>
          {nextEvent ? 'Najbliższe' : 'Wydarzenia'}
        </Text>
        {d ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text style={{ fontSize: 40, lineHeight: 42, letterSpacing: -1.6, color: B.ink, fontFamily: FONT.bold }}>{d.getDate()}</Text>
              <Text style={{ fontSize: 15, marginBottom: 5, color: B.ink, fontFamily: FONT.semibold }}>{MONTHS[d.getMonth()]}</Text>
            </View>
            <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: FONT.semibold }}>
              {WEEKDAYS[d.getDay()]}{nextEvent?.time ? ` · ${nextEvent.time}` : ''}
            </Text>
            <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, marginTop: 6, color: B.ink, fontFamily: FONT.bold }}>
              {nextEvent?.title}
            </Text>
          </View>
        ) : (
          <View>
            <CalendarDays size={30} color={B.ink} strokeWidth={1.8} />
            <Text style={{ fontSize: 14, marginTop: 10, color: B.ink, fontFamily: FONT.bold }}>Nic nie zaplanowano</Text>
            <Text style={{ fontSize: 12, color: B.goldDeep, fontFamily: FONT.semibold }}>Otwórz kalendarz</Text>
          </View>
        )}
      </Pressable>
    );
  };

  const Counter = ({ Icon, value, label, onPress }: { Icon: LucideIcon; value: number; label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      className="active:opacity-80"
      style={{ flex: 1, borderRadius: 22, backgroundColor: B.card, paddingVertical: 12, paddingHorizontal: 12, gap: 8 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Icon size={18} color={value > 0 ? B.ink : B.ink4} strokeWidth={2} />
        {value > 0 ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: B.kurkuma }} /> : null}
      </View>
      <View>
        <Text style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.6, color: value > 0 ? B.ink : B.ink4, fontFamily: FONT.bold }}>
          {value > 99 ? '99+' : value}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 12, color: B.ink3, fontFamily: FONT.semibold }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );

  // Karta zespołu: rola widoczna kolorem karty (lider — słód, członek — jasna kurkuma).
  const TeamCard = ({ it }: { it: ModuleItem }) => {
    const role = roleOf(it.key);
    const dark = role === 'leader';
    const soft = role === 'member';
    return (
      <Pressable
        onPress={() => openModule(it, router)}
        accessibilityRole="button"
        accessibilityLabel={`${it.label}${role === 'leader' ? ', prowadzisz' : role === 'member' ? ', jesteś w zespole' : ''}`}
        className="active:opacity-85"
        style={{
          width: 148,
          height: 156,
          borderRadius: 26,
          padding: 14,
          justifyContent: 'space-between',
          backgroundColor: dark ? B.ink : soft ? B.kurkumaSoft : B.card,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <IconWell Icon={it.Icon} tone={dark ? 'kurkuma' : soft ? 'slod' : 'paper'} size={40} />
          {it.isWeb ? <ArrowUpRight size={15} color={dark ? B.onDarkMuted : B.ink4} strokeWidth={2} /> : null}
        </View>
        <View>
          <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 19, letterSpacing: -0.3, color: dark ? B.onDark : B.ink, fontFamily: FONT.bold }}>
            {it.label}
          </Text>
          {role ? (
            <Text style={{ fontSize: 12, marginTop: 3, color: dark ? B.kurkuma : B.goldDeep, fontFamily: FONT.semibold }}>
              {role === 'leader' ? 'Prowadzisz' : 'Jesteś w zespole'}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );
  };

  // Kafel siatki 1/2 szerokości.
  const GridTile = ({ it, w }: { it: ModuleItem; w: number }) => (
    <Pressable
      onPress={() => openModule(it, router)}
      accessibilityRole="button"
      accessibilityLabel={it.isWeb ? `${it.label}, otwiera się w przeglądarce` : it.label}
      className="active:opacity-80"
      style={{ width: w, minHeight: 112, borderRadius: 24, backgroundColor: B.card, padding: 14, justifyContent: 'space-between' }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <IconWell Icon={it.Icon} size={40} />
        {it.isWeb ? <ArrowUpRight size={15} color={B.ink4} strokeWidth={2} /> : null}
      </View>
      <View style={{ marginTop: 12 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 19, letterSpacing: -0.3, color: B.ink, fontFamily: FONT.bold }}>
          {it.label}
        </Text>
        {it.isWeb && it.hint ? (
          <Text numberOfLines={1} style={{ fontSize: 12, marginTop: 2, color: B.ink4, fontFamily: FONT.medium }}>
            {it.hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  const renderGroup = (g: ModuleGroup) => {
    if (g.id === 'ministries') {
      return (
        <View key={g.id}>
          <SectionLabel count={g.items.length}>{g.title}</SectionLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0, marginHorizontal: -SIDE }}
            contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
          >
            {g.items.map((it) => <TeamCard key={it.key} it={it} />)}
          </ScrollView>
        </View>
      );
    }
    // Narzędzia (głównie w przeglądarce) — spokojna lista dla odmiany rytmu.
    if (g.id === 'tools') {
      return (
        <View key={g.id}>
          <SectionLabel count={g.items.length}>{g.title}</SectionLabel>
          <ListCard>{g.items.map(moduleRow)}</ListCard>
        </View>
      );
    }
    return (
      <View key={g.id}>
        <SectionLabel count={g.items.length}>{g.title}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
          {g.items.map((it, i) => {
            // Nieparzysta liczba — ostatni kafel na całą szerokość, bez dziury w siatce.
            const lastOdd = g.items.length % 2 === 1 && i === g.items.length - 1;
            return <GridTile key={it.key} it={it} w={lastOdd ? inner : half} />;
          })}
        </View>
      </View>
    );
  };

  const now = new Date();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView
        style={{ flex: 1, backgroundColor: B.paper }}
        contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: insets.top + 18, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              perms.refetch();
              dash.refetch();
              events.refetch();
              unread.refetch();
            }}
            tintColor={B.ink}
          />
        }
      >
        {/* Nagłówek jak key visual marki: „Cały kościół. / Jedna aplikacja.” */}
        <View style={{ paddingHorizontal: 4, marginBottom: 18 }}>
          <Text style={{ fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: B.gold, fontFamily: FONT.semibold }}>
            {`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`}
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
            placeholder={ready ? `Szukaj wśród ${items.length + personal.length} modułów…` : 'Szukaj modułu…'}
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

            {/* ── Teraz: żywe dane zamiast samych nazw ── */}
            {hasChat || hasCalendar ? (
              <>
                <SectionLabel>Teraz</SectionLabel>
                <View style={{ flexDirection: 'row', gap: GAP }}>
                  {hasChat ? <ChatTile w={hasCalendar ? half : inner} /> : null}
                  {hasCalendar ? <EventTile w={hasChat ? half : inner} /> : null}
                </View>
              </>
            ) : null}
            <View style={{ flexDirection: 'row', gap: GAP, marginTop: hasChat || hasCalendar ? GAP : 18 }}>
              {hasTasks ? <Counter Icon={ClipboardCheck} value={openTasks} label="Zadania" onPress={() => router.push('/(app)/work' as never)} /> : null}
              <Counter Icon={HandHeart} value={invites} label="Do potwierdzenia" onPress={() => goToTab(router, 'dashboard')} />
              <Counter Icon={Bell} value={unreadNotifications} label="Powiadomienia" onPress={() => router.push('/(app)/notifications' as never)} />
            </View>

            {/* ── Dla Ciebie: karuzela kart ── */}
            {forYou.length > 0 ? (
              <>
                <SectionLabel count={forYou.length}>Dla Ciebie</SectionLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0, marginHorizontal: -SIDE }}
                  contentContainerStyle={{ paddingHorizontal: SIDE, gap: GAP }}
                >
                  {forYou.map((p) => (
                    <Pressable
                      key={p.key}
                      onPress={() => router.push(p.route as never)}
                      accessibilityRole="button"
                      accessibilityLabel={p.label}
                      className="active:opacity-75"
                      style={{ width: 112, height: 104, borderRadius: 22, backgroundColor: B.card, padding: 12, justifyContent: 'space-between' }}
                    >
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}>
                        <p.Icon size={18} color={B.ink} strokeWidth={2} />
                      </View>
                      <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 16, color: B.ink, fontFamily: FONT.bold }}>
                        {p.short}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}

            {groups.map(renderGroup)}

            {settings ? (
              <FeatureCard
                Icon={Settings2}
                title="Ustawienia kościoła"
                subtitle={settings.hint ?? 'Moduły, użytkownicy, wygląd'}
                onPress={() => openModule(settings, router)}
                style={{ marginTop: 24 }}
              />
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

            <Text style={{ marginTop: 22, paddingHorizontal: 4, fontSize: 12, lineHeight: 17, color: B.ink4, fontFamily: FONT.medium }}>
              {perms.fallback
                ? 'Nie udało się pobrać Twoich uprawnień, więc widzisz podstawowy zestaw. Pociągnij w dół, aby spróbować ponownie.'
                : 'Moduły ze strzałką ↗ otwierają się na stronie kościoła w przeglądarce, od razu zalogowane.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

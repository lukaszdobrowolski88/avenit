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
import { LayoutGrid, Search, X } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { ModuleTile } from '../../../src/features/modules/ModuleTile';
import { openModule, useModules } from '../../../src/features/modules/useModules';
import { useAuthSession } from '../../../src/lib/auth';
import { useUnreadNotificationsCount } from '../../../src/features/notifications/api';

const GAP = 10;
const SIDE = 16;

const SectionTitle = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 13,
      color: '#78716c',
      fontFamily: 'Inter_700Bold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 22,
      marginBottom: 10,
    }}
  >
    {children}
  </Text>
);

export default function ModulesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { user } = useAuthSession();
  const { ready, groups, personal, items, perms } = useModules();
  const unread = useUnreadNotificationsCount(user?.email ?? null);
  const [query, setQuery] = useState('');

  const tileWidth = Math.floor((width - SIDE * 2 - GAP * 2) / 3);
  const q = query.trim().toLowerCase();

  const filteredPersonal = useMemo(
    () => (q ? personal.filter((p) => p.label.toLowerCase().includes(q)) : personal),
    [personal, q],
  );
  const filteredGroups = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: q ? g.items.filter((it) => it.label.toLowerCase().includes(q)) : g.items }))
        .filter((g) => g.items.length > 0),
    [groups, q],
  );
  const nothingFound = q && filteredPersonal.length === 0 && filteredGroups.length === 0;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <PageHeader
          title="Moduły"
          subtitle={ready ? `${items.length + personal.length} dostępnych dla Ciebie` : 'Wczytywanie uprawnień…'}
          Icon={LayoutGrid}
        />
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingBottom: 130 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => perms.refetch()} tintColor="#ec4899" />
          }
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: '#f5f5f4',
              borderRadius: 14,
              paddingHorizontal: 12,
              height: 44,
            }}
          >
            <Search size={18} color="#a8a29e" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Szukaj modułu…"
              placeholderTextColor="#a8a29e"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 15, color: '#0c0a09', fontFamily: 'Inter_400Regular' }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10}>
                <X size={16} color="#a8a29e" />
              </Pressable>
            ) : null}
          </View>

          {!ready ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator color="#ec4899" />
            </View>
          ) : null}

          {ready && filteredPersonal.length > 0 ? (
            <>
              <SectionTitle>Dla Ciebie</SectionTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                {filteredPersonal.map((p) => (
                  <ModuleTile
                    key={p.key}
                    width={tileWidth}
                    label={p.label}
                    Icon={p.Icon}
                    tint={p.tint}
                    bg={p.bg}
                    badge={p.key === 'notifications' ? unread.data ?? 0 : undefined}
                    onPress={() => router.push(p.route as never)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {ready
            ? filteredGroups.map((g) => (
                <View key={g.section}>
                  <SectionTitle>{g.title}</SectionTitle>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
                    {g.items.map((it) => (
                      <ModuleTile
                        key={it.key}
                        width={tileWidth}
                        label={it.label}
                        Icon={it.Icon}
                        tint={it.tint}
                        bg={it.bg}
                        isWeb={it.isWeb}
                        onPress={() => openModule(it, router)}
                      />
                    ))}
                  </View>
                </View>
              ))
            : null}

          {nothingFound ? (
            <Text
              style={{
                marginTop: 32,
                textAlign: 'center',
                color: '#a8a29e',
                fontFamily: 'Inter_500Medium',
              }}
            >
              Brak modułu o nazwie „{query.trim()}”
            </Text>
          ) : null}

          {ready && !nothingFound ? (
            <Text
              style={{
                marginTop: 26,
                fontSize: 12,
                lineHeight: 17,
                color: '#a8a29e',
                fontFamily: 'Inter_500Medium',
              }}
            >
              {perms.fallback
                ? 'Nie udało się pobrać Twoich uprawnień, więc widzisz podstawowy zestaw. Pociągnij w dół, aby spróbować ponownie.'
                : 'Moduły ze strzałką ↗ otwierają się na stronie kościoła w przeglądarce, od razu zalogowane. Widzisz to samo co w wersji webowej.'}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </>
  );
}

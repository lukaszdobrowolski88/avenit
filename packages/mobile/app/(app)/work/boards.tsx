import { ActivityIndicator, ScrollView, StatusBar, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CloudOff, LayoutGrid, Lock } from 'lucide-react-native';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { B, ListCard, ListRow, SectionLabel } from '../../../src/components/ui/brand';
import { ModuleGate } from '../../../src/components/ModuleGate';
import { friendlyError } from '../../../src/lib/errors';
import { FONT as F } from '../../../src/lib/fonts';
import { useAuthSession } from '../../../src/lib/auth';
import { useProjectBoards, type BoardFolder, type ProjectBoard } from '../../../src/features/work/boards';
import { PullToRefresh } from '../../../src/components/ui/PullToRefresh';

// Lista tablic Projektów (jak web /projekty): aktywne tablice bez służb i szablonów, pogrupowane
// po folderach. Stuknięcie → tablica w widoku „Tabela” / „Kanban”. Tworzenie i edycja struktury
// tablic zostają na webie. Bramka module:boards — jak sama sekcja Projekty na webie.

const BoardDot = ({ color }: { color: string }) => (
  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: B.paper, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color }} />
  </View>
);

const BoardsList = () => {
  const router = useRouter();
  const { user } = useAuthSession();
  const q = useProjectBoards(user?.email ?? null);
  const folders: BoardFolder[] = q.data ?? [];
  const total = folders.reduce((n, f) => n + f.boards.length, 0);
  const open = (b: ProjectBoard) =>
    router.push({ pathname: '/(app)/work/[boardId]', params: { boardId: b.id } } as never);

  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title="Tablice" subtitle="Projekty" showBack />
      {q.isLoading ? (
        <ActivityIndicator color={B.ink} style={{ marginTop: 48 }} />
      ) : q.isError ? (
        <EmptyState
          Icon={CloudOff}
          title="Nie udało się wczytać tablic"
          hint={friendlyError(q.error, 'Sprawdź połączenie i spróbuj ponownie.')}
          actionLabel="Spróbuj ponownie"
          onAction={() => q.refetch()}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          refreshControl={<PullToRefresh onRefresh={() => q.refetch()} tintColor={B.ink} />}
        >
          {total === 0 ? (
            <EmptyState
              Icon={LayoutGrid}
              title="Brak tablic"
              hint="Nie ma jeszcze tablic projektów, które możesz zobaczyć. Tablice tworzy się w wersji przeglądarkowej."
            />
          ) : (
            folders.map((f) => (
              <View key={f.folder ?? '__none__'}>
                {folders.length > 1 || f.folder ? (
                  <SectionLabel count={f.boards.length}>{f.folder ?? 'Bez folderu'}</SectionLabel>
                ) : (
                  <View style={{ height: 6 }} />
                )}
                <ListCard>
                  {f.boards.map((b) => (
                    <ListRow
                      key={b.id}
                      leading={<BoardDot color={b.color} />}
                      title={b.name}
                      subtitle={b.description}
                      dividerInset={70}
                      right={
                        b.isPrivate ? (
                          <View accessibilityLabel="Prywatna" style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Lock size={14} color={B.ink4} />
                          </View>
                        ) : undefined
                      }
                      onPress={() => open(b)}
                    />
                  ))}
                </ListCard>
              </View>
            ))
          )}
          {total > 0 ? (
            <Text style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: B.ink4, fontFamily: F.medium }}>
              Nowe tablice i kolumny dodasz w wersji przeglądarkowej.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
};

export default function BoardsScreen() {
  return (
    <ModuleGate moduleKey="boards">
      <BoardsList />
    </ModuleGate>
  );
}

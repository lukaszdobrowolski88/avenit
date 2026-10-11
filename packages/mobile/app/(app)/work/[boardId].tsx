import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StatusBar, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CloudOff, Lock, SearchX } from 'lucide-react-native';
import { boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { B } from '../../../src/components/ui/brand';
import { FONT as F } from '../../../src/lib/fonts';
import { goBack } from '../../../src/lib/navigation';
import { friendlyError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { openTask } from '../../../src/lib/deep-links';
import { useMyProfile } from '../../../src/features/account/api';
import {
  boardMeta,
  useSetBoardLabel,
  useWorkBoard,
  useWorkBoardRealtime,
  type WorkBoard,
  type WorkBoardResult,
  type WorkBoardView,
} from '../../../src/features/work/boards';
import { LabelSheet, ViewSwitch } from '../../../src/features/work/components/boardBits';
import { BoardTable } from '../../../src/features/work/components/BoardTable';
import { BoardKanban } from '../../../src/features/work/components/BoardKanban';
import type { BoardColumn, BoardItem } from '../../../src/features/tasks/board';

// Tablica Projektów (Work OS) na telefonie: widok „Tabela” (grupy jako sekcje) albo „Kanban”
// (kolumny według statusu). Stuknięcie w kartę → ekran zadania; w pigułkę statusu → arkusz
// etykiet (zapis przez fn board-item-patch). Edycja tylko z prawem do zadań tej tablicy
// (globalnie albo w zakresie służby — moduleScope.js, ta sama reguła co serwer).
// Bez ModuleGate: o dostępie do tablicy rozstrzyga serwer (403 → „Brak dostępu”).
// Params: { boardId, view? ('table' | 'kanban') }.

type Ok = Extract<WorkBoardResult, { state: 'ok' }>;

export default function WorkBoardScreen() {
  const params = useLocalSearchParams<{ boardId?: string; view?: string }>();
  const boardId = typeof params.boardId === 'string' && params.boardId ? params.boardId : null;
  const router = useRouter();
  const q = useWorkBoard(boardId);
  const data: WorkBoardResult | undefined = q.data;
  useWorkBoardRealtime(data?.state === 'ok' ? boardId : null);

  // Powrót z ekranu zadania → dociągnij zmiany (pierwsze wejście ładuje samo zapytanie).
  const focusedOnce = useRef(false);
  const { refetch } = q;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refetch();
      focusedOnce.current = true;
    }, [refetch]),
  );

  if (data?.state === 'ok') {
    const initial = params.view === 'kanban' || params.view === 'table' ? params.view : null;
    return (
      <BoardBody
        d={data}
        initialView={initial}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        onOpen={(item) => openTask(router, item.id, item.board_id)}
      />
    );
  }

  let content: ReactNode;
  if (q.isLoading) {
    content = <ActivityIndicator color={B.ink} style={{ marginTop: 48 }} />;
  } else if (data?.state === 'forbidden') {
    content = (
      <EmptyState
        Icon={Lock}
        title="Brak dostępu do tablicy"
        hint="Ta tablica jest prywatna albo należy do służby, do której nie masz dostępu. Jeśli powinieneś ją widzieć, poproś właściciela lub administratora."
        actionLabel="Wróć"
        onAction={() => goBack(router)}
      />
    );
  } else if (data?.state === 'missing' || !boardId) {
    content = (
      <EmptyState
        Icon={SearchX}
        title="Nie znaleziono tablicy"
        hint="Mogła zostać usunięta albo link jest nieaktualny."
        actionLabel="Wróć"
        onAction={() => goBack(router)}
      />
    );
  } else {
    content = (
      <EmptyState
        Icon={CloudOff}
        title="Nie udało się wczytać tablicy"
        hint={friendlyError(q.error, 'Sprawdź połączenie i spróbuj ponownie.')}
        actionLabel="Spróbuj ponownie"
        onAction={() => q.refetch()}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title="Tablica" subtitle="Projekty" showBack />
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 120 }}>{content}</View>
    </View>
  );
}

const BoardBody = ({
  d,
  initialView,
  refreshing,
  onRefresh,
  onOpen,
}: {
  d: Ok;
  initialView: WorkBoardView | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (item: BoardItem) => void;
}) => {
  const { user } = useAuthSession();
  const email = user?.email ?? null;
  const perms = usePermissions();
  const profile = useMyProfile(email);
  const board: WorkBoard = d;
  const meta = useMemo(() => boardMeta(board.columns), [board.columns]);
  // Zadania tablicy służby edytuje lider/członek tej służby, Projektów — prawo globalne.
  const canEdit = perms.canModule(boardModuleKey(board.board), 'board_items', 'update');
  const [view, setView] = useState<WorkBoardView>(initialView ?? board.defaultView);
  // Widok zapisany na webie może dojść dopiero po pierwszym renderze (cache) — bez nadpisywania
  // wyboru, którego użytkownik już dokonał.
  const touched = useRef(!!initialView);
  useEffect(() => {
    if (!touched.current) setView(board.defaultView);
  }, [board.defaultView]);
  const pick = (v: WorkBoardView) => {
    touched.current = true;
    setView(v);
  };

  const setLabel = useSetBoardLabel(board.board.id, {
    email,
    name: profile.data?.full_name || profile.data?.name || null,
  });
  const [target, setTarget] = useState<{ item: BoardItem; column: BoardColumn } | null>(null);
  const onLabel = (item: BoardItem, column: BoardColumn) => {
    if (canEdit) setTarget({ item, column });
  };
  const apply = (labelId: string | null) => {
    const t = target;
    setTarget(null);
    if (!t || String(t.item.cells[t.column.id] ?? '') === (labelId ?? '')) return;
    setLabel.mutate(
      { item: t.item, column: t.column, labelId },
      { onError: (e: unknown) => toast.error(e, 'Nie udało się zmienić statusu') },
    );
  };

  const count = board.items.length;
  const isModuleBoard = !!boardModuleKey(board.board);

  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title={board.board.name} subtitle={isModuleBoard ? 'Tablica służby' : 'Projekty'} showBack />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingBottom: 12,
        }}
      >
        <ViewSwitch value={view} onChange={pick} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
          {count === 1 ? '1 zadanie' : `${count} ${plTasks(count)}`}
        </Text>
      </View>
      {board.board.description && view === 'table' ? (
        <Text
          numberOfLines={2}
          style={{ paddingHorizontal: 20, paddingBottom: 10, fontSize: 13, lineHeight: 18, color: B.ink3, fontFamily: F.medium }}
        >
          {board.board.description}
        </Text>
      ) : null}
      {view === 'table' ? (
        <BoardTable
          data={board}
          meta={meta}
          canEdit={canEdit}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpen={onOpen}
          onLabel={onLabel}
        />
      ) : (
        <BoardKanban
          data={board}
          meta={meta}
          canEdit={canEdit}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onOpen={onOpen}
          onLabel={onLabel}
        />
      )}
      <LabelSheet target={target} onPick={apply} onClose={() => setTarget(null)} />
    </View>
  );
};

// „2 zadania”, „5 zadań”, „22 zadania” (bez 1 — osobno).
const plTasks = (n: number) => {
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'zadania' : 'zadań';
};

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  CloudOff,
  CornerLeftUp,
  ExternalLink,
  Lock,
  MessageSquare,
  Pencil,
  RotateCcw,
  SearchX,
  UserPlus,
} from 'lucide-react-native';
import { boardModuleKey } from '@avenit/shared/src/permissions/moduleScope.js';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { DateField } from '../../../src/components/ui/DateField';
import { B, SectionLabel } from '../../../src/components/ui/brand';
import { FormInput, FormLabel, PrimaryButton, Sheet } from '../../../src/components/ui/Sheet';
import { goBack } from '../../../src/lib/navigation';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { friendlyError, showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { useMyProfile } from '../../../src/features/account/api';
import { openOnWeb } from '../../../src/features/modules/useModules';
import { normalizeModuleLabel } from '../../../src/features/modules/nav';
import {
  taskWebPath,
  useAddComment,
  useDeleteComment,
  useModulePaths,
  useTaskActivity,
  useTaskDetail,
  useTaskPatch,
  useTaskPeople,
  useTaskRealtime,
  useTaskUpdates,
  useToggleLike,
  type TaskDetail,
  type TaskPatch,
} from '../../../src/features/tasks/api';
import {
  activityText,
  boardColor,
  dueColumnOf,
  dueLabel,
  dueOf,
  doneLabelIn,
  isOverdueYmd,
  labelFor,
  labelsOf,
  openLabelIn,
  peopleColumnsOf,
  peopleIn,
  statusColumnOf,
  whenLabel,
  type BoardColumn,
  type Person,
} from '../../../src/features/tasks/board';
import { openTask } from '../../../src/features/tasks/navigation';
import { F, PersonAvatar, StatusPill } from '../../../src/features/tasks/components/bits';
import { OptionSheet, PeopleSheet } from '../../../src/features/tasks/components/Pickers';
import { TaskComments } from '../../../src/features/tasks/components/Comments';

// Zadanie (element dowolnej tablicy: Projekty, zakładka „Zadania” służby, zadania Kalendarza) —
// jak panel elementu na webie: status, osoby, termin, grupa, opis, podzadania, komentarze
// z @wzmiankami i dziennik zmian. Edycja tylko z prawem do zadań tej tablicy (globalnie albo
// w zakresie służby — moduleScope.js, ta sama reguła co serwer). Params: { id, boardId? }.

type Ok = Extract<TaskDetail, { state: 'ok' }>;

export default function TaskScreen() {
  const params = useLocalSearchParams<{ id?: string; boardId?: string }>();
  const itemId = typeof params.id === 'string' && params.id ? params.id : null;
  const boardId = typeof params.boardId === 'string' && params.boardId ? params.boardId : null;
  const router = useRouter();
  const q = useTaskDetail(itemId, boardId);
  useTaskRealtime(q.data?.state === 'ok' ? itemId : null);

  if (q.data?.state === 'ok') {
    return <TaskBody d={q.data} refreshing={q.isRefetching} onRefresh={() => q.refetch()} />;
  }

  let content: ReactNode;
  if (q.isLoading) {
    content = <ActivityIndicator color={B.ink} style={{ marginTop: 48 }} />;
  } else if (q.data?.state === 'forbidden') {
    content = (
      <EmptyState
        Icon={Lock}
        title="Brak dostępu do zadania"
        hint="To zadanie jest na tablicy, której nie widzisz (np. prywatnej albo innej służby). Jeśli powinieneś je widzieć, poproś lidera lub administratora o dostęp."
        actionLabel="Wróć"
        onAction={() => goBack(router)}
      />
    );
  } else if (q.data?.state === 'missing' || !itemId) {
    content = (
      <EmptyState
        Icon={SearchX}
        title="Nie znaleziono zadania"
        hint="Mogło zostać usunięte albo link jest nieaktualny."
        actionLabel="Wróć"
        onAction={() => goBack(router)}
      />
    );
  } else {
    content = (
      <EmptyState
        Icon={CloudOff}
        title="Nie udało się wczytać zadania"
        hint={friendlyError(q.error, 'Sprawdź połączenie i spróbuj ponownie.')}
        actionLabel="Spróbuj ponownie"
        onAction={() => q.refetch()}
      />
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader title="Zadanie" showBack />
      <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 120 }}>{content}</View>
    </View>
  );
}

type SheetState = null | 'status' | 'group' | 'edit' | { people: string };

const TaskBody = ({ d, refreshing, onRefresh }: { d: Ok; refreshing: boolean; onRefresh: () => void }) => {
  const { item, board, columns, groups, parent, subitems } = d;
  const router = useRouter();
  const { user } = useAuthSession();
  const myEmail = user?.email ?? null;
  const profile = useMyProfile(myEmail);
  const myName = profile.data?.full_name || profile.data?.name || user?.full_name || myEmail;
  const perms = usePermissions();
  const paths = useModulePaths();

  // Prawa jak na webie (BoardView.can): globalnie albo w zakresie służby tej tablicy.
  const moduleKey = boardModuleKey(board);
  const can = (table: string, op: string) => perms.canModule(moduleKey, table, op);
  const canEdit = can('board_items', 'update');
  const canComment = can('board_item_updates', 'create');
  const canLike = can('board_item_updates', 'update');
  const canDeleteComments = can('board_item_updates', 'delete');

  const people = useTaskPeople(canEdit || canComment);
  const updates = useTaskUpdates(item.id);
  const activity = useTaskActivity(item.id);
  const patch = useTaskPatch(item.id, { email: myEmail, name: myName ?? null });
  const addComment = useAddComment(item.id);
  const like = useToggleLike(item.id, myEmail);
  const delComment = useDeleteComment(item.id);

  const [tab, setTab] = useState<'comments' | 'activity'>('comments');
  const [sheet, setSheet] = useState<SheetState>(null);

  const statusCol = statusColumnOf(columns);
  const labels = useMemo(() => labelsOf(statusCol), [statusCol]);
  const status = labelFor(statusCol, statusCol ? item.cells[statusCol.id] : null);
  const done = isDoneLabel(status);
  const doneLabel = doneLabelIn(labels);
  const reopenLabel = openLabelIn(labels);
  const dueCol = dueColumnOf(columns);
  const due = dueOf(dueCol, item.cells);
  const overdue = !done && isOverdueYmd(due);
  const peopleCols = peopleColumnsOf(columns);
  const group = groups.find((g) => g.id === item.group_id) ?? null;
  const moduleLabel = moduleKey
    ? normalizeModuleLabel(perms.modules.find((m) => m.key === moduleKey)?.label) || null
    : null;
  const where = [moduleLabel || board.name, group?.name].filter(Boolean).join(' · ');

  const save = async (p: TaskPatch, okText?: string): Promise<boolean> => {
    try {
      await patch.mutateAsync({ item, columns, patch: p });
      if (okText) toast.success(okText);
      return true;
    } catch (e) {
      showError('Nie udało się zapisać zmian', e, 'Spróbuj ponownie.');
      return false;
    }
  };

  const setStatus = (labelId: string | null) => {
    if (!statusCol) return;
    void save({ cells: { [statusCol.id]: labelId } });
  };

  const sendComment = async (body: string, mentions: string[], parentId: string | null) => {
    try {
      await addComment.mutateAsync({
        item,
        board,
        body,
        mentions,
        parentId,
        actor: { email: myEmail, name: myName ?? null },
        paths,
      });
      return true;
    } catch (e) {
      showError('Nie udało się dodać komentarza', e, 'Spróbuj ponownie.');
      return false;
    }
  };

  const peopleSheetCol: BoardColumn | null =
    sheet && typeof sheet === 'object' ? peopleCols.find((c) => c.id === sheet.people) ?? null : null;

  const updatesList = updates.data ?? [];
  const activityList = activity.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: B.paper }}>
      <StatusBar barStyle="dark-content" />
      <PageHeader
        title={item.name.trim() || 'Bez nazwy'}
        subtitle={where || 'Zadanie'}
        showBack
        right={
          canEdit ? (
            <Pressable
              onPress={() => setSheet('edit')}
              accessibilityRole="button"
              accessibilityLabel="Edytuj nazwę i opis"
              hitSlop={8}
              className="active:opacity-60"
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Pencil size={18} color={B.ink} />
            </Pressable>
          ) : null
        }
      />
      {/* Pole komentarza w treści: iOS podsuwa je nad klawiaturę (automaticallyAdjustKeyboardInsets),
          Android — adjustResize okna. */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={B.ink} />}
      >
        {parent ? (
          <Pressable
            onPress={() => openTask(router, { itemId: parent.id, boardId: board.id })}
            accessibilityRole="link"
            className="active:opacity-70"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: B.paper2 }}
          >
            <CornerLeftUp size={14} color={B.ink3} />
            <Text numberOfLines={1} style={{ maxWidth: 260, fontSize: 13, color: B.ink2, fontFamily: F.semibold }}>
              Podzadanie: {parent.name || 'Bez nazwy'}
            </Text>
          </Pressable>
        ) : null}

        {/* Status + szybkie „gotowe” */}
        <View style={{ borderRadius: 22, backgroundColor: B.card, padding: 16, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ width: 84, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Status</Text>
            {statusCol ? (
              <Pressable
                onPress={canEdit ? () => setSheet('status') : undefined}
                disabled={!canEdit}
                accessibilityRole={canEdit ? 'button' : undefined}
                accessibilityLabel={`Status: ${status?.title ?? 'brak'}${canEdit ? '. Zmień' : ''}`}
                className="active:opacity-70"
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <StatusPill title={status?.title ?? null} color={status?.color ?? null} />
                {canEdit ? <ChevronRight size={16} color={B.ink4} /> : null}
              </Pressable>
            ) : (
              <Text style={{ flex: 1, fontSize: 14, color: B.ink4, fontFamily: F.medium }}>Tablica bez kolumny statusu</Text>
            )}
          </View>
          {canEdit && statusCol && doneLabel ? (
            done ? (
              reopenLabel ? (
                <Pressable
                  onPress={() => setStatus(reopenLabel.id)}
                  accessibilityRole="button"
                  className="active:opacity-70"
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 999, backgroundColor: B.paper2 }}
                >
                  <RotateCcw size={16} color={B.ink} />
                  <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Otwórz ponownie</Text>
                </Pressable>
              ) : null
            ) : (
              <Pressable
                onPress={() => void save({ cells: { [statusCol.id]: doneLabel.id } }, 'Zadanie gotowe')}
                accessibilityRole="button"
                className="active:opacity-80"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 999, backgroundColor: B.kurkuma }}
              >
                <CheckCircle2 size={18} color={B.ink} />
                <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>Oznacz jako gotowe</Text>
              </Pressable>
            )
          ) : null}
        </View>

        {/* Szczegóły */}
        <SectionLabel>Szczegóły</SectionLabel>
        <View style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
          {peopleCols.length === 0 ? null : (
            peopleCols.map((col, i) => (
              <PeopleRow
                key={col.id}
                label={col.name || 'Osoby'}
                people={peopleIn(item.cells[col.id])}
                first={i === 0}
                myEmail={myEmail}
                onPress={canEdit ? () => setSheet({ people: col.id }) : undefined}
              />
            ))
          )}

          {dueCol ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: peopleCols.length ? 1 : 0, borderTopColor: B.line }}>
              <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.semibold, marginBottom: 8 }}>{dueCol.name || 'Termin'}</Text>
              {canEdit && dueCol.type === 'date' ? (
                <DateField
                  value={due ?? ''}
                  optional
                  placeholder="Bez terminu"
                  onChange={(ymd) => void save({ cells: { [dueCol.id]: ymd || null } })}
                />
              ) : (
                <Text style={{ fontSize: 15, color: due ? B.ink : B.ink4, fontFamily: F.semibold }}>
                  {timelineText(dueCol, item.cells) || 'Bez terminu'}
                </Text>
              )}
              {overdue ? (
                <Text style={{ marginTop: 6, fontSize: 13, color: B.danger, fontFamily: F.bold }}>
                  Po terminie ({dueLabel(due)})
                </Text>
              ) : null}
            </View>
          ) : null}

          {groups.length > 0 ? (
            <Pressable
              onPress={canEdit && groups.length > 1 ? () => setSheet('group') : undefined}
              disabled={!canEdit || groups.length < 2}
              accessibilityRole={canEdit && groups.length > 1 ? 'button' : undefined}
              className="active:opacity-70"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 16,
                minHeight: 54,
                borderTopWidth: peopleCols.length || dueCol ? 1 : 0,
                borderTopColor: B.line,
              }}
            >
              <Text style={{ width: 84, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Grupa</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {group?.color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: boardColor(group.color) }} /> : null}
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: group ? B.ink : B.ink4, fontFamily: F.semibold }}>
                  {group?.name ?? 'Bez grupy'}
                </Text>
              </View>
              {canEdit && groups.length > 1 ? <ChevronRight size={16} color={B.ink4} /> : null}
            </Pressable>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              minHeight: 54,
              borderTopWidth: peopleCols.length || dueCol || groups.length ? 1 : 0,
              borderTopColor: B.line,
            }}
          >
            <Text style={{ width: 84, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>Tablica</Text>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
              {board.name}
            </Text>
          </View>
        </View>

        {/* Opis */}
        <SectionLabel>Opis</SectionLabel>
        <Pressable
          onPress={canEdit ? () => setSheet('edit') : undefined}
          disabled={!canEdit}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={canEdit ? 'Edytuj opis' : undefined}
          className="active:opacity-80"
          style={{ borderRadius: 22, backgroundColor: B.card, padding: 16 }}
        >
          <Text selectable style={{ fontSize: 15, lineHeight: 22, color: item.description ? B.ink2 : B.ink4, fontFamily: F.medium }}>
            {item.description?.trim() || (canEdit ? 'Dodaj opis, kontekst, linki…' : 'Brak opisu')}
          </Text>
        </Pressable>

        {/* Podzadania */}
        {subitems.length ? (
          <>
            <SectionLabel count={subitems.length}>Podzadania</SectionLabel>
            <View style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
              {subitems.map((s, i) => {
                const l = labelFor(statusCol, statusCol ? s.cells[statusCol.id] : null);
                const sDone = isDoneLabel(l);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => openTask(router, { itemId: s.id, boardId: board.id })}
                    accessibilityRole="link"
                    className="active:opacity-70"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, minHeight: 52, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: B.line }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ flex: 1, fontSize: 15, color: sDone ? B.ink4 : B.ink, fontFamily: F.semibold, textDecorationLine: sDone ? 'line-through' : 'none' }}
                    >
                      {s.name.trim() || 'Bez nazwy'}
                    </Text>
                    {l ? <StatusPill title={l.title} color={l.color} size="sm" /> : null}
                    <ChevronRight size={16} color={B.ink4} />
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Komentarze / Aktywność */}
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 22, marginBottom: 12 }}>
          <SegButton
            on={tab === 'comments'}
            onPress={() => setTab('comments')}
            icon={<MessageSquare size={15} color={tab === 'comments' ? '#FFFFFF' : B.ink2} />}
            label={updatesList.length ? `Komentarze · ${updatesList.length}` : 'Komentarze'}
          />
          <SegButton
            on={tab === 'activity'}
            onPress={() => setTab('activity')}
            icon={<Activity size={15} color={tab === 'activity' ? '#FFFFFF' : B.ink2} />}
            label="Aktywność"
          />
        </View>

        {tab === 'comments' ? (
          <TaskComments
            updates={updatesList}
            loading={updates.isLoading}
            people={people.data ?? []}
            peopleLoading={people.isLoading}
            myEmail={myEmail}
            canComment={canComment}
            canLike={canLike}
            canDelete={canDeleteComments}
            onSend={sendComment}
            onLike={(u) =>
              like.mutate(u, { onError: (e) => showError('Nie udało się zapisać reakcji', e) })
            }
            onDelete={(u) =>
              delComment.mutate(u.id, { onError: (e) => showError('Nie udało się usunąć komentarza', e) })
            }
          />
        ) : activity.isLoading ? (
          <ActivityIndicator color={B.ink} style={{ marginVertical: 20 }} />
        ) : activityList.length === 0 ? (
          <Text style={{ textAlign: 'center', paddingVertical: 22, fontSize: 14, color: B.ink3, fontFamily: F.medium }}>
            Brak zapisanych zmian.
          </Text>
        ) : (
          <View style={{ borderRadius: 22, backgroundColor: B.card, overflow: 'hidden' }}>
            {activityList.map((a, i) => (
              <View
                key={a.id}
                style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: B.line }}
              >
                <PersonAvatar name={a.actor_name || a.actor_email || 'System'} email={a.actor_email} size={26} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: F.medium }}>
                    <Text style={{ color: B.ink, fontFamily: F.bold }}>{a.actor_name || a.actor_email || 'System'}</Text>{' '}
                    {activityText(a, columns, groups)}
                  </Text>
                  <Text style={{ marginTop: 2, fontSize: 12, color: B.ink4, fontFamily: F.medium }}>{whenLabel(a.created_at)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Akcja drugorzędna: pełny widok na webie (pola, których apka nie edytuje). */}
        <Pressable
          onPress={() => void openOnWeb(taskWebPath(board, item.id, paths))}
          accessibilityRole="link"
          className="active:opacity-70"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26, height: 46, borderRadius: 999, borderWidth: 1, borderColor: B.fieldBorder }}
        >
          <ExternalLink size={16} color={B.ink2} />
          <Text style={{ fontSize: 14, color: B.ink2, fontFamily: F.semibold }}>Otwórz w przeglądarce</Text>
        </Pressable>
      </ScrollView>

      <OptionSheet
        visible={sheet === 'status'}
        title="Status"
        eyebrow={item.name || undefined}
        options={[...labels.map((l) => ({ id: l.id, title: l.title, color: l.color })), { id: null, title: 'Bez statusu' }]}
        selectedId={status?.id ?? null}
        onPick={setStatus}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'group'}
        title="Przenieś do grupy"
        eyebrow={item.name || undefined}
        options={groups.map((g) => ({ id: g.id, title: g.name, color: g.color }))}
        selectedId={item.group_id}
        onPick={(gid) => {
          if (gid && gid !== item.group_id) void save({ group_id: gid }, 'Przeniesiono');
        }}
        onClose={() => setSheet(null)}
      />
      <PeopleSheet
        visible={!!peopleSheetCol}
        title={peopleSheetCol?.name || 'Osoby'}
        people={people.data ?? []}
        loading={people.isLoading}
        selected={peopleSheetCol ? peopleIn(item.cells[peopleSheetCol.id]) : []}
        myEmail={myEmail}
        onSave={(picked: Person[]) =>
          peopleSheetCol
            ? save({ cells: { [peopleSheetCol.id]: picked.length ? picked : null } })
            : undefined
        }
        onClose={() => setSheet(null)}
      />
      <EditSheet
        visible={sheet === 'edit'}
        name={item.name}
        description={item.description ?? ''}
        onClose={() => setSheet(null)}
        onSave={async (name, description) => {
          const p: TaskPatch = {};
          if (name.trim() && name.trim() !== item.name) p.name = name.trim();
          if (description !== (item.description ?? '')) p.description = description.trim() ? description : null;
          if (!Object.keys(p).length) return true;
          return save(p, 'Zapisano');
        }}
      />
    </View>
  );
};

// Oś czasu tylko do odczytu („12 paź – 15 paź”), data — etykieta dnia.
const timelineText = (col: BoardColumn, cells: Record<string, unknown>): string => {
  const v = cells[col.id] as any;
  if (col.type !== 'timeline') return dueLabel(dueOf(col, cells));
  const s = typeof v?.start === 'string' ? v.start.slice(0, 10) : null;
  const e = typeof v?.end === 'string' ? v.end.slice(0, 10) : null;
  if (s && e && s !== e) return `${dueLabel(s)} – ${dueLabel(e)}`;
  return dueLabel(s || e);
};

const SegButton = ({ on, onPress, icon, label }: { on: boolean; onPress: () => void; icon: ReactNode; label: string }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="tab"
    accessibilityState={{ selected: on }}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: 999, backgroundColor: on ? B.ink : B.paper2 }}
  >
    {icon}
    <Text style={{ fontSize: 14, color: on ? '#FFFFFF' : B.ink2, fontFamily: F.bold }}>{label}</Text>
  </Pressable>
);

const PeopleRow = ({
  label,
  people,
  first,
  myEmail,
  onPress,
}: {
  label: string;
  people: Person[];
  first: boolean;
  myEmail: string | null;
  onPress?: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={`${label}: ${people.map((p) => p.name).join(', ') || 'nikt'}${onPress ? '. Zmień' : ''}`}
    className="active:opacity-70"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 54, borderTopWidth: first ? 0 : 1, borderTopColor: B.line }}
  >
    <Text numberOfLines={2} style={{ width: 84, fontSize: 13, color: B.ink3, fontFamily: F.semibold }}>
      {label}
    </Text>
    <View style={{ flex: 1, gap: 8 }}>
      {people.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onPress ? <UserPlus size={16} color={B.ink4} /> : null}
          <Text style={{ fontSize: 15, color: B.ink4, fontFamily: F.medium }}>{onPress ? 'Przypisz osoby' : 'Nikt'}</Text>
        </View>
      ) : (
        people.map((p) => (
          <View key={p.email} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PersonAvatar name={p.name} email={p.email} avatarUrl={p.avatar_url} size={26} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, color: B.ink, fontFamily: F.semibold }}>
              {p.name}
              {myEmail && p.email.toLowerCase() === myEmail.toLowerCase() ? ' (Ty)' : ''}
            </Text>
          </View>
        ))
      )}
    </View>
    {onPress ? <ChevronRight size={16} color={B.ink4} /> : null}
  </Pressable>
);

const EditSheet = ({
  visible,
  name,
  description,
  onClose,
  onSave,
}: {
  visible: boolean;
  name: string;
  description: string;
  onClose: () => void;
  onSave: (name: string, description: string) => Promise<boolean>;
}) => {
  const [n, setN] = useState(name);
  const [desc, setDesc] = useState(description);
  // Świeże wartości przy każdym otwarciu (realtime mógł zmienić element w międzyczasie).
  useEffect(() => {
    if (visible) {
      setN(name);
      setDesc(description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  return (
    <Sheet
      visible={visible}
      title="Edytuj zadanie"
      onClose={onClose}
      footer={
        <PrimaryButton
          label="Zapisz"
          disabled={!n.trim()}
          onPress={async () => {
            if (await onSave(n, desc)) onClose();
          }}
        />
      }
    >
      <FormLabel first>Nazwa</FormLabel>
      <FormInput value={n} onChangeText={setN} placeholder="Nazwa zadania" returnKeyType="done" />
      <FormLabel>Opis</FormLabel>
      <FormInput value={desc} onChangeText={setDesc} placeholder="Dodaj opis, kontekst, linki…" multiline />
    </Sheet>
  );
};

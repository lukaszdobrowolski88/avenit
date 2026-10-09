import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Briefcase, Calendar, Plus, Users } from 'lucide-react-native';
import { isDoneLabel } from '@avenit/shared/src/lib/boardStatus.js';
import { useAddTask, useSetTaskStatus, useTeamBoard, type BoardStatusLabel, type BoardTask, type TeamBoard } from '../data';
import { Card, Empty, Loading, dayLabel } from './ui';
import { EmptyState } from '../../../components/ui/EmptyState';
import { friendlyError } from '../../../lib/errors';
import { usePermissions } from '../../../lib/permissions';
import { useMyProfile } from '../../account/api';
import { openTask } from '../../../lib/deep-links';

// Zadania zespołu = tablica Projektów (boards.source_kind) jak ModuleBoard na webie.
// moduleKey — służba, do której należy tablica: lider/członek ma prawa do zadań SWOJEJ służby
// (canModule na board_items), nie tylko osoby z globalnym dostępem do Projektów.
export const TasksTab = ({
  sourceKind,
  boardId,
  moduleKey,
  boardTitle,
  myEmail,
}: {
  sourceKind: string | undefined;
  boardId?: string;
  moduleKey: string | null;
  boardTitle?: string | null;
  myEmail: string | null;
}) => {
  const router = useRouter();
  const perms = usePermissions();
  const profile = useMyProfile(myEmail);
  const actor = { email: myEmail, name: profile.data?.full_name || profile.data?.name || null };
  const board = useTeamBoard(sourceKind, boardId, boardTitle);
  const setStatus = useSetTaskStatus(sourceKind, boardId);
  const addTask = useAddTask(sourceKind, boardId);
  const [filter, setFilter] = useState<string>('open');
  const [draft, setDraft] = useState('');
  const canCreate = perms.canModule(moduleKey, 'board_items', 'create');
  const canUpdate = perms.canModule(moduleKey, 'board_items', 'update');

  const data: TeamBoard | undefined = board.data;
  const labels: BoardStatusLabel[] = data?.labels ?? [];
  // „Gotowe” = etykieta z flagą done albo nazwą „Zrobione/Gotowe…” — do filtra „Otwarte”.
  const doneIds = useMemo(() => new Set(labels.filter((l) => isDoneLabel(l)).map((l) => l.id)), [labels]);
  const labelOf = (id: string | null) => labels.find((l) => l.id === id) ?? null;

  const tasks = useMemo(() => {
    const all: BoardTask[] = data?.tasks ?? [];
    if (filter === 'open') return all.filter((t) => !t.statusId || !doneIds.has(t.statusId));
    if (filter === 'all') return all;
    return all.filter((t) => t.statusId === filter);
  }, [data?.tasks, filter, doneIds]);

  const changeStatus = (task: BoardTask) => {
    if (!canUpdate || !data?.statusColumnId || !labels.length) return;
    const apply = (labelId: string) =>
      setStatus.mutate(
        {
          itemId: task.id,
          boardId: data.boardId,
          statusColumnId: data.statusColumnId!,
          labelId,
          prevLabelId: task.statusId,
          actor,
        },
        { onError: (e: unknown) => Alert.alert('Nie udało się zmienić statusu', friendlyError(e, 'Spróbuj ponownie.')) },
      );
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title: task.name, options: [...labels.map((l) => l.title), 'Anuluj'], cancelButtonIndex: labels.length },
        (i) => {
          if (i < labels.length) apply(labels[i].id);
        },
      );
    } else {
      Alert.alert(task.name, 'Zmień status', [
        ...labels.map((l) => ({ text: l.title, onPress: () => apply(l.id) })),
        { text: 'Anuluj', style: 'cancel' as const },
      ]);
    }
  };

  const submit = () => {
    const name = draft.trim();
    if (!canCreate || !name || !data?.boardId) return;
    addTask.mutate(
      { boardId: data.boardId, groupId: data.firstGroupId, name, actor },
      {
        onSuccess: () => setDraft(''),
        onError: (e: unknown) => Alert.alert('Nie udało się dodać', friendlyError(e, 'Spróbuj ponownie.')),
      },
    );
  };

  if (!sourceKind && !boardId) return <Empty Icon={Briefcase} title="Brak tablicy zadań" />;
  if (board.isLoading) return <Loading />;
  // Błąd tablicy (także utworzenia jej przy pierwszym otwarciu) — widoczny, z ponowieniem.
  if (board.isError || !data?.boardId) {
    return (
      <EmptyState
        Icon={Briefcase}
        title="Nie udało się otworzyć zadań"
        hint={friendlyError(board.error, 'Spróbuj ponownie za chwilę.')}
        actionLabel="Spróbuj ponownie"
        onAction={() => board.refetch()}
      />
    );
  }

  return (
    <View>
      {canCreate ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 14,
            backgroundColor: '#ECE8DE',
            paddingLeft: 14,
            paddingRight: 6,
            height: 46,
            marginBottom: 12,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Nowe zadanie…"
            placeholderTextColor="#6E685A"
            returnKeyType="done"
            onSubmitEditing={submit}
            style={{ flex: 1, fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
          />
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || addTask.isPending}
            className="active:opacity-70"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: draft.trim() ? '#2A2312' : '#D3CCBC',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={18} color="#ffffff" strokeWidth={2.6} />
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {[{ id: 'open', title: 'Otwarte' }, { id: 'all', title: 'Wszystkie' }, ...labels].map((l) => {
          const on = filter === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => setFilter(l.id)}
              className="active:opacity-70"
              style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#FFF1C2' : '#ECE8DE' }}
            >
              <Text style={{ fontSize: 13, color: on ? '#8A6606' : '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>{l.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {tasks.length === 0 ? <Empty Icon={Briefcase} title="Brak zadań w tym widoku" /> : null}
      {tasks.map((t) => {
        const label = labelOf(t.statusId);
        return (
          // Karta → szczegóły zadania (opis, komentarze, osoby); pigułka statusu — szybka zmiana.
          <Card key={t.id} onPress={() => openTask(router, t.id, data.boardId)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{t.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  {t.date ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} color="#6E685A" />
                      <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>{dayLabel(t.date)}</Text>
                    </View>
                  ) : null}
                  {t.people.length ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Users size={11} color="#6E685A" />
                      <Text numberOfLines={1} style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                        {t.people.join(', ')}
                      </Text>
                    </View>
                  ) : null}
                  {t.groupName ? <Text style={{ fontSize: 12, color: '#6E685A', fontFamily: 'Manrope_500Medium' }}>{t.groupName}</Text> : null}
                </View>
              </View>
              <Pressable
                onPress={() => changeStatus(t)}
                disabled={!canUpdate || !data.statusColumnId}
                accessibilityRole={canUpdate ? 'button' : 'text'}
                accessibilityLabel={canUpdate ? `Status: ${label?.title ?? 'brak'}. Zmień status` : `Status: ${label?.title ?? 'brak'}`}
                className="active:opacity-70"
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: label ? `${label.color}22` : '#E6E1D5',
                }}
              >
                <Text style={{ fontSize: 12, color: label?.color ?? '#4A463E', fontFamily: 'Manrope_700Bold' }}>
                  {label?.title ?? (canUpdate ? 'Ustaw status' : 'Bez statusu')}
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
    </View>
  );
};

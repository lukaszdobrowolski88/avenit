import { useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Briefcase, Calendar, Plus, Users } from 'lucide-react-native';
import { useAddTask, useSetTaskStatus, useTeamBoard, type BoardStatusLabel, type BoardTask, type TeamBoard } from '../data';
import { Card, Empty, Loading } from './ui';

// Zadania zespołu = tablica Projektów (boards.source_kind) jak ModuleBoard na webie.
export const TasksTab = ({
  sourceKind,
  boardId,
  myEmail,
}: {
  sourceKind: string | undefined;
  boardId?: string;
  myEmail: string | null;
}) => {
  const board = useTeamBoard(sourceKind, boardId);
  const setStatus = useSetTaskStatus(sourceKind, boardId);
  const addTask = useAddTask(sourceKind, boardId);
  const [filter, setFilter] = useState<string>('open');
  const [draft, setDraft] = useState('');

  const data: TeamBoard | undefined = board.data;
  const labels: BoardStatusLabel[] = data?.labels ?? [];
  // „Gotowe” = etykieta done / „Zrobione” — do filtra „Otwarte”.
  const doneIds = useMemo(
    () => new Set(labels.filter((l) => /done|zrobion|gotow|zakończ/i.test(`${l.id} ${l.title}`)).map((l) => l.id)),
    [labels],
  );
  const labelOf = (id: string | null) => labels.find((l) => l.id === id) ?? null;

  const tasks = useMemo(() => {
    const all: BoardTask[] = data?.tasks ?? [];
    if (filter === 'open') return all.filter((t) => !t.statusId || !doneIds.has(t.statusId));
    if (filter === 'all') return all;
    return all.filter((t) => t.statusId === filter);
  }, [data?.tasks, filter, doneIds]);

  const changeStatus = (task: BoardTask) => {
    if (!data?.statusColumnId || !labels.length) return;
    const apply = (labelId: string) =>
      setStatus.mutate(
        { itemId: task.id, cells: data.cellsById[task.id] ?? {}, statusColumnId: data.statusColumnId!, labelId },
        { onError: (e: any) => Alert.alert('Nie udało się zmienić statusu', e?.message ?? '') },
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
    if (!name || !data?.boardId) return;
    addTask.mutate(
      { boardId: data.boardId, groupId: data.firstGroupId, name, createdBy: myEmail },
      {
        onSuccess: () => setDraft(''),
        onError: (e: any) => Alert.alert('Nie udało się dodać', e?.message ?? ''),
      },
    );
  };

  if (board.isLoading) return <Loading />;
  if (!data?.boardId) {
    return <Empty Icon={Briefcase} title="Zespół nie ma jeszcze tablicy zadań" hint="Tablica powstaje przy pierwszym otwarciu zakładki Zadania na webie." />;
  }

  return (
    <View>
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
          placeholderTextColor="#857F70"
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
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>{t.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                  {t.date ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Calendar size={11} color="#857F70" />
                      <Text style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>{t.date}</Text>
                    </View>
                  ) : null}
                  {t.people.length ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Users size={11} color="#857F70" />
                      <Text numberOfLines={1} style={{ fontSize: 12, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                        {t.people.join(', ')}
                      </Text>
                    </View>
                  ) : null}
                  {t.groupName ? <Text style={{ fontSize: 12, color: '#857F70', fontFamily: 'Manrope_500Medium' }}>{t.groupName}</Text> : null}
                </View>
              </View>
              <Pressable
                onPress={() => changeStatus(t)}
                className="active:opacity-70"
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: label ? `${label.color}22` : '#E6E1D5',
                }}
              >
                <Text style={{ fontSize: 12, color: label?.color ?? '#4A463E', fontFamily: 'Manrope_700Bold' }}>
                  {label?.title ?? 'Ustaw status'}
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
    </View>
  );
};

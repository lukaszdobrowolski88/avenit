import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  FileText,
  MoreHorizontal,
  Plus,
  StickyNote,
  Users as UsersIcon,
} from 'lucide-react-native';
import { formatDate, type ProgramScheduleItem } from '../../../src/lib/domain';
import {
  useLinkProgram,
  useMyAssignments,
  useProgramDetail,
  useProgramEventLinks,
  useProgramTeam,
  useSaveSchedule,
  useSongTitles,
  useUpdateProgramNotes,
  type LinkedEvent,
  type MyAssignmentRow,
  type ProgramTeamMember,
} from '../../../src/features/programs/api';
import { AssignmentCard } from '../../../src/features/programs/components/AssignmentCard';
import { PlanList } from '../../../src/features/programs/components/PlanList';
import { ScheduleItemEditor } from '../../../src/features/programs/components/ScheduleItemEditor';
import { ProgramFormModal } from '../../../src/features/programs/components/ProgramFormModal';
import { EventPickerSheet } from '../../../src/features/programs/components/LinkPickers';
import { PlanReorder } from '../../../src/features/programs/components/PlanReorder';
import {
  DuplicateProgramModal,
  SaveTemplateModal,
  SendEmailSheet,
  TemplatesSheet,
} from '../../../src/features/programs/components/ProgramTools';
import {
  KIND_META,
  fmtDuration,
  newItemId,
  newPlanItem,
  totalSeconds,
  type PlanItem,
  type ScheduleKind,
} from '../../../src/features/programs/schedule';
import { useAuthSession } from '../../../src/lib/auth';
import { usePermissions } from '../../../src/lib/permissions';
import { useCampusQuery } from '../../../src/hooks/useCampusQuery';
import { goBack } from '../../../src/lib/navigation';
import { friendlyError } from '../../../src/lib/errors';

type TabKey = 'schedule' | 'team' | 'notes';

const ProgramTab = ({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}) => (
  <Pressable
    onPress={onPress}
    style={{
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      backgroundColor: active ? '#F6F4EE' : 'transparent',
      shadowColor: active ? '#2A2312' : 'transparent',
      shadowOpacity: active ? 0.08 : 0,
      shadowRadius: active ? 4 : 0,
      shadowOffset: { width: 0, height: 1 },
      elevation: active ? 2 : 0,
    }}
  >
    <Text
      style={{
        fontSize: 13,
        color: active ? '#8A6606' : '#6B6557',
        fontFamily: 'Manrope_600SemiBold',
      }}
    >
      {label}
      {count !== undefined && count > 0 ? ` · ${count}` : ''}
    </Text>
  </Pressable>
);

// Nazwy służb w zakładce „Zespół” — jeden spokojny styl marki dla wszystkich (bez tęczy kolorów).
const TEAM_NAMES: Record<string, string> = {
  worship: 'Zespół Uwielbienia',
  media: 'MediaTeam',
  produkcja: 'MediaTeam',
  atmosfera: 'Atmosfera Team',
  atmosfera_team: 'Atmosfera Team',
  scena: 'Scena',
  mc: 'MC',
  kids: 'Dzieci',
};
const TEAM_STYLE = { tint: '#2A2312', bg: '#F6F4EE' };

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const programId = Number(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthSession();
  const perms = usePermissions();
  const { campusIdForInsert } = useCampusQuery();
  const programQuery = useProgramDetail(id ?? '');
  const assignmentsQuery = useMyAssignments(id ?? '', user?.email ?? null);
  const teamQuery = useProgramTeam(id ?? '');
  const links = useProgramEventLinks();
  const saveSchedule = useSaveSchedule(programId);
  const link = useLinkProgram();
  const [tab, setTab] = useState<TabKey>('schedule');
  const [editingHeader, setEditingHeader] = useState(false);
  const [pickingEvent, setPickingEvent] = useState(false);
  // Edytor elementu: indeks istniejącego albo nowy element (dodawany na końcu).
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [newItem, setNewItem] = useState<PlanItem | null>(null);
  // Narzędzia z menu „⋯”.
  const [reorder, setReorder] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const canEdit = perms.can('res:programs:update');
  const canCreate = perms.can('res:programs:create');
  const canLinkEvents = perms.can('res:events:update');
  const canSaveTemplate = perms.can('res:program_templates:create');
  const canDeleteTemplate = perms.can('res:program_templates:delete');
  // Serwer pilnuje tego samego (FN_CAPABILITY: send-program-email → action:programs:send_email).
  const canSendEmail = perms.can('action:programs:send_email');

  const schedule = (programQuery.data?.schedule ?? []) as PlanItem[];
  const songTitles = useSongTitles(schedule.filter((it) => it?.type === 'song' && it?.songId != null).map((it) => it.songId as number));

  const teamGrouped = useMemo(() => {
    const map = new Map<string, typeof teamQuery.data>();
    for (const m of teamQuery.data ?? []) {
      const arr = map.get(m.team_type) ?? [];
      arr.push(m);
      map.set(m.team_type, arr);
    }
    return Array.from(map.entries());
  }, [teamQuery.data]);

  if (programQuery.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F4EE' }}>
        <ActivityIndicator color="#2A2312" />
      </View>
    );
  }
  const program = programQuery.data;
  if (programQuery.isError || !program) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F6F4EE', paddingTop: insets.top + 10, paddingHorizontal: 20 }}>
        <Pressable
          onPress={() => goBack(router)}
          hitSlop={10}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ textAlign: 'center', color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
            {programQuery.isError ? friendlyError(programQuery.error, 'Nie udało się wczytać programu.') : 'Program nie istnieje albo został usunięty.'}
          </Text>
        </View>
      </View>
    );
  }

  const total = totalSeconds(schedule);
  const songsCount = schedule.filter((it) => it?.type === 'song').length;
  const teamCount = (teamQuery.data ?? []).length;
  const itemsWithNotes = schedule.filter(
    (it) =>
      (it.notes && it.notes.trim().length > 0) ||
      (Array.isArray(it.customAttachments) && it.customAttachments.length > 0),
  );
  const notesCount = itemsWithNotes.length + (String((program as any).notes ?? '').trim() ? 1 : 0);
  const programDate = String(program.date).slice(0, 10);
  const linked = (links.data ?? []).filter((e: LinkedEvent) => e.programId === programId);
  const programTitle = (program.title && String(program.title).trim()) || 'Nabożeństwo';
  const dateLabel = (() => {
    const out = formatDate(program.date, 'EEEE, d MMMM yyyy');
    return out.charAt(0).toUpperCase() + out.slice(1);
  })();

  // Menu „⋯” — akcje jak pasek narzędzi edytora programu na webie (bez eksportów).
  const actions: { label: string; run: () => void; destructive?: boolean }[] = [
    ...(canEdit ? [{ label: 'Edytuj nazwę, datę i kategorię', run: () => setEditingHeader(true) }] : []),
    ...(canEdit && schedule.length > 1 ? [{ label: 'Zmień kolejność planu', run: () => { setTab('schedule'); setReorder(true); } }] : []),
    ...(canCreate ? [{ label: 'Duplikuj program', run: () => setDuplicating(true) }] : []),
    ...(canSaveTemplate && schedule.length ? [{ label: 'Zapisz plan jako szablon', run: () => setSavingTemplate(true) }] : []),
    ...(canEdit ? [{ label: 'Wczytaj szablon', run: () => setLoadingTemplate(true) }] : []),
    ...(canSendEmail ? [{ label: 'Wyślij e-mailem', run: () => setEmailing(true) }] : []),
  ];
  const openMenu = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...actions.map((a) => a.label), 'Anuluj'], cancelButtonIndex: actions.length, title: programTitle },
        (i) => actions[i]?.run(),
      );
    } else {
      Alert.alert(programTitle, undefined, [
        ...actions.map((a) => ({ text: a.label, onPress: a.run })),
        { text: 'Anuluj', style: 'cancel' as const },
      ]);
    }
  };

  // ── Zmiany planu: zapis od razu (optymistycznie) ──
  const persist = (next: PlanItem[]) =>
    saveSchedule.mutate(next as never, {
      onError: (e: unknown) => Alert.alert('Nie udało się zapisać planu', friendlyError(e, 'Spróbuj ponownie.')),
    });
  const closeEditor = () => {
    setEditIndex(null);
    setNewItem(null);
  };
  const saveItem = (item: PlanItem) => {
    if (newItem) persist([...schedule, item]);
    else if (editIndex != null) persist(schedule.map((it, i) => (i === editIndex ? item : it)));
    closeEditor();
  };
  const moveItem = (dir: -1 | 1) => {
    if (editIndex == null) return;
    const j = editIndex + dir;
    if (j < 0 || j >= schedule.length) return;
    const next = schedule.slice();
    [next[editIndex], next[j]] = [next[j], next[editIndex]];
    persist(next);
    setEditIndex(j);
  };
  const duplicateItem = () => {
    if (editIndex == null) return;
    const copy = { ...schedule[editIndex], id: newItemId() as unknown as string };
    persist([...schedule.slice(0, editIndex + 1), copy, ...schedule.slice(editIndex + 1)]);
    closeEditor();
  };
  const deleteItem = () => {
    if (editIndex == null) return;
    const it = schedule[editIndex];
    Alert.alert('Usunąć element?', `„${it?.title || KIND_META[(it?.type as ScheduleKind) ?? 'item']?.label || 'Element'}” zniknie z planu.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          persist(schedule.filter((_, i) => i !== editIndex));
          closeEditor();
        },
      },
    ]);
  };

  const pickEvent = (ev: { id: number; title: string; hasOtherProgram: boolean }) => {
    const go = () =>
      link.mutate(
        { eventId: ev.id, programId },
        {
          onSuccess: () => setPickingEvent(false),
          onError: (e: unknown) => Alert.alert('Nie udało się podpiąć', friendlyError(e, 'Spróbuj ponownie.')),
        },
      );
    if (ev.hasOtherProgram) {
      Alert.alert('Zastąpić program?', `„${ev.title}” ma już podpięty inny program.`, [
        { text: 'Anuluj', style: 'cancel' },
        { text: 'Zastąp', onPress: go },
      ]);
    } else go();
  };
  const unlinkEvent = (ev: { id: number; title: string }) =>
    Alert.alert(ev.title, 'Co zrobić z tym wydarzeniem?', [
      { text: 'Otwórz wydarzenie', onPress: () => router.push({ pathname: '/(app)/events/[id]', params: { id: String(ev.id) } }) },
      ...(canLinkEvents
        ? [
            {
              text: 'Odepnij program',
              style: 'destructive' as const,
              onPress: () =>
                link.mutate(
                  { eventId: ev.id, programId: null },
                  { onError: (e: unknown) => Alert.alert('Nie udało się odpiąć', friendlyError(e, 'Spróbuj ponownie.')) },
                ),
            },
          ]
        : []),
      { text: 'Anuluj', style: 'cancel' as const },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 6, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => goBack(router)}
            hitSlop={10}
            style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color="#2A2312" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#8A6606', fontFamily: 'Manrope_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {dateLabel}
            </Text>
            <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 22, lineHeight: 27, color: '#2A2312', letterSpacing: -0.5, fontFamily: 'Manrope_700Bold' }}>
              {programTitle}
            </Text>
          </View>
          {actions.length ? (
            <Pressable
              onPress={openMenu}
              hitSlop={10}
              accessibilityLabel="Więcej akcji"
              className="active:opacity-60"
              style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
            >
              <MoreHorizontal size={20} color="#2A2312" />
            </Pressable>
          ) : null}
        </View>

        {/* Podpięte wydarzenia */}
        {linked.length || canLinkEvents ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ gap: 6 }}>
            {linked.map((e: LinkedEvent) => (
              <Pressable
                key={e.id}
                onPress={() => unlinkEvent(e)}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF1C2' }}
              >
                <CalendarIcon size={14} color="#6B4F05" />
                <Text numberOfLines={1} style={{ maxWidth: 220, fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                  {e.title}
                  {e.date !== programDate ? ` · ${e.date.split('-').reverse().slice(0, 2).join('.')}` : e.time ? ` · ${e.time}` : ''}
                </Text>
              </Pressable>
            ))}
            {canLinkEvents ? (
              <Pressable
                onPress={() => setPickingEvent(true)}
                className="active:opacity-70"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#ECE8DE' }}
              >
                <Plus size={14} color="#2A2312" />
                <Text style={{ fontSize: 13, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                  {linked.length ? 'Podepnij do kolejnego' : 'Podepnij do wydarzenia'}
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}

        {assignmentsQuery.data && assignmentsQuery.data.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 11, color: '#8A6606', marginBottom: 8, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}>
              Twoje przypisania
            </Text>
            {assignmentsQuery.data.map((a: MyAssignmentRow) => (
              <AssignmentCard key={String(a.id)} assignment={a} />
            ))}
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: '#ECE8DE', marginHorizontal: 16, padding: 4, borderRadius: 14 }}>
        <ProgramTab label="Plan" active={tab === 'schedule'} onPress={() => setTab('schedule')} count={schedule.length} />
        <ProgramTab label="Zespół" active={tab === 'team'} onPress={() => setTab('team')} count={teamCount} />
        <ProgramTab label="Notatki" active={tab === 'notes'} onPress={() => setTab('notes')} count={notesCount} />
      </View>

      <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ padding: 16, paddingBottom: 130 }}>
        {tab === 'schedule' && reorder && (
          <PlanReorder
            items={schedule}
            setScrollEnabled={setScrollEnabled}
            onCancel={() => setReorder(false)}
            onDone={(next) => {
              persist(next);
              setReorder(false);
            }}
          />
        )}
        {tab === 'schedule' && !reorder && (
          <View>
            {schedule.length ? (
              <>
                <Text style={{ marginBottom: 10, marginLeft: 4, fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_600SemiBold' }}>
                  {[`${schedule.length} elem.`, songsCount ? `${songsCount} pieśni` : null, total ? `łącznie ${fmtDuration(total)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  {saveSchedule.isPending ? ' · zapisywanie…' : ''}
                </Text>
                {canEdit && schedule.length > 1 ? (
                  <Pressable onPress={() => setReorder(true)} hitSlop={8} style={{ position: 'absolute', right: 4, top: 0 }}>
                    <Text style={{ fontSize: 13, color: '#8A6606', fontFamily: 'Manrope_700Bold' }}>Zmień kolejność</Text>
                  </Pressable>
                ) : null}
                <PlanList items={schedule} songs={songTitles.data} onPressItem={canEdit ? (i) => setEditIndex(i) : undefined} />
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFF1C2', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <ClipboardList size={24} color="#8A6606" />
                </View>
                <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>Plan jest pusty</Text>
                <Text style={{ marginTop: 4, fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_500Medium', textAlign: 'center' }}>
                  {canEdit ? 'Dodaj pierwszy punkt — np. nagłówek „Uwielbienie” i pieśni.' : 'Plan uzupełnia osoba przygotowująca program.'}
                </Text>
              </View>
            )}

            {canEdit ? (
              <View style={{ marginTop: 14 }}>
                <Text style={{ marginLeft: 4, marginBottom: 8, fontSize: 12, color: '#8A6606', fontFamily: 'Manrope_700Bold', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Dodaj do planu
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(Object.keys(KIND_META) as ScheduleKind[]).map((k) => {
                    const { Icon, label } = KIND_META[k];
                    return (
                      <Pressable
                        key={k}
                        onPress={() => setNewItem(newPlanItem(k))}
                        className="active:opacity-70"
                        style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 18, backgroundColor: '#FFFFFF' }}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: k === 'song' ? '#FFF1C2' : '#F6F4EE', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={16} color={k === 'song' ? '#8A6606' : '#2A2312'} />
                        </View>
                        <Text style={{ fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {tab === 'team' && (
          <View>
            {teamQuery.isLoading ? (
              <ActivityIndicator color="#2A2312" />
            ) : teamGrouped.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#FFF8E1', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <UsersIcon size={24} color="#8A6606" />
                </View>
                <Text style={{ fontSize: 13, color: '#6B6557', fontFamily: 'Manrope_500Medium', textAlign: 'center' }}>
                  Brak przypisanego zespołu.{linked.length ? '\nSłużby ustawiasz na podpiętym wydarzeniu.' : ''}
                </Text>
              </View>
            ) : (
              teamGrouped.map(([teamType, members]) => {
                const meta = { label: TEAM_NAMES[teamType] ?? teamType, ...TEAM_STYLE };
                return (
                  <View key={teamType} className="mb-4" style={{ borderRadius: 20, backgroundColor: '#FFFFFF' }}>
                    <View className="overflow-hidden" style={{ borderRadius: 20 }}>
                      <View
                        className="flex-row items-center justify-between px-4 py-3"
                        style={{ backgroundColor: meta.bg, borderBottomWidth: 1, borderBottomColor: '#E6E1D5' }}
                      >
                        <Text className="text-[15px]" style={{ color: meta.tint, letterSpacing: -0.3, fontFamily: 'Manrope_700Bold' }}>
                          {meta.label}
                        </Text>
                        <View className="px-2 py-0.5" style={{ borderRadius: 999, backgroundColor: '#F6F4EE' }}>
                          <Text className="text-[11px]" style={{ color: meta.tint, fontFamily: 'Manrope_700Bold' }}>
                            {members?.length ?? 0}
                          </Text>
                        </View>
                      </View>
                      <View className="px-3 py-2">
                        {members?.map((m: ProgramTeamMember, idx: number) => (
                          <View
                            key={m.id}
                            className="flex-row items-center gap-3 px-2 py-2.5"
                            style={{ borderBottomWidth: idx < (members?.length ?? 0) - 1 ? 1 : 0, borderBottomColor: '#ECE8DE' }}
                          >
                            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ color: meta.tint, fontFamily: 'Manrope_700Bold', fontSize: 13 }}>
                                {(m.assigned_name || '?').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <Text className="text-[14px]" style={{ color: '#2A2312', letterSpacing: -0.2, fontFamily: 'Manrope_600SemiBold' }} numberOfLines={1}>
                                {m.assigned_name}
                              </Text>
                              <Text className="text-[12px] mt-0.5" style={{ color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
                                {m.role_key}
                              </Text>
                            </View>
                            <View
                              className="px-2 py-0.5"
                              style={{
                                borderRadius: 999,
                                backgroundColor: m.status === 'accepted' ? '#d1fae5' : m.status === 'rejected' ? '#ffe4e6' : '#FFF1C2',
                              }}
                            >
                              <Text
                                className="text-[10px]"
                                style={{
                                  color: m.status === 'accepted' ? '#047857' : m.status === 'rejected' ? '#be123c' : '#8A6606',
                                  fontFamily: 'Manrope_700Bold',
                                }}
                              >
                                {m.status === 'accepted' ? 'Potwierdzone' : m.status === 'rejected' ? 'Odmowa' : 'Czeka na odpowiedź'}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'notes' && (
          <View>
            <ProgramNotes programId={programId} initial={String((program as any).notes ?? '')} editable={canEdit} />
            <NotesView items={itemsWithNotes} />
          </View>
        )}
      </ScrollView>

      <ScheduleItemEditor
        visible={editIndex != null || newItem != null}
        item={newItem ?? (editIndex != null ? schedule[editIndex] ?? null : null)}
        isNew={!!newItem}
        programId={programId}
        canMoveUp={editIndex != null && editIndex > 0}
        canMoveDown={editIndex != null && editIndex < schedule.length - 1}
        onClose={closeEditor}
        onSave={saveItem}
        onDelete={deleteItem}
        onMove={moveItem}
        onDuplicate={duplicateItem}
      />
      {canEdit ? (
        <ProgramFormModal
          visible={editingHeader}
          initial={{ id: programId, title: program.title ?? null, date: programDate, typeId: (program as any).type_id ?? null }}
          userEmail={user?.email ?? null}
          campusIdForInsert={campusIdForInsert}
          canDelete={perms.can('res:programs:delete')}
          onClose={() => setEditingHeader(false)}
          onDeleted={() => goBack(router)}
        />
      ) : null}
      {canCreate ? (
        <DuplicateProgramModal
          visible={duplicating}
          programId={programId}
          programDate={programDate}
          campusIdForInsert={campusIdForInsert}
          onClose={() => setDuplicating(false)}
          onDone={(id) => router.push({ pathname: '/(app)/programs/[id]', params: { id: String(id) } })}
        />
      ) : null}
      {canSaveTemplate ? (
        <SaveTemplateModal visible={savingTemplate} defaultName={programTitle} schedule={schedule} onClose={() => setSavingTemplate(false)} />
      ) : null}
      {canEdit ? (
        <TemplatesSheet
          visible={loadingTemplate}
          currentCount={schedule.length}
          canDelete={canDeleteTemplate}
          onClose={() => setLoadingTemplate(false)}
          onApply={(items, mode) => {
            persist(mode === 'replace' ? items : [...schedule, ...items]);
            setLoadingTemplate(false);
            setTab('schedule');
          }}
        />
      ) : null}
      {canSendEmail ? (
        <SendEmailSheet
          visible={emailing}
          programId={programId}
          title={programTitle}
          dateLabel={dateLabel}
          schedule={schedule}
          songs={songTitles.data}
          notes={((program as any).notes as string | null) || null}
          eventIds={linked.map((e: LinkedEvent) => e.id)}
          programZespol={((program as any).zespol as Record<string, unknown> | null) ?? null}
          onClose={() => setEmailing(false)}
        />
      ) : null}
      {canLinkEvents ? (
        <EventPickerSheet
          visible={pickingEvent}
          date={programDate}
          currentProgramId={programId}
          onClose={() => setPickingEvent(false)}
          onPick={pickEvent}
        />
      ) : null}
    </View>
  );
}

// Notatki ogólne programu (kolumna programs.notes — „Notatki ogólne” na webie).
const ProgramNotes = ({ programId, initial, editable }: { programId: number; initial: string; editable: boolean }) => {
  const save = useUpdateProgramNotes(programId);
  const [text, setText] = useState(initial);
  const [lastSaved, setLastSaved] = useState(initial);
  const dirty = text !== lastSaved;
  if (!editable && !initial.trim()) return null;
  return (
    <View style={{ marginBottom: 16, padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF' }}>
      <Text style={{ fontSize: 11, color: '#8A6606', marginBottom: 8, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Manrope_700Bold' }}>
        Notatki ogólne
      </Text>
      {editable ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Informacje dla wszystkich: próba, ubiór, uwagi techniczne…"
            placeholderTextColor="#6E685A"
            multiline
            style={{ minHeight: 90, fontSize: 15, lineHeight: 21, color: '#2A2312', fontFamily: 'Manrope_500Medium', textAlignVertical: 'top' }}
          />
          {dirty ? (
            <Pressable
              onPress={() =>
                save.mutate(text, {
                  onSuccess: () => setLastSaved(text),
                  onError: (e: unknown) => Alert.alert('Nie udało się zapisać', friendlyError(e, 'Spróbuj ponownie.')),
                })
              }
              disabled={save.isPending}
              className="active:opacity-80"
              style={{ alignSelf: 'flex-end', marginTop: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: '#FFBE0B' }}
            >
              {save.isPending ? (
                <ActivityIndicator size="small" color="#2A2312" />
              ) : (
                <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Zapisz notatki</Text>
              )}
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={{ fontSize: 15, lineHeight: 21, color: '#2A2312', fontFamily: 'Manrope_500Medium' }}>{initial}</Text>
      )}
    </View>
  );
};

const NotesView = ({ items }: { items: ProgramScheduleItem[] }) => {
  if (items.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundColor: '#FFF8E1',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <StickyNote size={28} color="#8A6606" />
        </View>
        <Text className="text-[16px]" style={{ color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
          Brak notatek i załączników
        </Text>
        <Text
          className="text-[13px] text-center mt-1"
          style={{ color: '#6B6557', fontFamily: 'Manrope_400Regular' }}
        >
          Notatki i PDF-y dodajesz w edycji punktu planu.
        </Text>
      </View>
    );
  }
  return (
    <View>
      {items.map((it) => (
        <View
          key={it.id}
          className="mb-3"
          style={{
            borderRadius: 16,
            backgroundColor: '#FFFFFF',
          }}
        >
          <View
            className="overflow-hidden p-4"
            style={{
              borderRadius: 16,
            }}
          >
            <Text
              className="text-[11px] uppercase mb-1"
              style={{
                color: '#8A6606',
                letterSpacing: 0.4,
                fontFamily: 'Manrope_600SemiBold',
              }}
            >
              {it.type === 'song'
                ? 'Pieśń'
                : it.type === 'media'
                  ? 'Media'
                  : it.type === 'header'
                    ? 'Sekcja'
                    : 'Element'}
            </Text>
            <Text
              className="text-[15px]"
              style={{
                color: '#2A2312',
                letterSpacing: -0.3,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {it.title || '(bez tytułu)'}
            </Text>
            {it.notes ? (
              <Text
                className="text-[13px] mt-2"
                style={{
                  color: '#2A2312',
                  fontFamily: 'Manrope_400Regular',
                  lineHeight: 19,
                }}
              >
                {it.notes}
              </Text>
            ) : null}
            {Array.isArray(it.customAttachments) && it.customAttachments.length > 0 ? (
              <View
                className="mt-3 pt-3 gap-2"
                style={{ borderTopWidth: 1, borderTopColor: '#ECE8DE' }}
              >
                {it.customAttachments.map((a, i) => (
                  <Pressable
                    key={`${it.id}-att-${i}`}
                    onPress={() => Linking.openURL(a.url)}
                    className="flex-row items-center gap-3 active:opacity-70"
                    style={{
                      borderRadius: 10,
                      backgroundColor: '#FFF8E1',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: '#fee2e2',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FileText size={16} color="#dc2626" strokeWidth={2.2} />
                    </View>
                    <Text
                      className="flex-1 text-[13px]"
                      style={{ color: '#2A2312', fontFamily: 'Manrope_500Medium' }}
                      numberOfLines={1}
                    >
                      {a.name}
                    </Text>
                    <ExternalLink size={14} color="#6E685A" />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
};

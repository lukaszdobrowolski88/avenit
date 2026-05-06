import { useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  ExternalLink,
  FileText,
  StickyNote,
  Users as UsersIcon,
} from 'lucide-react-native';
import {
  formatDate,
  calculateTotalTime,
  formatTime,
  type ProgramScheduleItem,
} from '../../../src/lib/domain';
import {
  useProgramDetail,
  useMyAssignments,
  useProgramTeam,
} from '../../../src/features/programs/api';
import { ScheduleList } from '../../../src/features/programs/components/ScheduleList';
import { AssignmentCard } from '../../../src/features/programs/components/AssignmentCard';
import { useAuthSession } from '../../../src/lib/auth';

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
      backgroundColor: active ? '#ffffff' : 'transparent',
      shadowColor: active ? '#0f172a' : 'transparent',
      shadowOpacity: active ? 0.08 : 0,
      shadowRadius: active ? 4 : 0,
      shadowOffset: { width: 0, height: 1 },
      elevation: active ? 2 : 0,
    }}
  >
    <Text
      style={{
        fontSize: 13,
        color: active ? '#be185d' : '#64748b',
        fontFamily: 'Inter_600SemiBold',
      }}
    >
      {label}
      {count !== undefined && count > 0 ? ` · ${count}` : ''}
    </Text>
  </Pressable>
);

const TEAM_LABELS: Record<
  string,
  { label: string; tint: string; bg: string; gradFrom: string; gradTo: string }
> = {
  worship: {
    label: 'Zespół Uwielbienia',
    tint: '#be185d',
    bg: '#fce7f3',
    gradFrom: '#ec4899',
    gradTo: '#f97316',
  },
  media: {
    label: 'MediaTeam',
    tint: '#9a3412',
    bg: '#ffedd5',
    gradFrom: '#f97316',
    gradTo: '#facc15',
  },
  produkcja: {
    label: 'MediaTeam',
    tint: '#9a3412',
    bg: '#ffedd5',
    gradFrom: '#f97316',
    gradTo: '#facc15',
  },
  atmosfera: {
    label: 'Atmosfera Team',
    tint: '#0f766e',
    bg: '#ccfbf1',
    gradFrom: '#14b8a6',
    gradTo: '#06b6d4',
  },
  atmosfera_team: {
    label: 'Atmosfera Team',
    tint: '#0f766e',
    bg: '#ccfbf1',
    gradFrom: '#14b8a6',
    gradTo: '#06b6d4',
  },
  scena: {
    label: 'Scena',
    tint: '#7c2d12',
    bg: '#fed7aa',
    gradFrom: '#ec4899',
    gradTo: '#f43f5e',
  },
  mc: {
    label: 'MC',
    tint: '#9d174d',
    bg: '#fce7f3',
    gradFrom: '#ec4899',
    gradTo: '#a855f7',
  },
  kids: {
    label: 'Dzieci',
    tint: '#854d0e',
    bg: '#fef3c7',
    gradFrom: '#eab308',
    gradTo: '#f59e0b',
  },
};

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthSession();
  const programQuery = useProgramDetail(id ?? '');
  const assignmentsQuery = useMyAssignments(id ?? '', user?.email ?? null);
  const teamQuery = useProgramTeam(id ?? '');
  const [tab, setTab] = useState<TabKey>('schedule');

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
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <ActivityIndicator color="#ec4899" />
      </View>
    );
  }
  if (programQuery.isError) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ textAlign: 'center', color: '#e11d48', fontFamily: 'Inter_500Medium' }}>
          {(programQuery.error as Error)?.message ?? 'Błąd'}
        </Text>
      </View>
    );
  }
  const program = programQuery.data;
  if (!program) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#ffffff',
          paddingHorizontal: 24,
        }}
      >
        <Text style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}>
          Program nie istnieje.
        </Text>
      </View>
    );
  }

  const total = calculateTotalTime(program.schedule);
  const teamCount = (teamQuery.data ?? []).length;
  const itemsWithNotes = ((program.schedule ?? []) as ProgramScheduleItem[]).filter(
    (it) =>
      (it.notes && it.notes.trim().length > 0) ||
      (Array.isArray(it.customAttachments) && it.customAttachments.length > 0),
  );
  const notesCount = itemsWithNotes.length;

  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 48,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#eef0f3',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#fafaf9',
              borderWidth: 1,
              borderColor: '#e7e5e4',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={20} color="#1c1917" strokeWidth={2.2} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 22,
                color: '#0c0a09',
                letterSpacing: -0.5,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {(program.title && String(program.title).trim()) || 'Nabożeństwo'}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: '#78716c',
                marginTop: 3,
                letterSpacing: -0.1,
                fontFamily: 'Inter_500Medium',
              }}
            >
              {(() => {
                const out = formatDate(program.date, 'EEEE, d MMMM yyyy');
                return out.charAt(0).toUpperCase() + out.slice(1);
              })()}
              {total > 0 ? ` · ${formatTime(total)}` : ''}
            </Text>
          </View>
        </View>

        {assignmentsQuery.data && assignmentsQuery.data.length > 0 && (
          <View
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTopWidth: 1,
              borderTopColor: '#f5f5f4',
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: '#78716c',
                marginBottom: 8,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                fontFamily: 'Inter_700Bold',
              }}
            >
              Twoje przypisania
            </Text>
            {assignmentsQuery.data.map((a) => (
              <AssignmentCard key={String(a.id)} assignment={a} />
            ))}
          </View>
        )}
      </View>

      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#f5f5f4',
          marginHorizontal: 16,
          marginTop: 12,
          padding: 4,
          borderRadius: 14,
        }}
      >
        <ProgramTab
          label="Program"
          active={tab === 'schedule'}
          onPress={() => setTab('schedule')}
          count={Array.isArray(program.schedule) ? program.schedule.length : 0}
        />
        <ProgramTab
          label="Zespół"
          active={tab === 'team'}
          onPress={() => setTab('team')}
          count={teamCount}
        />
        <ProgramTab
          label="Notatki"
          active={tab === 'notes'}
          onPress={() => setTab('notes')}
          count={notesCount}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        {tab === 'schedule' && <ScheduleList schedule={program.schedule} />}

        {tab === 'team' && (
          <View>
            {teamQuery.isLoading ? (
              <ActivityIndicator color="#ec4899" />
            ) : teamGrouped.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: '#fef3f2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                  }}
                >
                  <UsersIcon size={24} color="#ec4899" />
                </View>
                <Text style={{ fontSize: 13, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
                  Brak przypisanego zespołu.
                </Text>
              </View>
            ) : (
              teamGrouped.map(([teamType, members]) => {
                const meta = TEAM_LABELS[teamType] ?? {
                  label: teamType,
                  tint: '#57534e',
                  bg: '#f5f5f4',
                  gradFrom: '#a8a29e',
                  gradTo: '#78716c',
                };
                return (
                  <View
                    key={teamType}
                    className="mb-4"
                    style={{
                      borderRadius: 20,
                      backgroundColor: '#ffffff',
                      shadowColor: '#0f172a',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.05,
                      shadowRadius: 14,
                      elevation: 2,
                    }}
                  >
                    <View
                      className="overflow-hidden"
                      style={{
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: '#eef0f3',
                      }}
                    >
                      <View
                        className="flex-row items-center justify-between px-4 py-3"
                        style={{
                          backgroundColor: meta.bg,
                          borderBottomWidth: 1,
                          borderBottomColor: '#eef0f3',
                        }}
                      >
                        <Text
                          className="text-[15px]"
                          style={{
                            color: meta.tint,
                            letterSpacing: -0.3,
                            fontFamily: 'Inter_700Bold',
                          }}
                        >
                          {meta.label}
                        </Text>
                        <View
                          className="px-2 py-0.5"
                          style={{ borderRadius: 999, backgroundColor: '#ffffff' }}
                        >
                          <Text
                            className="text-[11px]"
                            style={{ color: meta.tint, fontFamily: 'Inter_700Bold' }}
                          >
                            {members?.length ?? 0}
                          </Text>
                        </View>
                      </View>
                      <View className="px-3 py-2">
                        {members?.map((m, idx) => (
                          <View
                            key={m.id}
                            className="flex-row items-center gap-3 px-2 py-2.5"
                            style={{
                              borderBottomWidth: idx < (members?.length ?? 0) - 1 ? 1 : 0,
                              borderBottomColor: '#f5f5f4',
                            }}
                          >
                            <View
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                backgroundColor: meta.bg,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Text
                                style={{
                                  color: meta.tint,
                                  fontFamily: 'Inter_700Bold',
                                  fontSize: 13,
                                }}
                              >
                                {(m.assigned_name || '?').charAt(0).toUpperCase()}
                              </Text>
                            </View>
                            <View className="flex-1">
                              <Text
                                className="text-[14px]"
                                style={{
                                  color: '#0c0a09',
                                  letterSpacing: -0.2,
                                  fontFamily: 'Inter_600SemiBold',
                                }}
                                numberOfLines={1}
                              >
                                {m.assigned_name}
                              </Text>
                              <Text
                                className="text-[12px] mt-0.5"
                                style={{ color: '#78716c', fontFamily: 'Inter_500Medium' }}
                              >
                                {m.role_key}
                              </Text>
                            </View>
                            <View
                              className="px-2 py-0.5"
                              style={{
                                borderRadius: 999,
                                backgroundColor:
                                  m.status === 'accepted'
                                    ? '#d1fae5'
                                    : m.status === 'rejected'
                                      ? '#ffe4e6'
                                      : '#fef3c7',
                              }}
                            >
                              <Text
                                className="text-[10px]"
                                style={{
                                  color:
                                    m.status === 'accepted'
                                      ? '#047857'
                                      : m.status === 'rejected'
                                        ? '#be123c'
                                        : '#b45309',
                                  fontFamily: 'Inter_700Bold',
                                }}
                              >
                                {m.status === 'accepted'
                                  ? 'Potwierdzone'
                                  : m.status === 'rejected'
                                    ? 'Odrzucone'
                                    : 'Oczekuje'}
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

        {tab === 'notes' && <NotesView items={itemsWithNotes} />}
      </ScrollView>
    </View>
  );
}

const NotesView = ({ items }: { items: ProgramScheduleItem[] }) => {
  if (items.length === 0) {
    return (
      <View className="items-center py-12">
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            backgroundColor: '#fef3f2',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <StickyNote size={28} color="#ec4899" />
        </View>
        <Text className="text-[16px]" style={{ color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}>
          Brak notatek i załączników
        </Text>
        <Text
          className="text-[13px] text-center mt-1"
          style={{ color: '#78716c', fontFamily: 'Inter_400Regular' }}
        >
          Notatki i pliki dodajesz w aplikacji webowej.
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
            backgroundColor: '#ffffff',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.04,
            shadowRadius: 10,
            elevation: 1,
          }}
        >
          <View
            className="overflow-hidden p-4"
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#eef0f3',
            }}
          >
            <Text
              className="text-[11px] uppercase mb-1"
              style={{
                color: '#78716c',
                letterSpacing: 0.4,
                fontFamily: 'Inter_600SemiBold',
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
                color: '#0c0a09',
                letterSpacing: -0.3,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {it.title || '(bez tytułu)'}
            </Text>
            {it.notes ? (
              <Text
                className="text-[13px] mt-2"
                style={{
                  color: '#1c1917',
                  fontFamily: 'Inter_400Regular',
                  lineHeight: 19,
                }}
              >
                {it.notes}
              </Text>
            ) : null}
            {Array.isArray(it.customAttachments) && it.customAttachments.length > 0 ? (
              <View
                className="mt-3 pt-3 gap-2"
                style={{ borderTopWidth: 1, borderTopColor: '#f5f5f4' }}
              >
                {it.customAttachments.map((a, i) => (
                  <Pressable
                    key={`${it.id}-att-${i}`}
                    onPress={() => Linking.openURL(a.url)}
                    className="flex-row items-center gap-3 active:opacity-70"
                    style={{
                      borderRadius: 10,
                      backgroundColor: '#fef3f2',
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
                      style={{ color: '#0c0a09', fontFamily: 'Inter_500Medium' }}
                      numberOfLines={1}
                    >
                      {a.name}
                    </Text>
                    <ExternalLink size={14} color="#a8a29e" />
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

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  CheckCircle,
  Circle,
  Clock,
  FileText,
  Image as ImageIcon,
  Loader,
  Lock,
  MessageCircle as MessageCircleIcon,
  Paperclip,
  Plus,
  Trash2,
  User as UserIcon,
  UserX,
  X,
} from 'lucide-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../../../lib/domain';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { DateField } from '../../../components/ui/DateField';
import { EmptyRow, WidgetCard } from './WidgetCard';
import { D, F } from '../theme';
import { MemberAvatar, MemberPicker, type PickedMember } from './MemberPicker';
import { TaskCommentsSection } from './TaskCommentsSection';
import { supabase } from '../../../lib/supabase';
import { useAuthSession } from '../../../lib/auth';
import {
  deleteTaskAttachment,
  pickFileForTask,
  pickImageForTask,
  takePhotoForTask,
  uploadTaskAttachment,
} from '../task-attachments';
import { useTaskCommentsCount } from '../task-comments';
import type { BoardTaskItem, TaskAttachment, TaskItem } from '../api';
import { useRouter } from 'expo-router';
import { usePermissions } from '../../../lib/permissions';
import { normalizeModuleLabel } from '../../modules/nav';
import { logBoardActivity, patchBoardItemCells } from '../../teams/boardItems';
import { openTask } from '../../tasks/navigation';
import { BoardTaskRow } from './BoardTaskRow';

type Status = 'todo' | 'in_progress' | 'done';

const STATUS_META: Record<string, { tint: string; bg: string; label: string; Icon: typeof Clock }> = {
  todo: { tint: '#4A463E', bg: '#ECE8DE', label: 'Do zrobienia', Icon: Circle },
  in_progress: { tint: '#2A2312', bg: '#ECE8DE', label: 'W trakcie', Icon: Loader },
  done: { tint: '#047857', bg: '#d1fae5', label: 'Zrobione', Icon: CheckCircle },
};

const STATUSES: Status[] = ['todo', 'in_progress', 'done'];

const isDone = (status: string) => status === 'done' || status === 'Zrobione';
const isOverdue = (dueDate: string | null): boolean => {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toISOString().slice(0, 10));
};

interface TaskFormState {
  id?: string;
  ownerEmail?: string;
  title: string;
  description: string;
  due_date: string | null;
  status: Status;
  is_private: boolean;
  assigned_to_email: string | null;
  assigned_to_name: string | null;
  attachments: TaskAttachment[];
}

const todayStr = (): string => new Date().toISOString().slice(0, 10);
const emptyTask = (): TaskFormState => ({
  title: '',
  description: '',
  due_date: todayStr(),
  status: 'todo',
  is_private: false,
  assigned_to_email: null,
  assigned_to_name: null,
  attachments: [],
});

const useUpsertTask = (userEmail: string | null | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskFormState) => {
      if (!userEmail) throw new Error('Brak email');
      const payload = {
        title: input.title.trim(),
        description: input.description.trim() || null,
        due_date: input.due_date || null,
        status: input.status,
        is_private: input.is_private,
        assigned_to_email: input.assigned_to_email,
        assigned_to_name: input.assigned_to_name,
        attachments: input.attachments,
      };
      if (input.id) {
        const { error } = await (supabase.from('user_tasks') as any)
          .update(payload)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('user_tasks') as any).insert({
          ...payload,
          user_email: userEmail,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
};

const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from('user_tasks') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
};

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 11,
      color: '#8A6606',
      marginBottom: 6,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontFamily: 'Manrope_700Bold',
    }}
  >
    {children}
  </Text>
);

const inputStyle = {
  borderWidth: 1,
  borderColor: '#B5AD99',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: '#2A2312',
  backgroundColor: '#FFFFFF',
  fontFamily: 'Manrope_500Medium' as const,
};

// Pole daty w stylu pól formularza (białe z ramką).
const pickerStyle = { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#B5AD99', height: 48 };

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const TaskFormModal = ({
  visible,
  onClose,
  onSubmit,
  onDelete,
  isLoading,
  isDeleting,
  initial,
  myEmail,
  myName,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (form: TaskFormState) => void;
  onDelete?: () => void;
  isLoading: boolean;
  isDeleting: boolean;
  initial: TaskFormState | null;
  myEmail: string | null;
  myName: string | null;
}) => {
  const [form, setForm] = useState<TaskFormState>(emptyTask());
  const [dateText, setDateText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) {
      const next = initial ?? emptyTask();
      setForm(next);
      setDateText(next.due_date ?? '');
    }
  }, [visible, initial]);

  const isEdit = !!form.id;

  const handleSubmit = () => {
    const t = form.title.trim();
    if (!t) {
      Alert.alert('Uzupełnij tytuł', 'Tytuł zadania jest wymagany.');
      return;
    }
    // Termin z DateField (zawsze RRRR-MM-DD albo pusty).
    const dueIso: string | null = /^\d{4}-\d{2}-\d{2}$/.test(dateText.trim()) ? dateText.trim() : null;
    onSubmit({ ...form, title: t, due_date: dueIso });
  };

  const setQuickDate = (iso: string) => {
    setForm((f) => ({ ...f, due_date: iso }));
    setDateText(iso);
  };

  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const inWeek = addDays(today, 7);

  const handleAttach = async (kind: 'library' | 'camera' | 'file') => {
    if (uploading) return;
    setUploading(true);
    try {
      const asset =
        kind === 'library'
          ? await pickImageForTask()
          : kind === 'camera'
            ? await takePhotoForTask()
            : await pickFileForTask();
      if (!asset) return;
      const att = await uploadTaskAttachment(form.id ?? null, asset);
      setForm((f) => ({ ...f, attachments: [...f.attachments, att] }));
    } catch (e: any) {
      showError('Nie udało się dodać załącznika', e, 'Spróbuj ponownie albo wybierz mniejszy plik.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (att: TaskAttachment) => {
    Alert.alert('Usunąć załącznik?', `„${att.name}” zostanie usunięty z zadania.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          deleteTaskAttachment(att.url).catch(() => undefined);
          setForm((f) => ({
            ...f,
            attachments: f.attachments.filter((a) => a.url !== att.url),
          }));
        },
      },
    ]);
  };

  const assignedToMe = form.assigned_to_email && form.assigned_to_email === myEmail;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
      >
        <View
          style={{
            backgroundColor: '#F6F4EE',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
            maxHeight: '94%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                color: '#2A2312',
                letterSpacing: -0.4,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              {isEdit ? 'Edytuj zadanie' : 'Nowe zadanie'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Label>Tytuł</Label>
            <TextInput
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="Co jest do zrobienia?"
              placeholderTextColor="#6E685A"
              style={[inputStyle, { marginBottom: 14 }]}
              autoFocus={!isEdit}
              returnKeyType="next"
            />

            <Label>Przypisz do</Label>
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                ...inputStyle,
                paddingVertical: 10,
                marginBottom: 14,
              }}
            >
              {form.assigned_to_email ? (
                <>
                  <MemberAvatar
                    email={form.assigned_to_email}
                    name={form.assigned_to_name}
                    size={28}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 14,
                        color: '#2A2312',
                        fontFamily: 'Manrope_600SemiBold',
                      }}
                    >
                      {form.assigned_to_name || form.assigned_to_email}
                      {assignedToMe ? ' (Ty)' : ''}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        color: '#6B6557',
                        marginTop: 1,
                        fontFamily: 'Manrope_500Medium',
                      }}
                    >
                      {form.assigned_to_email}
                    </Text>
                  </View>
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setForm((f) => ({
                        ...f,
                        assigned_to_email: null,
                        assigned_to_name: null,
                      }));
                    }}
                    hitSlop={8}
                  >
                    <X size={16} color="#6E685A" />
                  </Pressable>
                </>
              ) : (
                <>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#ECE8DE',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserX size={14} color="#6B6557" />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: '#6B6557',
                      fontFamily: 'Manrope_500Medium',
                    }}
                  >
                    Nikt — tap aby przypisać
                  </Text>
                  <UserIcon size={16} color="#6E685A" />
                </>
              )}
            </Pressable>

            <Label>Termin</Label>
            <View style={{ marginBottom: 8 }}>
              <DateField value={dateText} onChange={setQuickDate} optional placeholder="Bez terminu" style={pickerStyle} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {[
                { label: 'Dziś', v: today },
                { label: 'Jutro', v: tomorrow },
                { label: 'Za tydzień', v: inWeek },
                { label: 'Bez terminu', v: '' },
              ].map((opt) => {
                const active = dateText === opt.v;
                return (
                  <Pressable
                    key={opt.label}
                    onPress={() => setQuickDate(opt.v)}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: active ? '#2A2312' : '#ECE8DE',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: active ? '#ffffff' : '#2A2312',
                        fontFamily: 'Manrope_600SemiBold',
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Label>Status</Label>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {STATUSES.map((s) => {
                const meta = STATUS_META[s];
                const active = form.status === s;
                const Icon = meta.Icon;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setForm((f) => ({ ...f, status: s }))}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: active ? meta.bg : '#F1EEE6',
                      borderWidth: 1,
                      borderColor: active ? meta.tint : '#E6E1D5',
                    }}
                  >
                    <Icon size={14} color={meta.tint} strokeWidth={2.4} />
                    <Text
                      style={{
                        fontSize: 12,
                        color: active ? meta.tint : '#4A463E',
                        fontFamily: 'Manrope_700Bold',
                      }}
                    >
                      {meta.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Label>Opis (opcjonalnie)</Label>
            <TextInput
              value={form.description}
              onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
              placeholder="Szczegóły zadania..."
              placeholderTextColor="#6E685A"
              multiline
              style={[
                inputStyle,
                { minHeight: 90, textAlignVertical: 'top' as const, marginBottom: 14 },
              ]}
            />

            <Label>Załączniki</Label>
            <View style={{ marginBottom: 14, gap: 8 }}>
              {form.attachments.map((att, i) => {
                const isImage = att.type?.startsWith('image/');
                const isPdf = att.type === 'application/pdf';
                const isAudio = att.type?.startsWith('audio/');
                const isVideo = att.type?.startsWith('video/');
                const fileBg = isPdf
                  ? '#fee2e2'
                  : isAudio
                    ? '#ECE8DE'
                    : isVideo
                      ? '#ECE8DE'
                      : '#ECE8DE';
                const fileTint = isPdf
                  ? '#dc2626'
                  : isAudio
                    ? '#2A2312'
                    : isVideo
                      ? '#2A2312'
                      : '#4A463E';
                return (
                  <View
                    key={`${att.url}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor: '#FFFFFF',
                      borderWidth: 1,
                      borderColor: '#E6E1D5',
                    }}
                  >
                    {isImage ? (
                      <Image
                        source={{ uri: att.url }}
                        style={{ width: 40, height: 40, borderRadius: 8 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          backgroundColor: fileBg,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <FileText size={18} color={fileTint} />
                      </View>
                    )}
                    <Pressable
                      onPress={() => Linking.openURL(att.url)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 13,
                          color: '#2A2312',
                          fontFamily: 'Manrope_600SemiBold',
                        }}
                      >
                        {att.name}
                      </Text>
                      {att.size ? (
                        <Text
                          style={{
                            fontSize: 11,
                            color: '#6B6557',
                            marginTop: 1,
                            fontFamily: 'Manrope_500Medium',
                          }}
                        >
                          {Math.round(att.size / 1024)} KB
                        </Text>
                      ) : null}
                    </Pressable>
                    <Pressable
                      onPress={() => handleRemoveAttachment(att)}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <Trash2 size={14} color="#6E685A" />
                    </Pressable>
                  </View>
                );
              })}

              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  onPress={() => handleAttach('library')}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: '#E3DDD0',
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator color="#2A2312" />
                  ) : (
                    <>
                      <ImageIcon size={14} color="#4A463E" />
                      <Text
                        style={{ fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}
                      >
                        Galeria
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => handleAttach('camera')}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: '#E3DDD0',
                  }}
                >
                  <Camera size={14} color="#4A463E" />
                  <Text
                    style={{ fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}
                  >
                    Aparat
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handleAttach('file')}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderStyle: 'dashed',
                    borderColor: '#E3DDD0',
                  }}
                >
                  <FileText size={14} color="#4A463E" />
                  <Text
                    style={{ fontSize: 12, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}
                  >
                    Plik
                  </Text>
                </Pressable>
              </View>
            </View>

            <TaskCommentsSection
              taskId={form.id ?? null}
              taskOwnerEmail={form.ownerEmail ?? myEmail ?? ''}
              myEmail={myEmail}
              myName={myName}
            />

            <Pressable
              onPress={() => setForm((f) => ({ ...f, is_private: !f.is_private }))}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 14,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: form.is_private ? '#F3E3B0' : '#E6E1D5',
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: form.is_private ? '#FFBE0B' : '#D3CCBC',
                  backgroundColor: form.is_private ? '#2A2312' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {form.is_private ? <Lock size={12} color="#ffffff" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Prywatne
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: '#6B6557',
                    marginTop: 2,
                    fontFamily: 'Manrope_400Regular',
                  }}
                >
                  Tylko Ty widzisz to zadanie
                </Text>
              </View>
              <Lock size={16} color={form.is_private ? '#8A6606' : '#A8A59E'} />
            </Pressable>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {isEdit && onDelete ? (
                <Pressable
                  onPress={onDelete}
                  disabled={isDeleting}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: '#ffe4e6',
                  }}
                >
                  <Trash2 size={14} color="#be123c" />
                  <Text
                    style={{ fontSize: 13, color: '#be123c', fontFamily: 'Manrope_700Bold' }}
                  >
                    Usuń
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              <Pressable
                onPress={onClose}
                disabled={isLoading || isDeleting}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#FFFFFF',
                  borderWidth: 1,
                  borderColor: '#E6E1D5',
                }}
              >
                <Text
                  style={{ fontSize: 13, color: '#4A463E', fontFamily: 'Manrope_600SemiBold' }}
                >
                  Anuluj
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={!form.title.trim() || isLoading}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor:
                    !form.title.trim() || isLoading ? '#E3DDD0' : '#8A6606',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: 'Manrope_700Bold' }}>
                  {isLoading ? 'Zapisywanie…' : isEdit ? 'Zapisz' : 'Dodaj'}
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <MemberPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedEmail={form.assigned_to_email}
        onSelect={(picked: PickedMember | null) =>
          setForm((f) => ({
            ...f,
            assigned_to_email: picked?.email ?? null,
            assigned_to_name: picked?.fullName ?? null,
          }))
        }
      />
    </Modal>
  );
};

// Pozycja listy: zadanie osobiste (user_tasks, edycja w oknie) albo element tablicy (ekran zadania).
type Row = { kind: 'personal'; t: TaskItem; due: string | null; name: string } | { kind: 'board'; b: BoardTaskItem; due: string | null; name: string };

// Termin rosnąco, bez terminu na końcu, potem nazwa (jak web compareTasks).
const compareRows = (a: Row, b: Row) => {
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.name.localeCompare(b.name, 'pl');
};

const LIMIT = 6;

export const TasksWidget = ({ items, boardItems = [] }: { items: TaskItem[]; boardItems?: BoardTaskItem[] }) => {
  const { user } = useAuthSession();
  const router = useRouter();
  const qc = useQueryClient();
  const perms = usePermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormState | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Zadania z tablic właśnie odhaczane / odhaczone (do odświeżenia pulpitu widać je jako gotowe).
  const [doneBusy, setDoneBusy] = useState<string | null>(null);
  const [doneNow, setDoneNow] = useState<Set<string>>(new Set());
  const upsert = useUpsertTask(user?.email);
  const deleteMut = useDeleteTask();
  const myEmail = user?.email ?? null;
  const myName =
    (user?.user_metadata as { full_name?: string } | null)?.full_name ??
    user?.email ??
    null;
  const taskIds = items.map((t) => t.id);
  const { data: commentCounts } = useTaskCommentsCount(taskIds);

  // Otwarte zadania z tablic (zrobione — isDoneLabel — pomijamy, jak osobiste „done”).
  const openBoard = boardItems
    .filter((b) => !b.done || doneNow.has(b.id))
    .map((b) => (doneNow.has(b.id) ? { ...b, done: true } : b));
  const rows: Row[] = [
    ...items.map((t): Row => ({ kind: 'personal', t, due: t.due_date ? t.due_date.slice(0, 10) : null, name: t.title })),
    ...openBoard.map((b): Row => ({ kind: 'board', b, due: b.due, name: b.name })),
  ].sort(compareRows);
  const visibleRows = expanded ? rows : rows.slice(0, LIMIT);
  const todoCount = items.filter((t) => !isDone(t.status)).length + openBoard.filter((b) => !b.done).length;

  const whereOf = (b: BoardTaskItem) =>
    (b.moduleKey ? normalizeModuleLabel(perms.modules.find((m) => m.key === b.moduleKey)?.label) : '') || b.boardName;

  // Szybkie „gotowe”: kolumna statusu → etykieta „gotowe” (serwer scala komórki — fn board-item-patch).
  const markBoardDone = async (b: BoardTaskItem) => {
    if (!b.statusColId || !b.doneLabelId || doneBusy) return;
    setDoneBusy(b.id);
    try {
      const { before } = await patchBoardItemCells(b.id, { [b.statusColId]: b.doneLabelId });
      logBoardActivity({
        itemId: b.id,
        boardId: b.boardId,
        action: 'status_changed',
        columnId: b.statusColId,
        from: before ? before[b.statusColId] ?? null : null,
        to: b.doneLabelId,
        actorEmail: myEmail,
        actorName: myName,
      });
      setDoneNow((cur) => new Set(cur).add(b.id));
      toast.success('Zadanie gotowe');
      qc.invalidateQueries({ queryKey: ['task', b.id] });
      qc.invalidateQueries({ queryKey: ['agenda-tasks'] });
      qc.invalidateQueries({ queryKey: ['my-work'] });
    } catch (e) {
      showError('Nie udało się oznaczyć zadania', e, 'Spróbuj ponownie.');
    } finally {
      setDoneBusy(null);
    }
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (t: TaskItem) => {
    const status: Status =
      t.status === 'in_progress' ? 'in_progress' : t.status === 'done' ? 'done' : 'todo';
    setEditing({
      id: t.id,
      ownerEmail: t.user_email,
      title: t.title,
      description: t.description ?? '',
      due_date: t.due_date,
      status,
      is_private: !!t.is_private,
      assigned_to_email: t.assigned_to_email,
      assigned_to_name: t.assigned_to_name,
      attachments: (Array.isArray(t.attachments) ? t.attachments : []),
    });
    setModalOpen(true);
  };

  const handleSubmit = (form: TaskFormState) => {
    upsert.mutate(form, {
      onSuccess: () => {
        setModalOpen(false);
        setEditing(null);
        toast.success(form.id ? 'Zadanie zapisane' : 'Zadanie dodane');
      },
      onError: (err) => showError('Nie udało się zapisać zadania', err),
    });
  };

  const handleDelete = () => {
    if (!editing?.id) return;
    Alert.alert('Usunąć zadanie?', `„${editing.title}” zniknie z listy zadań u wszystkich osób, które je widzą. Tej operacji nie można cofnąć.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteMut.mutate(editing.id!, {
            onSuccess: () => {
              setModalOpen(false);
              setEditing(null);
              toast.success('Zadanie usunięte');
            },
            onError: (err) => showError('Nie udało się usunąć zadania', err),
          });
        },
      },
    ]);
  };

  const handleToggleDone = (t: TaskItem) => {
    const next: Status = isDone(t.status) ? 'todo' : 'done';
    upsert.mutate(
      {
        id: t.id,
        title: t.title,
        description: t.description ?? '',
        due_date: t.due_date,
        status: next,
        is_private: !!t.is_private,
        assigned_to_email: t.assigned_to_email,
        assigned_to_name: t.assigned_to_name,
        attachments: (Array.isArray(t.attachments) ? t.attachments : []),
      },
      {
        onError: (err) => showError('Nie udało się zmienić statusu zadania', err),
      },
    );
  };

  return (
    <>
      <WidgetCard
        title="Moje zadania"
        count={todoCount}
        action={
          <Pressable
            onPress={openNew}
            hitSlop={6}
            className="active:opacity-70"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              height: 32,
              borderRadius: 16,
              backgroundColor: D.card,
            }}
          >
            <Plus size={14} color={D.ink} strokeWidth={2.2} />
            <Text style={{ fontSize: 13, color: D.ink, fontFamily: F.semibold }}>Dodaj</Text>
          </Pressable>
        }
      >
        <View style={{ height: 6 }} />
        {rows.length === 0 ? (
          <EmptyRow text="Brak zadań do zrobienia" hint="Dodaj zadanie dla siebie albo przypisz je komuś." actionLabel="Dodaj" onAction={openNew} />
        ) : (
          visibleRows.map((row, idx, arr) => {
            if (row.kind === 'board') {
              const b = row.b;
              return (
                <BoardTaskRow
                  key={`b-${b.id}`}
                  task={b}
                  where={whereOf(b)}
                  last={idx === arr.length - 1}
                  busy={doneBusy === b.id}
                  onOpen={() => openTask(router, { itemId: b.id, boardId: b.boardId })}
                  onDone={b.statusColId && b.doneLabelId && !b.done ? () => void markBoardDone(b) : null}
                />
              );
            }
            const t = row.t;
            const meta = STATUS_META[t.status as Status] ?? STATUS_META.todo;
            const overdue = isOverdue(t.due_date);
            const done = isDone(t.status);
            const fromOther = t.user_email !== myEmail;
            const attCount = t.attachments?.length ?? 0;
            const commentCount = commentCounts?.[t.id] ?? 0;
            return (
              <Pressable
                key={t.id}
                onPress={() => openEdit(t)}
                className="active:opacity-70"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: idx < arr.length - 1 ? 1 : 0,
                  borderBottomColor: '#ECE8DE',
                }}
              >
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleToggleDone(t);
                  }}
                  hitSlop={8}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: meta.bg,
                  }}
                >
                  {done ? (
                    <CheckCircle size={14} color={meta.tint} />
                  ) : (
                    <Clock size={14} color={meta.tint} />
                  )}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 14,
                      color: done ? '#6E685A' : '#2A2312',
                      textDecorationLine: done ? 'line-through' : 'none',
                      fontFamily: 'Manrope_500Medium',
                    }}
                  >
                    {t.title}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 2,
                      flexWrap: 'wrap',
                    }}
                  >
                    {t.due_date ? (
                      <Text
                        style={{
                          fontSize: 11,
                          color: overdue ? '#be123c' : '#6B6557',
                          fontFamily: overdue ? 'Manrope_700Bold' : 'Manrope_500Medium',
                        }}
                      >
                        {formatDate(t.due_date, 'd MMM')}
                        {overdue && !done ? ' · po terminie' : ''}
                      </Text>
                    ) : null}
                    {t.assigned_to_email ? (
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <UserIcon size={9} color="#6E685A" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#6B6557',
                            fontFamily: 'Manrope_600SemiBold',
                          }}
                          numberOfLines={1}
                        >
                          {t.assigned_to_email === myEmail
                            ? 'dla mnie'
                            : (t.assigned_to_name?.split(' ')[0] ??
                              t.assigned_to_email.split('@')[0])}
                        </Text>
                      </View>
                    ) : null}
                    {attCount > 0 ? (
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <Paperclip size={9} color="#6E685A" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#6B6557',
                            fontFamily: 'Manrope_600SemiBold',
                          }}
                        >
                          {attCount}
                        </Text>
                      </View>
                    ) : null}
                    {commentCount > 0 ? (
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <MessageCircleIcon size={9} color="#6E685A" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#6B6557',
                            fontFamily: 'Manrope_600SemiBold',
                          }}
                        >
                          {commentCount}
                        </Text>
                      </View>
                    ) : null}
                    {t.is_private ? (
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
                      >
                        <Lock size={9} color="#6E685A" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#6E685A',
                            fontFamily: 'Manrope_600SemiBold',
                          }}
                        >
                          Prywatne
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {fromOther ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: '#ECE8DE',
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}
                    >
                      Dla mnie
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: '#FFF1C2',
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: '#9d174d', fontFamily: 'Manrope_700Bold' }}
                    >
                      Osobiste
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
        {rows.length > LIMIT ? (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            accessibilityRole="button"
            className="active:opacity-70"
            style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#ECE8DE' }}
          >
            <Text style={{ fontSize: 13, color: D.ink2, fontFamily: F.semibold }}>
              {expanded ? 'Zwiń' : `Pokaż wszystkie (${rows.length})`}
            </Text>
          </Pressable>
        ) : null}
      </WidgetCard>
      <TaskFormModal
        visible={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        // Usuwa tylko autor zadania (serwer i tak to egzekwuje) — przypisany może je zmieniać.
        onDelete={!editing?.ownerEmail || editing.ownerEmail.toLowerCase() === (myEmail ?? '').toLowerCase() ? handleDelete : undefined}
        isLoading={upsert.isPending}
        isDeleting={deleteMut.isPending}
        initial={editing}
        myEmail={myEmail}
        myName={myName}
      />
    </>
  );
};

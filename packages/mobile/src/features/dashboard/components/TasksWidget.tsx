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
  CheckSquare,
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
import { WidgetCard } from './WidgetCard';
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
import type { TaskAttachment, TaskItem } from '../api';

type Status = 'todo' | 'in_progress' | 'done';

const STATUS_META: Record<string, { tint: string; bg: string; label: string; Icon: typeof Clock }> = {
  todo: { tint: '#57534e', bg: '#f5f5f4', label: 'Do zrobienia', Icon: Circle },
  in_progress: { tint: '#1d4ed8', bg: '#dbeafe', label: 'W trakcie', Icon: Loader },
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
      color: '#78716c',
      marginBottom: 6,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      fontFamily: 'Inter_700Bold',
    }}
  >
    {children}
  </Text>
);

const inputStyle = {
  borderWidth: 1,
  borderColor: '#eef0f3',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontSize: 15,
  color: '#0c0a09',
  backgroundColor: '#fafaf9',
  fontFamily: 'Inter_500Medium' as const,
};

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
      Alert.alert('Wpisz tytuł', 'Tytuł zadania jest wymagany.');
      return;
    }
    let dueIso: string | null = null;
    const dt = dateText.trim();
    if (dt) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        Alert.alert('Błędna data', 'Format: YYYY-MM-DD');
        return;
      }
      const parsed = new Date(dt);
      if (isNaN(parsed.getTime())) {
        Alert.alert('Błędna data', 'Sprawdź wpisaną datę.');
        return;
      }
      dueIso = dt;
    }
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
      Alert.alert('Błąd uploadu', e?.message ?? 'Nie udało się wgrać pliku');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAttachment = (att: TaskAttachment) => {
    Alert.alert('Usunąć załącznik?', att.name, [
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
            backgroundColor: '#ffffff',
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
                color: '#0c0a09',
                letterSpacing: -0.4,
                fontFamily: 'Inter_700Bold',
              }}
            >
              {isEdit ? 'Edytuj zadanie' : 'Nowe zadanie'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Label>Tytuł</Label>
            <TextInput
              value={form.title}
              onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
              placeholder="Co jest do zrobienia?"
              placeholderTextColor="#a8a29e"
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
                        color: '#0c0a09',
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {form.assigned_to_name || form.assigned_to_email}
                      {assignedToMe ? ' (Ty)' : ''}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 11,
                        color: '#78716c',
                        marginTop: 1,
                        fontFamily: 'Inter_500Medium',
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
                    <X size={16} color="#a8a29e" />
                  </Pressable>
                </>
              ) : (
                <>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: '#f5f5f4',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <UserX size={14} color="#78716c" />
                  </View>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: '#78716c',
                      fontFamily: 'Inter_500Medium',
                    }}
                  >
                    Nikt — tap aby przypisać
                  </Text>
                  <UserIcon size={16} color="#a8a29e" />
                </>
              )}
            </Pressable>

            <Label>Termin</Label>
            <TextInput
              value={dateText}
              onChangeText={setDateText}
              placeholder="np. 2026-05-10 (lub puste)"
              placeholderTextColor="#a8a29e"
              keyboardType="numbers-and-punctuation"
              style={[inputStyle, { marginBottom: 8 }]}
            />
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
                      backgroundColor: active ? '#0c0a09' : '#fafaf9',
                      borderWidth: 1,
                      borderColor: active ? '#0c0a09' : '#eef0f3',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        color: active ? '#ffffff' : '#1c1917',
                        fontFamily: 'Inter_600SemiBold',
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
                      backgroundColor: active ? meta.bg : '#fafaf9',
                      borderWidth: 1,
                      borderColor: active ? meta.tint : '#eef0f3',
                    }}
                  >
                    <Icon size={14} color={meta.tint} strokeWidth={2.4} />
                    <Text
                      style={{
                        fontSize: 12,
                        color: active ? meta.tint : '#57534e',
                        fontFamily: 'Inter_700Bold',
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
              placeholderTextColor="#a8a29e"
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
                    ? '#ede9fe'
                    : isVideo
                      ? '#dbeafe'
                      : '#f5f5f4';
                const fileTint = isPdf
                  ? '#dc2626'
                  : isAudio
                    ? '#7c3aed'
                    : isVideo
                      ? '#1d4ed8'
                      : '#57534e';
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
                      backgroundColor: '#fafaf9',
                      borderWidth: 1,
                      borderColor: '#eef0f3',
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
                          color: '#0c0a09',
                          fontFamily: 'Inter_600SemiBold',
                        }}
                      >
                        {att.name}
                      </Text>
                      {att.size ? (
                        <Text
                          style={{
                            fontSize: 11,
                            color: '#78716c',
                            marginTop: 1,
                            fontFamily: 'Inter_500Medium',
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
                      <Trash2 size={14} color="#a8a29e" />
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
                    borderColor: '#e7e5e4',
                  }}
                >
                  {uploading ? (
                    <ActivityIndicator color="#ec4899" />
                  ) : (
                    <>
                      <ImageIcon size={14} color="#57534e" />
                      <Text
                        style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}
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
                    borderColor: '#e7e5e4',
                  }}
                >
                  <Camera size={14} color="#57534e" />
                  <Text
                    style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}
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
                    borderColor: '#e7e5e4',
                  }}
                >
                  <FileText size={14} color="#57534e" />
                  <Text
                    style={{ fontSize: 12, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}
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
                backgroundColor: '#fafaf9',
                borderWidth: 1,
                borderColor: form.is_private ? '#fbcfe8' : '#eef0f3',
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: form.is_private ? '#ec4899' : '#d6d3d1',
                  backgroundColor: form.is_private ? '#ec4899' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {form.is_private ? <Lock size={12} color="#ffffff" strokeWidth={3} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 14, color: '#0c0a09', fontFamily: 'Inter_600SemiBold' }}
                >
                  Prywatne
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: '#78716c',
                    marginTop: 2,
                    fontFamily: 'Inter_400Regular',
                  }}
                >
                  Tylko Ty widzisz to zadanie
                </Text>
              </View>
              <Lock size={16} color={form.is_private ? '#ec4899' : '#a8a29e'} />
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
                    style={{ fontSize: 13, color: '#be123c', fontFamily: 'Inter_700Bold' }}
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
                  backgroundColor: '#fafaf9',
                  borderWidth: 1,
                  borderColor: '#eef0f3',
                }}
              >
                <Text
                  style={{ fontSize: 13, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}
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
                    !form.title.trim() || isLoading ? '#e7e5e4' : '#ec4899',
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: 'Inter_700Bold' }}>
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

export const TasksWidget = ({ items }: { items: TaskItem[] }) => {
  const { user } = useAuthSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaskFormState | null>(null);
  const upsert = useUpsertTask(user?.email);
  const deleteMut = useDeleteTask();
  const todoCount = items.filter((t) => !isDone(t.status)).length;
  const myEmail = user?.email ?? null;
  const myName =
    (user?.user_metadata as { full_name?: string } | null)?.full_name ??
    user?.email ??
    null;
  const taskIds = items.map((t) => t.id);
  const { data: commentCounts } = useTaskCommentsCount(taskIds);

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
      attachments: t.attachments ?? [],
    });
    setModalOpen(true);
  };

  const handleSubmit = (form: TaskFormState) => {
    upsert.mutate(form, {
      onSuccess: () => {
        setModalOpen(false);
        setEditing(null);
      },
      onError: (err: any) =>
        Alert.alert('Błąd', err?.message ?? 'Nie udało się zapisać zadania'),
    });
  };

  const handleDelete = () => {
    if (!editing?.id) return;
    Alert.alert('Usunąć zadanie?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () => {
          deleteMut.mutate(editing.id!, {
            onSuccess: () => {
              setModalOpen(false);
              setEditing(null);
            },
            onError: (err: any) =>
              Alert.alert('Błąd', err?.message ?? 'Nie udało się usunąć'),
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
        attachments: t.attachments ?? [],
      },
      {
        onError: (err: any) =>
          Alert.alert('Błąd', err?.message ?? 'Nie udało się zaktualizować'),
      },
    );
  };

  return (
    <>
      <WidgetCard
        title="Moje Zadania"
        Icon={CheckSquare}
        action={
          <Pressable
            onPress={openNew}
            className="active:opacity-70"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 8,
              backgroundColor: '#ffedd5',
            }}
          >
            <Plus size={12} color="#c2410c" strokeWidth={2.4} />
            <Text style={{ fontSize: 12, color: '#c2410c', fontFamily: 'Inter_700Bold' }}>
              Dodaj
            </Text>
          </Pressable>
        }
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <Text style={{ fontSize: 12, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
            {todoCount} do zrobienia
          </Text>
        </View>
        {items.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: '#78716c', fontFamily: 'Inter_500Medium' }}>
              Brak zadań do zrobienia
            </Text>
          </View>
        ) : (
          items.slice(0, 5).map((t, idx, arr) => {
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
                  borderBottomColor: '#f5f5f4',
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
                      color: done ? '#a8a29e' : '#0c0a09',
                      textDecorationLine: done ? 'line-through' : 'none',
                      fontFamily: 'Inter_500Medium',
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
                          color: overdue ? '#be123c' : '#78716c',
                          fontFamily: overdue ? 'Inter_700Bold' : 'Inter_500Medium',
                        }}
                      >
                        {overdue ? '⚠ ' : ''}
                        {formatDate(t.due_date, 'd MMM')}
                      </Text>
                    ) : null}
                    {t.assigned_to_email ? (
                      <View
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}
                      >
                        <UserIcon size={9} color="#a8a29e" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#78716c',
                            fontFamily: 'Inter_600SemiBold',
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
                        <Paperclip size={9} color="#a8a29e" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#78716c',
                            fontFamily: 'Inter_600SemiBold',
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
                        <MessageCircleIcon size={9} color="#a8a29e" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#78716c',
                            fontFamily: 'Inter_600SemiBold',
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
                        <Lock size={9} color="#a8a29e" strokeWidth={2.4} />
                        <Text
                          style={{
                            fontSize: 10,
                            color: '#a8a29e',
                            fontFamily: 'Inter_600SemiBold',
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
                      backgroundColor: '#dbeafe',
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: '#1d4ed8', fontFamily: 'Inter_700Bold' }}
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
                      backgroundColor: '#fce7f3',
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: '#9d174d', fontFamily: 'Inter_700Bold' }}
                    >
                      Osobiste
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })
        )}
      </WidgetCard>
      <TaskFormModal
        visible={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
        isLoading={upsert.isPending}
        isDeleting={deleteMut.isPending}
        initial={editing}
        myEmail={myEmail}
        myName={myName}
      />
    </>
  );
};

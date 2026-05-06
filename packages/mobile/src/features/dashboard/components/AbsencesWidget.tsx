import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Check, Clock, Plus, Trash2, X } from 'lucide-react-native';
import { formatDate } from '../../../lib/domain';
import { WidgetCard } from './WidgetCard';
import { supabase } from '../../../lib/supabase';
import { useAuthSession } from '../../../lib/auth';
import type { AbsenceItem, UpcomingProgramItem } from '../api';

const STATUS_META: Record<
  AbsenceItem['status'],
  { label: string; tint: string; bg: string; Icon: typeof Check }
> = {
  pending: { label: 'Oczekuje', tint: '#b45309', bg: '#fef3c7', Icon: Clock },
  approved: { label: 'Zatwierdzona', tint: '#047857', bg: '#d1fae5', Icon: Check },
  rejected: { label: 'Odrzucona', tint: '#be123c', bg: '#ffe4e6', Icon: X },
};

interface Props {
  items: AbsenceItem[];
  upcomingPrograms?: UpcomingProgramItem[];
}

const useReportAbsence = (userEmail: string | null | undefined) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      programId: number | null;
      absenceDate: string;
      note: string;
    }) => {
      if (!userEmail) throw new Error('Brak email');
      const { error } = await (supabase.from('user_absences') as any).insert({
        user_email: userEmail,
        program_id: input.programId,
        absence_date: input.absenceDate,
        note: input.note || null,
        status: 'pending',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
};

const useDeleteAbsence = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number | string) => {
      const { error } = await (supabase.from('user_absences') as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });
};

const ReportModal = ({
  visible,
  onClose,
  programs,
  onSubmit,
  isLoading,
}: {
  visible: boolean;
  onClose: () => void;
  programs: UpcomingProgramItem[];
  onSubmit: (input: { programId: number | null; absenceDate: string; note: string }) => void;
  isLoading: boolean;
}) => {
  const [selected, setSelected] = useState<UpcomingProgramItem | null>(null);
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!selected) {
      Alert.alert(
        'Wybierz nabożeństwo',
        'Zaznacz nabożeństwo, na które zgłaszasz nieobecność.',
      );
      return;
    }
    onSubmit({ programId: selected.id, absenceDate: selected.date, note });
    setSelected(null);
    setNote('');
  };

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
            padding: 20,
            paddingBottom: 32,
            maxHeight: '80%',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
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
              Zgłoś nieobecność
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          <Text
            style={{
              fontSize: 11,
              color: '#78716c',
              marginBottom: 8,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Inter_700Bold',
            }}
          >
            Wybierz nabożeństwo
          </Text>
          <ScrollView style={{ maxHeight: 240, marginBottom: 12 }}>
            {programs.length === 0 ? (
              <Text
                style={{
                  fontSize: 13,
                  color: '#78716c',
                  paddingHorizontal: 8,
                  paddingVertical: 12,
                  fontFamily: 'Inter_500Medium',
                }}
              >
                Brak nadchodzących nabożeństw.
              </Text>
            ) : (
              programs.map((p) => {
                const isSelected = selected?.id === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelected(p)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'stretch',
                      gap: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      borderRadius: 14,
                      marginBottom: 8,
                      borderWidth: 1,
                      borderColor: isSelected ? '#ec4899' : '#eef0f3',
                      backgroundColor: isSelected ? '#fef3f2' : '#ffffff',
                    }}
                  >
                    <View
                      style={{
                        width: 4,
                        borderRadius: 2,
                        backgroundColor: p.typeColor || '#ec4899',
                      }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          color: '#78716c',
                          letterSpacing: 0.4,
                          textTransform: 'uppercase',
                          fontFamily: 'Inter_600SemiBold',
                        }}
                      >
                        {formatDate(p.date, 'EEEE, d MMM')}
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: '#0c0a09',
                          marginTop: 2,
                          letterSpacing: -0.2,
                          fontFamily: 'Inter_600SemiBold',
                        }}
                      >
                        {p.title || p.typeName || 'Nabożeństwo'}
                      </Text>
                    </View>
                    {isSelected ? <Check size={18} color="#ec4899" /> : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          <Text
            style={{
              fontSize: 11,
              color: '#78716c',
              marginBottom: 8,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Inter_700Bold',
            }}
          >
            Powód (opcjonalnie)
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="np. wyjazd, choroba..."
            placeholderTextColor="#a8a29e"
            multiline
            numberOfLines={2}
            style={{
              borderWidth: 1,
              borderColor: '#eef0f3',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 14,
              color: '#0c0a09',
              backgroundColor: '#fafaf9',
              minHeight: 60,
              textAlignVertical: 'top',
              fontFamily: 'Inter_400Regular',
            }}
          />

          <Pressable
            onPress={handleSubmit}
            disabled={!selected || isLoading}
            style={{
              marginTop: 16,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: !selected || isLoading ? '#e7e5e4' : '#ec4899',
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}>
              {isLoading ? 'Zapisywanie...' : 'Zgłoś nieobecność'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const AbsencesWidget = ({ items, upcomingPrograms = [] }: Props) => {
  const { user } = useAuthSession();
  const [modalOpen, setModalOpen] = useState(false);
  const reportAbsence = useReportAbsence(user?.email);
  const deleteAbsence = useDeleteAbsence();

  const handleDelete = (a: AbsenceItem) => {
    Alert.alert(
      'Usunąć nieobecność?',
      `Nieobecność na ${a.absence_date} zostanie usunięta.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: () =>
            deleteAbsence.mutate(a.id, {
              onError: (err: any) =>
                Alert.alert('Błąd', err?.message ?? 'Nie udało się usunąć'),
            }),
        },
      ],
    );
  };

  const reportedDates = new Set(items.map((a) => a.absence_date));
  const availablePrograms = upcomingPrograms.filter((p) => !reportedDates.has(p.date));

  const handleSubmit = (input: {
    programId: number | null;
    absenceDate: string;
    note: string;
  }) => {
    reportAbsence.mutate(input, {
      onSuccess: () => setModalOpen(false),
      onError: (err: any) =>
        Alert.alert('Błąd', err?.message ?? 'Nie udało się zgłosić nieobecności'),
    });
  };

  return (
    <>
      <WidgetCard
        title="Moje Nieobecności"
        Icon={CalendarX}
        badge={items.length > 0 ? String(items.length) : undefined}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Pressable
            onPress={() => setModalOpen(true)}
            className="active:opacity-70"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: '#e7e5e4',
            }}
          >
            <Plus size={14} color="#78716c" />
            <Text style={{ fontSize: 13, color: '#57534e', fontFamily: 'Inter_600SemiBold' }}>
              Zgłoś nieobecność
            </Text>
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 }}>
            {availablePrograms.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderRadius: 14,
                  backgroundColor: '#fafaf9',
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#ffedd5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CalendarX size={16} color="#c2410c" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 13,
                      color: '#0c0a09',
                      letterSpacing: -0.2,
                      fontFamily: 'Inter_600SemiBold',
                    }}
                  >
                    {availablePrograms[0].title ||
                      availablePrograms[0].typeName ||
                      'Nabożeństwo'}
                    , {formatDate(availablePrograms[0].date, 'd MMMM yyyy')}
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ paddingTop: 8 }}>
            {items.slice(0, 5).map((a, idx, arr) => {
              const meta = STATUS_META[a.status];
              return (
                <View
                  key={a.id}
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
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: meta.bg,
                    }}
                  >
                    <meta.Icon size={16} color={meta.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: '#0c0a09',
                        letterSpacing: -0.2,
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {formatDate(a.absence_date, 'EEEE, d MMM')}
                    </Text>
                    {a.note ? (
                      <Text
                        numberOfLines={1}
                        style={{
                          fontSize: 12,
                          color: '#78716c',
                          marginTop: 2,
                          fontFamily: 'Inter_400Regular',
                        }}
                      >
                        {a.note}
                      </Text>
                    ) : null}
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: meta.bg,
                    }}
                  >
                    <Text
                      style={{ fontSize: 10, color: meta.tint, fontFamily: 'Inter_700Bold' }}
                    >
                      {meta.label}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDelete(a)}
                    hitSlop={8}
                    disabled={deleteAbsence.isPending}
                    className="active:opacity-50"
                    style={{ padding: 6 }}
                  >
                    <Trash2 size={15} color="#a8a29e" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </WidgetCard>
      <ReportModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        programs={availablePrograms}
        onSubmit={handleSubmit}
        isLoading={reportAbsence.isPending}
      />
    </>
  );
};

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CalendarOff, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { pl } from 'date-fns/locale';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { GradientIcon } from '../../../src/components/ui/GradientIcon';
import { DatePickerModal } from '../../../src/features/serve/components/DatePickerModal';
import {
  useMyBlockouts,
  useAddBlockout,
  useDeleteBlockout,
  type Blockout,
} from '../../../src/features/serve/api';

const todayIso = () => format(new Date(), 'yyyy-MM-dd');
const fmt = (iso: string) => {
  try {
    return format(parseISO(iso), 'd MMM yyyy', { locale: pl });
  } catch {
    return iso;
  }
};

export default function AvailabilityScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useMyBlockouts();
  const add = useAddBlockout();
  const del = useDeleteBlockout();

  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [picker, setPicker] = useState<null | 'start' | 'end'>(null);

  const blockouts = data?.blockouts ?? [];
  const memberResolved = data?.memberResolved ?? false;

  const list = useMemo(() => {
    const today = todayIso();
    const sorted = [...blockouts].sort((a, b) => a.start_date.localeCompare(b.start_date));
    return onlyUpcoming ? sorted.filter((b: Blockout) => b.end_date >= today) : sorted;
  }, [blockouts, onlyUpcoming]);

  const openCreate = () => {
    setStartDate(todayIso());
    setEndDate(todayIso());
    setReason('');
    setModalOpen(true);
  };

  const save = async () => {
    if (endDate < startDate) {
      Alert.alert('Zakres dat', 'Data „do" nie może być wcześniejsza niż „od".');
      return;
    }
    try {
      await add.mutateAsync({ start_date: startDate, end_date: endDate, reason: reason.trim() || null });
      setModalOpen(false);
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać.');
    }
  };

  const confirmDelete = (b: Blockout) => {
    Alert.alert('Usunąć niedostępność?', `${fmt(b.start_date)} – ${fmt(b.end_date)}`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: () =>
          del.mutate(b.id, {
            onError: (e: any) => Alert.alert('Błąd', e?.message ?? 'Nie udało się usunąć.'),
          }),
      },
    ]);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <PageHeader
          title="Moja niedostępność"
          subtitle="Dni, w które nie możesz służyć"
          showBack
          right={
            <Pressable onPress={openCreate} className="active:opacity-80">
              <GradientIcon Icon={Plus} size={40} iconSize={20} rounded />
            </Pressable>
          }
        />

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 }}>
          <Pressable
            onPress={() => setOnlyUpcoming(true)}
            style={chip(onlyUpcoming)}
          >
            <Text style={chipText(onlyUpcoming)}>Nadchodzące</Text>
          </Pressable>
          <Pressable
            onPress={() => setOnlyUpcoming(false)}
            style={chip(!onlyUpcoming)}
          >
            <Text style={chipText(!onlyUpcoming)}>Wszystkie</Text>
          </Pressable>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#2A2312" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: '#e11d48', textAlign: 'center', fontFamily: 'Manrope_500Medium' }}>
              {(error as Error)?.message ?? 'Błąd'}
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#2A2312" />
            }
          >
            {!memberResolved ? (
              <View style={infoBox}>
                <Text style={{ fontSize: 13, color: '#8A6606', fontFamily: 'Manrope_500Medium', lineHeight: 19 }}>
                  Twoje konto nie jest jeszcze powiązane z profilem członka. Skontaktuj się z liderem,
                  aby móc zgłaszać niedostępność.
                </Text>
              </View>
            ) : list.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 48 }}>
                <View
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 18,
                    backgroundColor: '#ECE8DE',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <CalendarOff size={28} color="#857F70" />
                </View>
                <Text style={{ fontSize: 16, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                  {onlyUpcoming ? 'Brak nadchodzących' : 'Brak zgłoszeń'}
                </Text>
                <Text
                  style={{ fontSize: 13, color: '#6B6557', textAlign: 'center', marginTop: 4, fontFamily: 'Manrope_400Regular' }}
                >
                  Dodaj dni, w które nie możesz służyć — lider zobaczy to w grafiku.
                </Text>
              </View>
            ) : (
              list.map((b: Blockout) => (
                <View
                  key={b.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    marginBottom: 10,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#E6E1D5',
                    backgroundColor: '#F6F4EE',
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 12,
                      backgroundColor: '#FFF8E1',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CalendarOff size={18} color="#8A6606" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: '#2A2312', fontFamily: 'Manrope_600SemiBold' }}>
                      {b.start_date === b.end_date ? fmt(b.start_date) : `${fmt(b.start_date)} – ${fmt(b.end_date)}`}
                    </Text>
                    {b.reason ? (
                      <Text style={{ fontSize: 12, color: '#6B6557', marginTop: 2, fontFamily: 'Manrope_400Regular' }}>
                        {b.reason}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable onPress={() => confirmDelete(b)} hitSlop={8} style={{ padding: 6 }}>
                    <Trash2 size={17} color="#dc2626" />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>

      {/* Modal dodawania */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' }}
            onPress={() => setModalOpen(false)}
          >
            <Pressable
              style={{
                backgroundColor: '#F6F4EE',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                paddingBottom: 32,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>
                  Nowa niedostępność
                </Text>
                <Pressable onPress={() => setModalOpen(false)} hitSlop={10}>
                  <X size={20} color="#6B6557" />
                </Pressable>
              </View>

              <Text style={label}>Od</Text>
              <Pressable onPress={() => setPicker('start')} style={dateField}>
                <Text style={dateFieldText}>{fmt(startDate)}</Text>
                <ChevronRight size={16} color="#857F70" />
              </Pressable>

              <Text style={label}>Do</Text>
              <Pressable onPress={() => setPicker('end')} style={dateField}>
                <Text style={dateFieldText}>{fmt(endDate)}</Text>
                <ChevronRight size={16} color="#857F70" />
              </Pressable>

              <Text style={label}>Powód (opcjonalnie)</Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E6E1D5',
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  minHeight: 64,
                  textAlignVertical: 'top',
                  fontSize: 15,
                  color: '#2A2312',
                  backgroundColor: '#FFFFFF',
                  marginBottom: 20,
                  fontFamily: 'Manrope_400Regular',
                }}
                placeholder="np. urlop, wyjazd, choroba"
                placeholderTextColor="#857F70"
                multiline
                value={reason}
                onChangeText={setReason}
                editable={!add.isPending}
              />

              <GradientButton onPress={save} loading={add.isPending}>
                Zapisz niedostępność
              </GradientButton>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <DatePickerModal
        visible={picker === 'start'}
        value={startDate}
        title="Data początkowa"
        onSelect={(iso) => {
          setStartDate(iso);
          if (endDate < iso) setEndDate(iso);
        }}
        onClose={() => setPicker(null)}
      />
      <DatePickerModal
        visible={picker === 'end'}
        value={endDate}
        minDate={startDate}
        title="Data końcowa"
        onSelect={setEndDate}
        onClose={() => setPicker(null)}
      />
    </>
  );
}

const chip = (active: boolean) =>
  ({
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: active ? '#2A2312' : '#ECE8DE',
  }) as const;
const chipText = (active: boolean) =>
  ({ fontSize: 13, color: active ? '#ffffff' : '#2A2312', fontFamily: 'Manrope_600SemiBold' }) as const;
const label = {
  fontSize: 12,
  color: '#8A6606',
  marginBottom: 6,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
  fontFamily: 'Manrope_700Bold',
} as const;
const dateField = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  borderWidth: 1,
  borderColor: '#E6E1D5',
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 14,
  backgroundColor: '#FFFFFF',
  marginBottom: 16,
} as const;
const dateFieldText = { fontSize: 15, color: '#2A2312', fontFamily: 'Manrope_500Medium' } as const;
const infoBox = {
  padding: 14,
  borderRadius: 14,
  backgroundColor: '#FFF8E1',
  borderWidth: 1,
  borderColor: '#F3E3B0',
} as const;

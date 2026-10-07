import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Check, X } from 'lucide-react-native';
import { B } from '../../../components/ui/brand';
import { DateField, toYmd } from '../../../components/ui/DateField';
import {
  useCreateProgram,
  useDeleteProgram,
  useEventsAround,
  useProgramTypes,
  useUpdateProgramHeader,
  type LinkedEvent,
  type ProgramTypeRow,
} from '../api';
import { friendlyError } from '../../../lib/errors';

// Nowy program / edycja nagłówka programu (tytuł, data, typ). Przy nowym — opcjonalne
// podpięcie do wydarzenia z okolicy daty (jak „Nowy program” na stronie wydarzenia na webie).

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

const Label = ({ children }: { children: string }) => (
  <Text style={{ fontSize: 12, color: B.gold, fontFamily: F.bold, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
    {children}
  </Text>
);

const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
  <Pressable
    onPress={onPress}
    className="active:opacity-70"
    style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? B.ink : B.paper2 }}
  >
    <Text style={{ fontSize: 13, color: on ? '#fff' : B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

const dayLabel = (ymd: string) => ymd.split('-').reverse().slice(0, 2).join('.');
const fullDate = (ymd: string) => ymd.split('-').reverse().join('.');

export interface ProgramFormInitial {
  id?: number;
  title: string | null;
  date: string;
  typeId: number | null;
  // Nowy program z ekranu wydarzenia — od razu podpięty do tego wydarzenia.
  eventId?: number | null;
  eventTitle?: string | null;
}

interface Props {
  visible: boolean;
  initial: ProgramFormInitial | null;
  userEmail: string | null;
  campusIdForInsert: number | null;
  canDelete?: boolean;
  onClose: () => void;
  onCreated?: (id: number) => void;
  onDeleted?: () => void;
}

export const ProgramFormModal = ({ visible, initial, userEmail, campusIdForInsert, canDelete, onClose, onCreated, onDeleted }: Props) => {
  const editing = initial?.id != null;
  const types = useProgramTypes();
  const create = useCreateProgram(userEmail, campusIdForInsert);
  const update = useUpdateProgramHeader(initial?.id ?? -1);
  const remove = useDeleteProgram(initial?.id ?? -1);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toYmd(new Date()));
  const [typeId, setTypeId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const fixedEvent = !!initial?.eventId;
  const events = useEventsAround(date, visible && !editing && !fixedEvent);
  const busy = create.isPending || update.isPending;

  // Wartości startowe tylko przy otwarciu — rodzic podaje `initial` jako nowy obiekt przy
  // każdym renderze, więc zależność od niego kasowałaby wpisywany tekst.
  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setDate(initial?.date ?? toYmd(new Date()));
    setTypeId(initial?.typeId ?? null);
    setEventId(initial?.eventId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Wydarzenia tego dnia bez programu — do podpięcia nowego programu.
  const sameDay = useMemo(() => (events.data ?? []).filter((e: LinkedEvent & { hasProgram: boolean }) => e.date === date && !e.hasProgram), [events.data, date]);

  const save = async () => {
    if (busy) return;
    if (!date) {
      Alert.alert('Wybierz datę', 'Bez daty program nie trafi do planu nabożeństw.');
      return;
    }
    const payload = { title: title.trim() || null, date, typeId };
    try {
      if (editing) {
        await update.mutateAsync(payload);
        onClose();
      } else {
        const { id, linkFailed } = await create.mutateAsync({ ...payload, eventId });
        onClose();
        onCreated?.(id);
        if (linkFailed) {
          Alert.alert('Utworzono program', 'Nie udało się podpiąć go do wydarzenia — zrobisz to na ekranie programu („Podepnij do wydarzenia”).');
        }
      }
    } catch (e: unknown) {
      Alert.alert(
        editing ? 'Nie udało się zapisać programu' : 'Nie udało się utworzyć programu',
        friendlyError(e, 'Zmiany są nadal w oknie — spróbuj ponownie.'),
      );
    }
  };

  const programName = (initial?.title || '').trim() || 'Nabożeństwo';
  const confirmDelete = () =>
    Alert.alert(
      'Usunąć program?',
      `Program „${programName}” z dnia ${fullDate(initial?.date ?? date)} zostanie usunięty razem z planem. Zostanie odpięty od wydarzeń (wydarzenia i ich grafik zostają). Tej operacji nie można cofnąć.`,
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń program',
          style: 'destructive',
          onPress: async () => {
            try {
              const { unlinkFailed } = await remove.mutateAsync();
              onClose();
              onDeleted?.();
              if (unlinkFailed) {
                Alert.alert('Usunięto program', 'Wydarzenie może jeszcze pokazywać pusty plan — odepnij go na ekranie wydarzenia.');
              }
            } catch (e: unknown) {
              Alert.alert('Nie udało się usunąć programu', friendlyError(e, 'Spróbuj ponownie.'));
            }
          },
        },
      ],
    );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: B.ink, fontFamily: F.bold }}>{editing ? 'Edytuj program' : 'Nowy program'}</Text>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color={B.ink2} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Label>Nazwa</Label>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="np. Nabożeństwo niedzielne"
            placeholderTextColor={B.ink4}
            style={{ height: 46, borderRadius: 14, paddingHorizontal: 14, backgroundColor: B.paper2, fontSize: 15, color: B.ink, fontFamily: F.medium }}
          />

          <Label>Data</Label>
          <DateField value={date} onChange={setDate} />

          {(types.data ?? []).length ? (
            <>
              <Label>Kategoria</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Chip label="Bez kategorii" on={typeId == null} onPress={() => setTypeId(null)} />
                {(types.data ?? []).map((t: ProgramTypeRow) => (
                  <Chip key={t.id} label={t.name} on={typeId === t.id} onPress={() => setTypeId(t.id)} />
                ))}
              </View>
            </>
          ) : null}

          {!editing ? (
            <>
              <Label>Wydarzenie</Label>
              {fixedEvent ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: B.kurkumaSoft }}>
                  <Check size={16} color={B.goldDeep} strokeWidth={2.6} />
                  <Text style={{ flex: 1, fontSize: 14, color: B.ink, fontFamily: F.semibold }}>
                    Podepnę do: {initial?.eventTitle ?? 'tego wydarzenia'}
                  </Text>
                </View>
              ) : events.isLoading ? (
                <ActivityIndicator color={B.ink} style={{ alignSelf: 'flex-start' }} />
              ) : sameDay.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label="Bez wydarzenia" on={eventId == null} onPress={() => setEventId(null)} />
                  {sameDay.map((e: LinkedEvent) => (
                    <Chip key={e.id} label={`${e.title}${e.time ? ` · ${e.time}` : ''}`} on={eventId === e.id} onPress={() => setEventId(e.id)} />
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: B.ink3, fontFamily: F.medium }}>
                  {`Brak wydarzeń bez programu w dniu ${dayLabel(date)}. Program podepniesz później z ekranu programu albo wydarzenia.`}
                </Text>
              )}
            </>
          ) : null}

          <Pressable
            onPress={save}
            disabled={busy}
            className="active:opacity-80"
            style={{ marginTop: 22, height: 52, borderRadius: 999, backgroundColor: B.kurkuma, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color={B.ink} />
            ) : (
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: F.bold }}>{editing ? 'Zapisz' : 'Utwórz i dodaj plan'}</Text>
            )}
          </Pressable>
          {editing && canDelete ? (
            <Pressable onPress={confirmDelete} disabled={remove.isPending} className="active:opacity-70" style={{ marginTop: 10, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              {remove.isPending ? (
                <ActivityIndicator color="#B42318" />
              ) : (
                <Text style={{ fontSize: 15, color: '#B42318', fontFamily: F.semibold }}>Usuń program</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

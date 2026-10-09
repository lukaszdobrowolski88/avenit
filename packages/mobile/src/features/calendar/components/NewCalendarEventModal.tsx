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
import { X } from 'lucide-react-native';
import { DateField, TimeField, isValidTime, toYmd } from '../../../components/ui/DateField';
import { fieldStyle } from '../../../components/ui/brand';
import { PrimaryButton } from '../../../components/ui/Sheet';
import { showError } from '../../../lib/errors';
import { toast } from '../../../lib/toast';
import { usePermissions } from '../../../lib/permissions';
import { useModules } from '../../modules/useModules';
import {
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
  useEventCalendarKeys,
  useUpdateCalendarEvent,
} from '../create';

// Wydarzenie do edycji (ten sam formularz co „Nowe wydarzenie”).
export interface EditableEvent {
  id: number;
  title: string;
  moduleKey: string | null;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  description: string | null;
  // Opis sformatowany na webie (details_html) — wtedy opisu nie zmieniamy z telefonu.
  hasDetailsHtml: boolean;
}

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 12,
      color: '#8A6606',
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 6,
    }}
  >
    {children}
  </Text>
);

// Pola jak na webie: biel + ramka (wcześniej szare tło bez ramki).
const inputStyle = { ...fieldStyle, minHeight: 48, paddingVertical: 10 } as const;

export const NewCalendarEventModal = ({
  visible,
  onClose,
  userEmail,
  campusIdForInsert,
  editing,
  canDelete,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  userEmail: string | null;
  campusIdForInsert: number | null;
  editing?: EditableEvent | null;
  canDelete?: boolean;
  onDeleted?: () => void;
}) => {
  const create = useCreateCalendarEvent(userEmail, campusIdForInsert);
  const update = useUpdateCalendarEvent(editing?.id ?? -1);
  const remove = useDeleteCalendarEvent(editing?.id ?? -1);
  const busy = create.isPending || update.isPending;
  const calendars = useEventCalendarKeys();
  const { items } = useModules();
  const perms = usePermissions();
  // Dodać wydarzenie (albo przenieść je) do kalendarza wolno z prawem globalnym ALBO w zakresie
  // służby tego kalendarza — jak serwer (moduleScope.js). „Ogólne” = tylko prawo globalne.
  // Lider służby bez prawa globalnego nie dostaje „Ogólnych” (zapis kończył się 403).
  const allowed = (key: string | null) => perms.canModule(key, 'events', 'create');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toYmd(new Date()));
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [moduleKey, setModuleKey] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setDate(editing?.date ?? toYmd(new Date()));
    setTime(editing?.time ?? '');
    setEndTime(editing?.endTime ?? '');
    setLocation(editing?.location ?? '');
    setModuleKey(editing?.moduleKey ?? null);
    setDescription(editing?.description ?? '');
    // Tylko przy otwarciu — `editing` przychodzi jako nowy obiekt przy każdym renderze rodzica,
    // a zależność od niego kasowałaby wpisywany tekst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Kalendarze modułów, które kościół ma w event_calendars, do których mam dostęp i prawo
  // dodawania wydarzeń. Edytowane wydarzenie zostaje w swoim kalendarzu (zawsze wybieralnym).
  const options = useMemo(() => {
    const keys: string[] = calendars.data ?? [];
    const all = [
      { key: null as string | null, label: 'Ogólne' },
      ...items.filter((m) => keys.includes(m.key)).map((m) => ({ key: m.key as string | null, label: m.label })),
    ];
    const out = all.filter((o) => allowed(o.key) || (!!editing && o.key === (editing.moduleKey ?? null)));
    // Edytowane wydarzenie z kalendarza spoza listy — zostaw je wybieralne.
    if (editing && !out.some((o) => o.key === (editing.moduleKey ?? null))) {
      const key = editing.moduleKey ?? null;
      out.unshift({ key, label: key ? items.find((m) => m.key === key)?.label ?? key : 'Ogólne' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars.data, items, editing, perms.canModule]);

  // Nowe wydarzenie: domyślnie pierwszy dozwolony kalendarz (zamiast zawsze „Ogólnych”),
  // gdy bieżący wybór nie jest dozwolony — wybór użytkownika zostaje nietknięty.
  useEffect(() => {
    if (!visible || editing) return;
    if (options.length && !options.some((o) => o.key === moduleKey)) setModuleKey(options[0].key);
  }, [visible, editing, options, moduleKey]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('Podaj tytuł', 'Tytuł wydarzenia jest wymagany.');
    if (time && !isValidTime(time)) return Alert.alert('Błędna godzina', 'Wybierz godzinę początku.');
    if (endTime && !isValidTime(endTime)) return Alert.alert('Błędna godzina końca', 'Wybierz godzinę końca.');
    if (time && endTime && endTime <= time) return Alert.alert('Koniec przed początkiem', 'Godzina końca musi być późniejsza niż początek.');
    // Nowe wydarzenie albo przeniesienie do innego kalendarza — prawo dodawania w docelowym.
    const moving = !editing || (editing.moduleKey ?? null) !== moduleKey;
    if (moving && !allowed(moduleKey)) {
      return Alert.alert('Brak uprawnień', 'Nie możesz dodawać wydarzeń do tego kalendarza. Wybierz inny kalendarz.');
    }
    const payload = {
      title: title.trim(),
      moduleKey,
      date,
      time: time || null,
      endTime: (time && endTime) || null,
      location: location.trim() || null,
      ...(editing?.hasDetailsHtml ? {} : { description: description.trim() || null }),
    };
    try {
      if (editing) await update.mutateAsync(payload);
      else await create.mutateAsync(payload);
      onClose();
      toast.success(editing ? 'Zapisano zmiany' : 'Wydarzenie dodane');
    } catch (e) {
      showError(editing ? 'Nie udało się zapisać wydarzenia' : 'Nie udało się dodać wydarzenia', e);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Usunąć wydarzenie?', `„${editing?.title ?? ''}” zniknie z kalendarza u wszystkich, razem z grafikiem służb tego wydarzenia. Tej operacji nie można cofnąć.`, [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync();
            onClose();
            onDeleted?.();
            toast.success('Wydarzenie usunięte');
          } catch (e) {
            showError('Nie udało się usunąć wydarzenia', e);
          }
        },
      },
    ]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{editing ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Zamknij" className="active:opacity-60">
            <X size={22} color="#4A463E" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Label>Tytuł</Label>
          <TextInput value={title} onChangeText={setTitle} placeholder="Np. spotkanie liderów" placeholderTextColor="#6E685A" style={inputStyle} />

          <Label>Kalendarz</Label>
          {!editing && perms.ready && options.length === 0 ? (
            <Text style={{ fontSize: 13, lineHeight: 18, color: '#B42318', fontFamily: 'Manrope_500Medium' }}>
              Nie masz uprawnień do dodawania wydarzeń w żadnym kalendarzu.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {options.map((o) => {
              const on = o.key === moduleKey;
              return (
                <Pressable
                  key={o.key ?? 'general'}
                  onPress={() => setModuleKey(o.key)}
                  className="active:opacity-70"
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? '#2A2312' : '#ECE8DE' }}
                >
                  <Text style={{ fontSize: 13, color: on ? '#ffffff' : '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Label>Data</Label>
          <DateField value={date} onChange={setDate} />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Label>Początek</Label>
              <TimeField value={time} onChange={setTime} title="Początek" placeholder="Cały dzień" optional suggest="18:00" />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Koniec</Label>
              <TimeField value={endTime} onChange={setEndTime} title="Koniec" placeholder="opcjonalnie" optional from={time || null} />
            </View>
          </View>

          <Label>Miejsce</Label>
          <TextInput value={location} onChangeText={setLocation} placeholder="Np. sala główna" placeholderTextColor="#6E685A" style={inputStyle} />

          <Label>Opis</Label>
          {editing?.hasDetailsHtml ? (
            <Text style={{ fontSize: 13, lineHeight: 18, color: '#6B6557', fontFamily: 'Manrope_500Medium' }}>
              Opis ma formatowanie z weba — zmienisz go na stronie wydarzenia w przeglądarce.
            </Text>
          ) : (
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Co warto wiedzieć? (opcjonalnie)"
              placeholderTextColor="#6E685A"
              multiline
              style={[inputStyle, { height: 96, paddingTop: 12, textAlignVertical: 'top' as const }]}
            />
          )}

          <Text style={{ fontSize: 12, lineHeight: 17, color: '#6E685A', marginTop: 14, fontFamily: 'Manrope_400Regular' }}>
            Program, służby, zapisy, płatności i widoczność ustawisz na webie na stronie wydarzenia.
          </Text>

          <View style={{ marginTop: 20 }}>
            <PrimaryButton
              label={editing ? 'Zapisz zmiany' : 'Dodaj wydarzenie'}
              onPress={save}
              busy={busy}
              disabled={!editing && options.length === 0}
              tone="ink"
            />
          </View>
          {editing && canDelete ? (
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              className="active:opacity-70"
              style={{ marginTop: 10, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
            >
              {remove.isPending ? (
                <ActivityIndicator color="#B42318" />
              ) : (
                <Text style={{ fontSize: 15, color: '#B42318', fontFamily: 'Manrope_600SemiBold' }}>Usuń wydarzenie</Text>
              )}
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

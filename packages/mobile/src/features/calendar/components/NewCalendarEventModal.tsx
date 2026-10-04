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
import { useModules } from '../../modules/useModules';
import { useCreateCalendarEvent, useEventCalendarKeys } from '../create';

const Label = ({ children }: { children: string }) => (
  <Text
    style={{
      fontSize: 12,
      color: '#4A463E',
      fontFamily: 'Manrope_700Bold',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 6,
    }}
  >
    {children}
  </Text>
);

const inputStyle = {
  height: 46,
  borderRadius: 14,
  paddingHorizontal: 14,
  backgroundColor: '#ECE8DE',
  fontSize: 15,
  color: '#2A2312',
  fontFamily: 'Manrope_500Medium',
} as const;

export const NewCalendarEventModal = ({
  visible,
  onClose,
  userEmail,
  campusIdForInsert,
}: {
  visible: boolean;
  onClose: () => void;
  userEmail: string | null;
  campusIdForInsert: number | null;
}) => {
  const create = useCreateCalendarEvent(userEmail, campusIdForInsert);
  const calendars = useEventCalendarKeys();
  const { items } = useModules();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toYmd(new Date()));
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [moduleKey, setModuleKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setDate(toYmd(new Date()));
      setTime('');
      setEndTime('');
      setLocation('');
      setModuleKey(null);
    }
  }, [visible]);

  // Kalendarze modułów, które kościół ma w event_calendars i do których mam dostęp.
  const options = useMemo(() => {
    const keys: string[] = calendars.data ?? [];
    return [
      { key: null as string | null, label: 'Ogólne' },
      ...items.filter((m) => keys.includes(m.key)).map((m) => ({ key: m.key as string | null, label: m.label })),
    ];
  }, [calendars.data, items]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('Podaj tytuł', 'Tytuł wydarzenia jest wymagany.');
    if (time && !isValidTime(time)) return Alert.alert('Błędna godzina', 'Wpisz godzinę jako GG:MM, np. 18:30.');
    if (endTime && !isValidTime(endTime)) return Alert.alert('Błędna godzina końca', 'Wpisz godzinę jako GG:MM.');
    try {
      await create.mutateAsync({
        title: title.trim(),
        moduleKey,
        date,
        time: time || null,
        endTime: endTime || null,
        location: location.trim() || null,
      });
      onClose();
    } catch (e: any) {
      Alert.alert('Nie udało się dodać', e?.message ?? 'Spróbuj ponownie.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#F6F4EE' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 4 }}>
          <Text style={{ flex: 1, fontSize: 20, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>Nowe wydarzenie</Text>
          <Pressable onPress={onClose} hitSlop={10} className="active:opacity-60">
            <X size={22} color="#4A463E" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Label>Tytuł</Label>
          <TextInput value={title} onChangeText={setTitle} placeholder="np. Spotkanie liderów" placeholderTextColor="#A8A59E" style={inputStyle} />

          <Label>Kalendarz</Label>
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
              <TimeField value={time} onChange={setTime} placeholder="np. 18:00" />
            </View>
            <View style={{ flex: 1 }}>
              <Label>Koniec</Label>
              <TimeField value={endTime} onChange={setEndTime} placeholder="opcjonalnie" />
            </View>
          </View>

          <Label>Miejsce</Label>
          <TextInput value={location} onChangeText={setLocation} placeholder="np. Sala główna" placeholderTextColor="#A8A59E" style={inputStyle} />

          <Text style={{ fontSize: 12, lineHeight: 17, color: '#A8A59E', marginTop: 14, fontFamily: 'Manrope_400Regular' }}>
            Opis, zapisy, płatności i widoczność ustawisz na webie na stronie wydarzenia.
          </Text>

          <Pressable
            onPress={save}
            disabled={create.isPending}
            className="active:opacity-80"
            style={{
              marginTop: 20,
              height: 52,
              borderRadius: 16,
              backgroundColor: '#2A2312',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: create.isPending ? 0.6 : 1,
            }}
          >
            {create.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>Dodaj wydarzenie</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

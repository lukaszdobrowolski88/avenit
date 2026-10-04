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
import { X } from 'lucide-react-native';
import { DateField, TimeField } from '../../../components/ui/DateField';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    description: string | null;
    eventType: string;
    startDate: string;
    endDate: string | null;
    location: string | null;
  }) => Promise<void> | void;
  isLoading: boolean;
  eventTypes: { key: string; label: string }[];
  defaultType: string;
}

const padNum = (n: number) => String(n).padStart(2, '0');

export const NewEventModal = ({
  visible,
  onClose,
  onSubmit,
  isLoading,
  eventTypes,
  defaultType,
}: Props) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(defaultType);
  const [location, setLocation] = useState('');
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`;
  });
  const [timeStr, setTimeStr] = useState('19:00');

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Wpisz tytuł', 'Tytuł wydarzenia jest wymagany.');
      return;
    }
    const dateTimeMatch = `${dateStr}T${timeStr}:00`;
    const startDate = new Date(dateTimeMatch);
    if (isNaN(startDate.getTime())) {
      Alert.alert('Wybierz termin', 'Ustaw datę i godzinę wydarzenia.');
      return;
    }
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || null,
        eventType: type,
        startDate: startDate.toISOString(),
        endDate: null,
        location: location.trim() || null,
      });
      setTitle('');
      setDescription('');
      setLocation('');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać');
    }
  };

  const labelStyle = {
    fontSize: 11,
    color: '#8A6606',
    marginBottom: 6,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    fontFamily: 'Manrope_700Bold',
  };
  // Pola wyboru daty/godziny w stylu pozostałych pól formularza (białe z ramką).
  const pickerStyle = { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E1D5', height: 48, marginBottom: 12 };
  const inputStyle = {
    borderWidth: 1,
    borderColor: '#E6E1D5',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2A2312',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    fontFamily: 'Manrope_400Regular' as const,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.4)',
        }}
      >
        <View
          style={{
            backgroundColor: '#F6F4EE',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 20,
            paddingBottom: 32,
            maxHeight: '90%',
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
                color: '#2A2312',
                letterSpacing: -0.4,
                fontFamily: 'Manrope_700Bold',
              }}
            >
              Nowe wydarzenie
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={labelStyle}>Tytuł</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="np. Próba przed niedzielą"
              placeholderTextColor="#857F70"
              style={inputStyle}
            />

            <Text style={labelStyle}>Typ</Text>
            <View
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}
            >
              {eventTypes.map((t) => {
                const active = type === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setType(t.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: active ? '#2A2312' : '#ECE8DE',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: active ? '#ffffff' : '#2A2312',
                        fontFamily: 'Manrope_600SemiBold',
                      }}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={labelStyle}>Data</Text>
            <DateField value={dateStr} onChange={setDateStr} style={pickerStyle} />
            <Text style={labelStyle}>Godzina</Text>
            <View style={{ width: '50%' }}>
              <TimeField value={timeStr} onChange={setTimeStr} title="Godzina" style={pickerStyle} />
            </View>

            <Text style={labelStyle}>Miejsce (opcjonalnie)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="np. Sala główna"
              placeholderTextColor="#857F70"
              style={inputStyle}
            />

            <Text style={labelStyle}>Opis (opcjonalnie)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Dodatkowe info dla zespołu…"
              placeholderTextColor="#857F70"
              multiline
              style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' as const }]}
            />

            <Pressable
              onPress={handleSubmit}
              disabled={!title.trim() || isLoading}
              style={{
                marginTop: 4,
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
                backgroundColor: !title.trim() || isLoading ? '#E3DDD0' : '#2A2312',
              }}
            >
              <Text
                style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}
              >
                {isLoading ? 'Zapisywanie…' : 'Zapisz wydarzenie'}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

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
      Alert.alert('Błędna data', 'Format: YYYY-MM-DD i HH:MM');
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
    color: '#78716c',
    marginBottom: 6,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    fontFamily: 'Inter_700Bold',
  };
  const inputStyle = {
    borderWidth: 1,
    borderColor: '#eef0f3',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0c0a09',
    backgroundColor: '#fafaf9',
    marginBottom: 12,
    fontFamily: 'Inter_400Regular' as const,
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
            backgroundColor: '#ffffff',
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
                color: '#0c0a09',
                letterSpacing: -0.4,
                fontFamily: 'Inter_700Bold',
              }}
            >
              Nowe wydarzenie
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#78716c" />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={labelStyle}>Tytuł</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="np. Próba przed niedzielą"
              placeholderTextColor="#a8a29e"
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
                      backgroundColor: active ? '#0c0a09' : '#fafaf9',
                      borderWidth: 1,
                      borderColor: active ? '#0c0a09' : '#eef0f3',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: active ? '#ffffff' : '#1c1917',
                        fontFamily: 'Inter_600SemiBold',
                      }}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 2 }}>
                <Text style={labelStyle}>Data (YYYY-MM-DD)</Text>
                <TextInput
                  value={dateStr}
                  onChangeText={setDateStr}
                  placeholder="2026-05-10"
                  placeholderTextColor="#a8a29e"
                  style={inputStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={labelStyle}>Godzina</Text>
                <TextInput
                  value={timeStr}
                  onChangeText={setTimeStr}
                  placeholder="19:00"
                  placeholderTextColor="#a8a29e"
                  style={inputStyle}
                />
              </View>
            </View>

            <Text style={labelStyle}>Miejsce (opcjonalnie)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="np. Sala główna"
              placeholderTextColor="#a8a29e"
              style={inputStyle}
            />

            <Text style={labelStyle}>Opis (opcjonalnie)</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Dodatkowe info dla zespołu…"
              placeholderTextColor="#a8a29e"
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
                backgroundColor: !title.trim() || isLoading ? '#e7e5e4' : '#ec4899',
              }}
            >
              <Text
                style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Inter_700Bold' }}
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

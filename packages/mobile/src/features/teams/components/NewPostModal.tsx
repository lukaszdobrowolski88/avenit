import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { title: string; content: string }) => Promise<void> | void;
  isLoading: boolean;
}

export const NewPostModal = ({ visible, onClose, onSubmit, isLoading }: Props) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async () => {
    const c = content.trim();
    if (!c) {
      Alert.alert('Wpisz treść', 'Treść posta nie może być pusta.');
      return;
    }
    try {
      await onSubmit({ title: title.trim(), content: c });
      setTitle('');
      setContent('');
    } catch (e: any) {
      Alert.alert('Błąd', e?.message ?? 'Nie udało się zapisać posta');
    }
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
              Nowy post
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#6B6557" />
            </Pressable>
          </View>

          <Text
            style={{
              fontSize: 11,
              color: '#6B6557',
              marginBottom: 6,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Manrope_700Bold',
            }}
          >
            Tytuł (opcjonalnie)
          </Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="np. Próba w piątek"
            placeholderTextColor="#857F70"
            style={{
              borderWidth: 1,
              borderColor: '#E6E1D5',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 15,
              color: '#2A2312',
              backgroundColor: '#F1EEE6',
              marginBottom: 14,
              fontFamily: 'Manrope_500Medium',
            }}
          />

          <Text
            style={{
              fontSize: 11,
              color: '#6B6557',
              marginBottom: 6,
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              fontFamily: 'Manrope_700Bold',
            }}
          >
            Treść
          </Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="Napisz coś do zespołu…"
            placeholderTextColor="#857F70"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#E6E1D5',
              borderRadius: 14,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 14,
              color: '#2A2312',
              backgroundColor: '#F1EEE6',
              minHeight: 120,
              textAlignVertical: 'top',
              fontFamily: 'Manrope_400Regular',
            }}
          />

          <Pressable
            onPress={handleSubmit}
            disabled={!content.trim() || isLoading}
            style={{
              marginTop: 16,
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              backgroundColor: !content.trim() || isLoading ? '#E3DDD0' : '#2A2312',
            }}
          >
            <Text
              style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}
            >
              {isLoading ? 'Publikowanie…' : 'Opublikuj'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

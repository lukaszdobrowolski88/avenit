import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

// Okienko z jednym polem (np. zmiana nazwy). Alert.prompt istnieje tylko na iOS.
export const PromptModal = ({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel = 'Zapisz',
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'center', padding: 24 }}
      >
        <View style={{ backgroundColor: '#ffffff', borderRadius: 22, padding: 18, gap: 14 }}>
          <Text style={{ fontSize: 17, color: '#0c0a09', fontFamily: 'Inter_700Bold' }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor="#a8a29e"
            autoFocus
            selectTextOnFocus
            style={{
              height: 46,
              borderRadius: 14,
              paddingHorizontal: 14,
              backgroundColor: '#f5f5f4',
              fontSize: 15,
              color: '#0c0a09',
              fontFamily: 'Inter_500Medium',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onCancel}
              className="active:opacity-70"
              style={{ flex: 1, height: 46, borderRadius: 14, backgroundColor: '#f5f5f4', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 15, color: '#44403c', fontFamily: 'Inter_600SemiBold' }}>Anuluj</Text>
            </Pressable>
            <Pressable
              onPress={() => value.trim() && onConfirm(value.trim())}
              className="active:opacity-70"
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                backgroundColor: value.trim() ? '#0c0a09' : '#d6d3d1',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Inter_600SemiBold' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

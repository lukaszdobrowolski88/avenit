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
        <View style={{ backgroundColor: '#F6F4EE', borderRadius: 22, padding: 18, gap: 14 }}>
          <Text style={{ fontSize: 17, color: '#2A2312', fontFamily: 'Manrope_700Bold' }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor="#857F70"
            autoFocus
            selectTextOnFocus
            style={{
              height: 46,
              borderRadius: 14,
              paddingHorizontal: 14,
              backgroundColor: '#ECE8DE',
              fontSize: 15,
              color: '#2A2312',
              fontFamily: 'Manrope_500Medium',
            }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onCancel}
              className="active:opacity-70"
              style={{ flex: 1, height: 46, borderRadius: 14, backgroundColor: '#ECE8DE', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 15, color: '#3A3427', fontFamily: 'Manrope_600SemiBold' }}>Anuluj</Text>
            </Pressable>
            <Pressable
              onPress={() => value.trim() && onConfirm(value.trim())}
              className="active:opacity-70"
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                backgroundColor: value.trim() ? '#2A2312' : '#D3CCBC',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 15, color: '#ffffff', fontFamily: 'Manrope_600SemiBold' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

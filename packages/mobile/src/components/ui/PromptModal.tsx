import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { B, fieldStyle } from './brand';
import { useAsyncPress } from '../../hooks/useAsyncPress';

// Okienko z jednym polem (np. zmiana nazwy). Alert.prompt istnieje tylko na iOS.
// `onConfirm` może być async — przycisk jest wtedy zajęty do końca zapisu (bez podwójnego zapisu).
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
  onConfirm: (value: string) => unknown;
}) => {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const ready = !!value.trim();
  const { busy, press } = useAsyncPress(() => (ready ? onConfirm(value.trim()) : undefined));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(12,10,9,0.35)', justifyContent: 'center', padding: 24 }}
      >
        <View style={{ backgroundColor: B.paper, borderRadius: 22, padding: 18, gap: 14 }}>
          <Text style={{ fontSize: 17, color: B.ink, fontFamily: 'Manrope_700Bold' }}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={B.ink4}
            autoFocus
            selectTextOnFocus
            editable={!busy}
            style={[fieldStyle, { minHeight: 46, paddingVertical: 10 }]}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="active:opacity-70"
              style={{ flex: 1, height: 46, borderRadius: 14, backgroundColor: B.paper2, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 15, color: B.ink, fontFamily: 'Manrope_600SemiBold' }}>Anuluj</Text>
            </Pressable>
            <Pressable
              onPress={press}
              disabled={!ready || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready, busy }}
              className="active:opacity-70"
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                backgroundColor: ready ? B.ink : B.paper2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={{ fontSize: 15, color: ready ? '#FFFFFF' : B.ink4, fontFamily: 'Manrope_600SemiBold' }}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

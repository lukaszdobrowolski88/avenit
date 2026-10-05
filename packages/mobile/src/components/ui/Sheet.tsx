import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { B } from './brand';

// Arkusz (pageSheet) w stylu marki: papier, nagłówek z tytułem, przewijana treść
// i opcjonalna stopka z głównym przyciskiem przyklejona nad klawiaturą.

const F = { medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold' } as const;

export const Sheet = ({
  visible,
  title,
  eyebrow,
  subtitle,
  onClose,
  footer,
  children,
  scroll = true,
}: {
  visible: boolean;
  title: string;
  eyebrow?: string | null;
  subtitle?: string | null;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10 }}>
          <View style={{ flex: 1 }}>
            {eyebrow ? (
              <Text style={{ fontSize: 11, color: B.gold, letterSpacing: 1.3, textTransform: 'uppercase', fontFamily: F.bold, marginBottom: 3 }}>
                {eyebrow}
              </Text>
            ) : null}
            <Text style={{ fontSize: 22, color: B.ink, letterSpacing: -0.5, fontFamily: F.bold }}>{title}</Text>
            {subtitle ? <Text style={{ marginTop: 3, fontSize: 13, color: B.ink3, fontFamily: F.medium }}>{subtitle}</Text> : null}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityLabel="Zamknij"
            className="active:opacity-60"
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: B.card, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} color={B.ink2} />
          </Pressable>
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{children}</View>
        )}
        {footer ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16), backgroundColor: B.paper }}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const FormLabel = ({ children, first }: { children: string; first?: boolean }) => (
  <Text
    style={{
      fontSize: 11,
      color: B.gold,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      fontFamily: F.bold,
      marginTop: first ? 6 : 18,
      marginBottom: 8,
      marginLeft: 2,
    }}
  >
    {children}
  </Text>
);

export const FormInput = ({ style, multiline, ...props }: TextInputProps) => (
  <TextInput
    placeholderTextColor={B.ink4}
    multiline={multiline}
    {...props}
    style={[
      {
        minHeight: 48,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: B.card,
        fontSize: 15,
        color: B.ink,
        fontFamily: F.medium,
      },
      multiline ? { minHeight: 96, textAlignVertical: 'top' as const, lineHeight: 21 } : null,
      style,
    ]}
  />
);

export const Chip = ({ label, on, onPress, disabled }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    className="active:opacity-70"
    style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? B.ink : B.card, opacity: disabled ? 0.45 : 1 }}
  >
    <Text style={{ fontSize: 13, color: on ? '#FFFFFF' : B.ink, fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

export const PrimaryButton = ({
  label,
  onPress,
  busy,
  disabled,
  tone = 'kurkuma',
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: 'kurkuma' | 'ink';
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy || disabled}
    className="active:opacity-80"
    style={{
      height: 52,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tone === 'ink' ? B.ink : B.kurkuma,
      opacity: disabled ? 0.45 : busy ? 0.7 : 1,
    }}
  >
    {busy ? (
      <ActivityIndicator color={tone === 'ink' ? '#FFFFFF' : B.ink} />
    ) : (
      <Text style={{ fontSize: 15, color: tone === 'ink' ? '#FFFFFF' : B.ink, fontFamily: F.bold }}>{label}</Text>
    )}
  </Pressable>
);

export const DangerLink = ({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) => (
  <Pressable onPress={onPress} disabled={busy} className="active:opacity-70" style={{ marginTop: 14, height: 46, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 15, color: '#B42318', fontFamily: F.semibold }}>{label}</Text>
  </Pressable>
);

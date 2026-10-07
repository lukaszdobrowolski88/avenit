import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { completeTwoFactorLogin, signOut } from '../../src/lib/auth';
import { GradientButton } from '../../src/components/ui/GradientButton';
import { B, fieldStyle } from '../../src/components/ui/brand';
import { showError } from '../../src/lib/errors';

// Drugi krok logowania. Kod z aplikacji (6 cyfr, klawiatura numeryczna) albo kod zapasowy
// (litery i cyfry — klawiatura zwykła; wcześniej numeryczna uniemożliwiała jego wpisanie).
export default function TotpScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);

  const handleVerify = async () => {
    const value = code.trim();
    if (!backup && value.length < 6) {
      Alert.alert('Wpisz kod', 'Wprowadź 6-cyfrowy kod z aplikacji uwierzytelniającej.');
      return;
    }
    if (backup && value.length < 6) {
      Alert.alert('Wpisz kod zapasowy', 'Wprowadź jeden z kodów zapasowych zapisanych przy włączaniu zabezpieczenia.');
      return;
    }
    // Serwer weryfikuje kod i dopiero wtedy wydaje sesję (kod zapasowy też obsłuży).
    const { error } = await completeTwoFactorLogin(backup ? value.toUpperCase() : value);
    if (error) {
      showError('Nie udało się zalogować', error, 'Kod jest nieprawidłowy albo wygasł. Wpisz aktualny kod.');
      return;
    }
    router.replace('/(auth)/biometric');
  };

  const handleCancel = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: B.paper, paddingHorizontal: 24, justifyContent: 'center' }}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: 24, color: B.ink, marginBottom: 6, letterSpacing: -0.5, fontFamily: 'Manrope_700Bold' }}
      >
        Uwierzytelnianie dwuskładnikowe
      </Text>
      <Text style={{ fontSize: 14, lineHeight: 20, color: B.ink3, marginBottom: 24, fontFamily: 'Manrope_500Medium' }}>
        {backup
          ? 'Wpisz jeden z kodów zapasowych. Każdy kod działa tylko raz.'
          : 'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.'}
      </Text>

      <TextInput
        key={backup ? 'backup' : 'totp'}
        style={[
          fieldStyle,
          { paddingVertical: 14, fontSize: 22, textAlign: 'center', letterSpacing: backup ? 3 : 8, marginBottom: 24, fontFamily: 'Manrope_600SemiBold' },
        ]}
        keyboardType={backup ? 'default' : 'number-pad'}
        autoCapitalize={backup ? 'characters' : 'none'}
        autoCorrect={false}
        textContentType={backup ? 'none' : 'oneTimeCode'}
        autoComplete={backup ? 'off' : 'one-time-code'}
        maxLength={backup ? 16 : 6}
        autoFocus
        placeholder={backup ? 'ABCD1234' : '123456'}
        placeholderTextColor={B.ink4}
        accessibilityLabel={backup ? 'Kod zapasowy' : 'Kod z aplikacji'}
        value={code}
        onChangeText={setCode}
      />

      <GradientButton onPress={handleVerify}>Zweryfikuj</GradientButton>

      <Pressable
        onPress={() => {
          setBackup((b) => !b);
          setCode('');
        }}
        accessibilityRole="button"
        style={{ minHeight: 44, justifyContent: 'center', marginTop: 12 }}
      >
        <Text style={{ textAlign: 'center', fontSize: 14, color: B.gold, fontFamily: 'Manrope_600SemiBold' }}>
          {backup ? 'Użyj kodu z aplikacji' : 'Nie masz telefonu? Użyj kodu zapasowego'}
        </Text>
      </Pressable>

      <Pressable onPress={handleCancel} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ textAlign: 'center', fontSize: 13, color: B.ink3, fontFamily: 'Manrope_500Medium' }}>
          Anuluj i wróć do logowania
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

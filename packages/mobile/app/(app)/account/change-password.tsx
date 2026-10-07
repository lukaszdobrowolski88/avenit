import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { GradientButton } from '../../../src/components/ui/GradientButton';
import { B, fieldStyle } from '../../../src/components/ui/brand';
import { supabase } from '../../../src/lib/supabase';
import { showError } from '../../../src/lib/errors';
import { toast } from '../../../src/lib/toast';
import { goBack } from '../../../src/lib/navigation';

// Zmiana hasła zalogowanej osoby — jak sekcja „Zmiana hasła” w „Mój profil” na webie.
// (Wcześniej konto otwierało ekran resetu z logowania, który po zapisie wyrzucał na ekran logowania.)
// Politykę haseł (długość, złożoność) sprawdza serwer i zwraca polski komunikat.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const save = async () => {
    if (password.length < 6) {
      Alert.alert('Za krótkie hasło', 'Hasło musi mieć min. 6 znaków.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Hasła nie są identyczne', 'Wpisz to samo hasło w obu polach.');
      return;
    }
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.updateUser({ password }));
    } catch (e) {
      error = e;
    }
    if (error) {
      showError('Nie udało się zmienić hasła', error);
      return;
    }
    toast.success('Hasło zostało zmienione.');
    goBack(router);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Zmiana hasła" subtitle="Bezpieczeństwo i logowanie" showBack />
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Nowe hasło</Text>
          <TextInput
            style={[fieldStyle, { marginBottom: 16 }]}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            placeholder="••••••••"
            placeholderTextColor={B.ink4}
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Nowe hasło"
          />
          <Text style={styles.label}>Potwierdź hasło</Text>
          <TextInput
            style={[fieldStyle, { marginBottom: 8 }]}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            placeholder="••••••••"
            placeholderTextColor={B.ink4}
            value={confirm}
            onChangeText={setConfirm}
            accessibilityLabel="Potwierdź hasło"
          />
          <Text style={{ fontSize: 12, lineHeight: 17, color: B.ink4, marginBottom: 22, marginLeft: 2, fontFamily: 'Manrope_500Medium' }}>
            Po zmianie pozostajesz zalogowany na tym telefonie.
          </Text>
          <GradientButton onPress={save} disabled={!password || !confirm}>
            Zmień hasło
          </GradientButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = {
  label: {
    fontSize: 12,
    color: B.gold,
    marginBottom: 6,
    marginLeft: 2,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    fontFamily: 'Manrope_700Bold',
  } as const,
};

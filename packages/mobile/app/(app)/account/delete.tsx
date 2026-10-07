import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../../src/components/ui/PageHeader';
import { B, fieldStyle } from '../../../src/components/ui/brand';
import { supabase } from '../../../src/lib/supabase';
import { signOut, useAuthSession } from '../../../src/lib/auth';
import { friendlyError } from '../../../src/lib/errors';
import { SUPPORT_EMAIL } from '../../../src/features/account/terms';

// Usunięcie konta w aplikacji (wytyczna App Store 5.1.1(v)). Potwierdzenie hasłem; serwer
// (fn delete-my-account) usuwa konto i dane osobiste z aplikacji, a administratorów kościoła
// prosi e-mailem o przejrzenie kartoteki członków.
const GONE = [
  'konto i logowanie na wszystkich urządzeniach',
  'Twoje prośby modlitewne i modlitwy za innych',
  'udział w rozmowach Komunikatora (wysłane wiadomości zostaną podpisane „Konto usunięte”)',
  'tokeny powiadomień i listę zablokowanych osób',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('delete-my-account', { body: { password } });
      if (error) throw error;
      try { await signOut(); } catch { /* sesja już unieważniona */ }
      qc.clear();
      Alert.alert('Konto usunięte', 'Twoje konto i dane z aplikacji zostały usunięte. Dziękujemy, że byłeś(-aś) z nami.');
      router.replace('/(auth)/login');
    } catch (e) {
      Alert.alert('Nie udało się usunąć konta', friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    Alert.alert('Usunąć konto na zawsze?', 'Tej operacji nie można cofnąć.', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń konto', style: 'destructive', onPress: run },
    ]);
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: B.paper }}>
        <PageHeader title="Usuń konto" subtitle="Prywatność" showBack />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 15, lineHeight: 22, color: B.ink2, fontFamily: 'Manrope_500Medium' }}>
            Usuniesz swoje konto {user?.email ? `(${user.email}) ` : ''}w tym kościele. Zostaną usunięte:
          </Text>
          <View style={{ marginTop: 12, marginBottom: 16, gap: 8 }}>
            {GONE.map((g) => (
              <View key={g} style={{ flexDirection: 'row', gap: 10 }}>
                <Text style={{ fontSize: 15, color: B.danger, fontFamily: 'Manrope_700Bold' }}>•</Text>
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: B.ink2, fontFamily: 'Manrope_500Medium' }}>{g}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 13, lineHeight: 19, color: B.ink3, fontFamily: 'Manrope_500Medium', marginBottom: 22 }}>
            Dane w kartotece członków prowadzi Twój kościół — powiadomimy administratorów, żeby je usunęli, jeśli nie są już
            potrzebne. Pytania:{' '}
            <Text style={{ color: B.gold, fontFamily: 'Manrope_700Bold' }} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}>
              {SUPPORT_EMAIL}
            </Text>
            .
          </Text>

          <Text style={{ fontSize: 12, color: B.gold, marginBottom: 6, marginLeft: 2, letterSpacing: 1.2, fontFamily: 'Manrope_700Bold' }}>
            POTWIERDŹ HASŁEM
          </Text>
          <TextInput
            style={[fieldStyle, { marginBottom: 20 }]}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            placeholder="Twoje hasło"
            placeholderTextColor={B.ink4}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            accessibilityLabel="Hasło"
          />
          <Pressable
            onPress={confirm}
            disabled={!password || busy}
            accessibilityRole="button"
            className="active:opacity-80"
            style={{
              height: 52,
              borderRadius: 14,
              backgroundColor: B.danger,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !password || busy ? 0.45 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={{ color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_700Bold' }}>Usuń konto na zawsze</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

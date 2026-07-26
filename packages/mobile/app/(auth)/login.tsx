import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  universalLogin,
  sendPasswordReset,
  beginTwoFactor,
  type LoginTenant,
} from '../../src/lib/auth';
import { GradientAvatar } from '../../src/components/ui/GradientAvatar';
import { GradientButton } from '../../src/components/ui/GradientButton';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  // Gdy jeden e-mail jest w wielu kościołach — lista do wyboru.
  const [choices, setChoices] = useState<LoginTenant[] | null>(null);

  const submit = async (chosenTenant?: string) => {
    if (!email || !password) {
      Alert.alert('Brak danych', 'Wpisz email i hasło.');
      return;
    }
    setLoading(true);
    const trimmed = email.trim();
    const result = await universalLogin(
      trimmed,
      password,
      chosenTenant ? { tenant: chosenTenant } : undefined,
    );
    setLoading(false);
    if ('ok' in result) {
      setChoices(null);
      router.replace('/(auth)/biometric');
      return;
    }
    if ('multiple' in result) {
      // Konto w wielu kościołach — pokaż wybór.
      setChoices(result.multiple);
      return;
    }
    if ('requires2fa' in result) {
      // Tenant już rozwiązany — przekaż go razem z poświadczeniami do ekranu 2FA (w pamięci).
      beginTwoFactor(trimmed, password, result.tenant);
      router.replace('/(auth)/totp');
      return;
    }
    Alert.alert('Błąd logowania', result.error.message);
  };

  const handleLogin = () => submit();

  const handleReset = async () => {
    if (!email) {
      Alert.alert('Wpisz email', 'Podaj adres email aby zresetować hasło.');
      return;
    }
    const { error } = await sendPasswordReset(email.trim());
    if (error) Alert.alert('Błąd', error.message);
    else Alert.alert('Sprawdź pocztę', 'Wysłaliśmy link do resetu hasła.');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <GradientAvatar initial="S" size={80} rounded={false} />
        </View>

        <Text
          style={{
            fontSize: 28,
            color: '#0c0a09',
            textAlign: 'center',
            marginBottom: 6,
            letterSpacing: -0.6,
            fontFamily: 'Inter_700Bold',
          }}
        >
          Avenit
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: '#78716c',
            textAlign: 'center',
            marginBottom: 28,
            fontFamily: 'Inter_500Medium',
          }}
        >
          {choices ? 'Wybierz swój kościół' : 'Zaloguj się do aplikacji'}
        </Text>

        {choices && (
          <View style={{ gap: 10 }}>
            {choices.map((c) => (
              <Pressable
                key={c.slug}
                onPress={() => submit(c.slug)}
                disabled={loading}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#eef0f3',
                  backgroundColor: '#fafaf9',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: '#0c0a09',
                    fontFamily: 'Inter_600SemiBold',
                  }}
                >
                  {c.name}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setChoices(null)}
              disabled={loading}
              style={{ paddingVertical: 10 }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#78716c',
                  fontFamily: 'Inter_500Medium',
                }}
              >
                Wróć
              </Text>
            </Pressable>
          </View>
        )}

        {!choices && (
        <View
          style={{
            borderRadius: 20,
            backgroundColor: '#ffffff',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.05,
            shadowRadius: 14,
            elevation: 2,
          }}
        >
          <View
            style={{
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#eef0f3',
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: '#57534e',
                marginBottom: 6,
                fontFamily: 'Inter_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Email
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#eef0f3',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: '#0c0a09',
                backgroundColor: '#fafaf9',
                marginBottom: 14,
                fontFamily: 'Inter_500Medium',
              }}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="ty@avenit.pl"
              placeholderTextColor="#a8a29e"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text
              style={{
                fontSize: 12,
                color: '#57534e',
                marginBottom: 6,
                fontFamily: 'Inter_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Hasło
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#eef0f3',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: '#0c0a09',
                backgroundColor: '#fafaf9',
                marginBottom: 18,
                fontFamily: 'Inter_500Medium',
              }}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#a8a29e"
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />

            <View style={{ marginBottom: 12 }}>
              <GradientButton onPress={handleLogin} loading={loading}>
                Zaloguj
              </GradientButton>
            </View>

            <Pressable onPress={handleReset} disabled={loading}>
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 13,
                  color: '#be185d',
                  fontFamily: 'Inter_600SemiBold',
                }}
              >
                Nie pamiętam hasła
              </Text>
            </Pressable>
          </View>
        </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

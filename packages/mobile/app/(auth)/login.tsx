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
import { Image } from 'expo-image';
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
      style={{ flex: 1, backgroundColor: '#F6F4EE' }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 22, gap: 18 }}>
          <Image source={require('../../assets/brand/znak-kurkuma.png')} style={{ width: 76, height: 76 }} contentFit="contain" />
          <Image
            source={require('../../assets/brand/logo-slod.png')}
            style={{ width: 137, height: 36 }}
            contentFit="contain"
            accessibilityLabel="avenit"
          />
        </View>
        <Text
          style={{
            fontSize: 14,
            color: '#6B6557',
            textAlign: 'center',
            marginBottom: 28,
            fontFamily: 'Manrope_500Medium',
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
                  borderColor: '#E6E1D5',
                  backgroundColor: '#F1EEE6',
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    color: '#2A2312',
                    fontFamily: 'Manrope_600SemiBold',
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
                  color: '#6B6557',
                  fontFamily: 'Manrope_500Medium',
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
            backgroundColor: '#F6F4EE',
            shadowColor: '#2A2312',
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
              borderColor: '#E6E1D5',
              padding: 20,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: '#4A463E',
                marginBottom: 6,
                fontFamily: 'Manrope_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Email
            </Text>
            <TextInput
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
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="ty@avenit.pl"
              placeholderTextColor="#857F70"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />

            <Text
              style={{
                fontSize: 12,
                color: '#4A463E',
                marginBottom: 6,
                fontFamily: 'Manrope_600SemiBold',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              Hasło
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: '#E6E1D5',
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 15,
                color: '#2A2312',
                backgroundColor: '#F1EEE6',
                marginBottom: 18,
                fontFamily: 'Manrope_500Medium',
              }}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#857F70"
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
                  color: '#8A6606',
                  fontFamily: 'Manrope_600SemiBold',
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
